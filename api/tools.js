export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { TOOLHUB_URL, TOOLHUB_APP_NAME, TOOLHUB_APP_KEY } = process.env;
  if (!TOOLHUB_APP_NAME || !TOOLHUB_APP_KEY) {
    res.status(503).json({ error: 'Toolhub credentials not configured' });
    return;
  }

  try {
    const { tool, args } = req.body;
    if (!tool) {
      res.status(400).json({ error: 'Missing tool name' });
      return;
    }

    const rpcBody = {
      jsonrpc: '2.0',
      method: 'tools/call',
      id: Date.now(),
      params: { name: tool, arguments: args || {} }
    };

    const upstream = await fetch(`${TOOLHUB_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'App-Name': TOOLHUB_APP_NAME,
        'App-Key': TOOLHUB_APP_KEY
      },
      body: JSON.stringify(rpcBody)
    });

    const raw = await upstream.text();
    let result = null;
    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.result?.structuredContent) {
          result = parsed.result.structuredContent;
        } else if (parsed.result?.content) {
          try { result = JSON.parse(parsed.result.content[0].text); } catch {}
        }
        if (parsed.error) {
          res.status(400).json({ error: parsed.error.message });
          return;
        }
      }
    }

    res.status(200).json(result || { error: 'No result' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
