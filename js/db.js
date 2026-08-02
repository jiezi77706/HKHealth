function _get(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } }
function _set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
export function now() { return new Date().toISOString(); }
export function timeStr() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
export function dateStr(iso) { return new Date(iso).toLocaleString('zh-HK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export const db = {
  getEvents()    { return _get('hk_health_events'); },
  saveEvent(e)   { const all = this.getEvents(); all.unshift(e); _set('hk_health_events', all); },
  updateEvent(id, patch) {
    const all = this.getEvents();
    const i = all.findIndex(e => e.id === id);
    if (i >= 0) { Object.assign(all[i], patch); _set('hk_health_events', all); }
  },
  getBriefs()    { return _get('hk_visit_briefs'); },
  saveBrief(b)   { const all = this.getBriefs(); all.unshift(b); _set('hk_visit_briefs', all); },
};
