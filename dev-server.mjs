import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3456;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

let env = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
  raw.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
  });
} catch {}

const server = http.createServer(async (req, res) => {
  // Toolhub proxy
  if (req.url === '/api/tools' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      if (!env.TOOLHUB_APP_NAME || !env.TOOLHUB_APP_KEY) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Toolhub credentials not configured' }));
        return;
      }
      try {
        const { tool, params } = JSON.parse(body);
        const upstream = await fetch(`${env.TOOLHUB_URL || 'https://hkgai-studio.prod.hkchat.app'}/api/tools/${tool}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'App-Name': env.TOOLHUB_APP_NAME,
            'App-Key': env.TOOLHUB_APP_KEY
          },
          body: JSON.stringify(params || {})
        });
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(await upstream.json()));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Chat API proxy
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        if (!parsed.model) parsed.model = env.LLM_MODEL || 't2_hkgai-v3_fp8_1m_e7';

        const upstream = await fetch(env.LLM_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.LLM_API_KEY}` },
          body: JSON.stringify(parsed),
        });

        if (!upstream.ok) {
          res.writeHead(upstream.status); res.end(await upstream.text()); return;
        }

        if (parsed.stream) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }
          res.end();
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(await upstream.json()));
        }
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static files
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`Dev server: http://localhost:${PORT}`));
