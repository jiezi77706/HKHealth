export async function callTool(tool, args) {
  const resp = await fetch('/api/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Tool call failed: ${resp.status}`);
  }
  return resp.json();
}

export async function planRoute(origin, destination, mode = 'transit') {
  const args = { mode, language: 'zh-HK' };

  if (typeof origin === 'string') args.origin = origin;
  else { args.origin_lat = origin.lat; args.origin_lng = origin.lng; }

  if (typeof destination === 'string') args.destination = destination;
  else { args.dest_lat = destination.lat; args.dest_lng = destination.lng; }

  const result = await callTool('transport_route', args);
  return result?.data || result;
}

export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { timeout: 10000, maximumAge: 60000 }
    );
  });
}

export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}分钟`;
  const h = Math.floor(m / 60);
  return `${h}小时${m % 60}分钟`;
}

export function formatDistance(meters) {
  if (meters < 1000) return `${meters}米`;
  return `${(meters / 1000).toFixed(1)}公里`;
}
