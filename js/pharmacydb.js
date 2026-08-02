let pharmacies = [];
let loading = null;

export async function initPharmacyDB() {
  if (pharmacies.length) return;
  if (loading) return loading;
  loading = fetch('/data/pharmacies.json').then(r => r.json()).then(d => { pharmacies = d; });
  return loading;
}

export function searchPharmacies({ district, query, limit = 10 } = {}) {
  let results = [...pharmacies];

  if (district) {
    const d = district.toUpperCase();
    results = results.filter(p => p.district.toUpperCase().includes(d));
  }

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.nameZh.includes(q) ||
      p.addr.toLowerCase().includes(q) ||
      p.district.toLowerCase().includes(q)
    );
  }

  return results.slice(0, limit);
}

export function getAllDistricts() {
  const counts = {};
  for (const p of pharmacies) {
    counts[p.district] = (counts[p.district] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

export function getPharmacyCount() { return pharmacies.length; }
