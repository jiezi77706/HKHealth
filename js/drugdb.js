let drugs = [];
let loading = null;

export async function initDrugDB() {
  if (drugs.length) return;
  if (loading) return loading;
  loading = fetch('/data/drugs.json').then(r => r.json()).then(d => { drugs = d; });
  return loading;
}

export function searchDrugs(query, limit = 8) {
  if (!query || !drugs.length) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];

  for (const d of drugs) {
    const name = d.n.toLowerCase();
    const ings = d.i.map(x => x.toLowerCase());
    let score = 0;

    for (const t of terms) {
      if (name === t) score += 100;
      else if (name.startsWith(t)) score += 70;
      else if (name.includes(t)) score += 50;
      else if (ings.some(ig => ig === t)) score += 80;
      else if (ings.some(ig => ig.includes(t))) score += 40;
      else if (d.p.toLowerCase() === t) score += 90;
    }
    if (score > 0) results.push({ ...d, _score: score });
  }

  results.sort((a, b) => b._score - a._score);
  return results.slice(0, limit);
}

export function getSaleCatInfo(cat) {
  const map = {
    POM:     { label: '处方药 Prescription Only', short: 'POM', cls: 'cat-pom',
               tip: '需要医生处方，在注册药房凭处方购买' },
    P:       { label: '药剂师监管 Pharmacy Only', short: 'P', cls: 'cat-p',
               tip: '需在注册药剂师在场的药房购买，无需处方' },
    OTC:     { label: '非处方药 Over-the-Counter', short: 'OTC', cls: 'cat-otc',
               tip: '可在药房或药行自行购买' },
    unknown: { label: '未分类', short: '?', cls: 'cat-unk',
               tip: '销售类别未确定，建议咨询药剂师' }
  };
  return map[cat] || map.unknown;
}
