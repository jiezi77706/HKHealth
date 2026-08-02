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
    const { tool, params } = req.body;
    if (!tool) {
      res.status(400).json({ error: 'Missing tool name' });
      return;
    }

    const upstream = await fetch(`${TOOLHUB_URL}/api/tools/${tool}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Name': TOOLHUB_APP_NAME,
        'App-Key': TOOLHUB_APP_KEY
      },
      body: JSON.stringify(params || {})
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
