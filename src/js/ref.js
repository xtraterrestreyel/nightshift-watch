// Remembers which rep's link brought a visitor here, for 90 days (first link wins).
const KEY = 'nightshift.ref';
const DAYS = 90;
const VALID = /^[A-Z]{3,10}\d{4}$/;

export function captureRef() {
  let fromUrl = null;
  try {
    const p = new URLSearchParams(location.search).get('ref');
    if (p && VALID.test(p.toUpperCase())) fromUrl = p.toUpperCase();
  } catch (e) { /* ignore */ }
  const current = getRef();
  if (fromUrl && !current) {
    try { localStorage.setItem(KEY, JSON.stringify({ code: fromUrl, at: Date.now() })); } catch (e) { /* ignore */ }
  }
  return { fromUrl, code: getRef() };
}

export function getRef() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && VALID.test(v.code) && Date.now() - v.at < DAYS * 86400000) return v.code;
    if (v) localStorage.removeItem(KEY);
  } catch (e) { /* ignore */ }
  return null;
}

export function visitorId() {
  try {
    let vid = localStorage.getItem('nightshift.vid');
    if (!vid) {
      vid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('nightshift.vid', vid);
    }
    return vid;
  } catch (e) { return null; }
}