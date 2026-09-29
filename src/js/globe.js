// Rotating dot globe for the visitor counter, adapted from the COOKd DotGlobe.
// Every dot is a real land position. Dots near where visitors come from light up.
// Loaded only when someone opens the counter, so it never slows down the page.
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';

const TAU = Math.PI * 2;
const ROTATION_PER_FRAME = 0.0035;
const GLOBE_FRAC = 0.44;
const HIGHLIGHT_DEG = 1.6; // light up land dots within this many degrees of a visitor location

function latLngToXYZ(latDeg, lngDeg) {
  const lat = (latDeg * Math.PI) / 180;
  const lng = (lngDeg * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lng), Math.sin(lat), Math.cos(lat) * Math.sin(lng)];
}

// ---------- Land dots (built once per page load) ----------
let landCache = null;
function getLandPoints() {
  if (landCache) return landCache;
  const land = feature(landTopo, landTopo.objects.land);
  const W = 360, H = 180;
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const ctx = off.getContext('2d');
  const proj = geoEquirectangular().scale(W / TAU).translate([W / 2, H / 2]);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  geoPath(proj, ctx)(land);
  ctx.fill();
  const px = ctx.getImageData(0, 0, W, H).data;
  const list = [];
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    if (Math.abs(lat) > 82) continue; // skip crowded polar dots
    for (let x = 0; x < W; x++) {
      if (px[(y * W + x) * 4] > 128) {
        const lng = ((x + 0.5) / W) * 360 - 180;
        list.push(...latLngToXYZ(lat, lng));
      }
    }
  }
  landCache = new Float32Array(list);
  return landCache;
}

// Map each land dot to a highlight strength (0 = none) from visitor locations.
function buildHighlights(points, targets) {
  const strength = new Map();
  if (!targets.length) return strength;
  const maxCount = Math.max(...targets.map(t => t.count || 1));
  const cosLimit = Math.cos((HIGHLIGHT_DEG * Math.PI) / 180);
  for (const t of targets) {
    const [tx, ty, tz] = latLngToXYZ(t.lat, t.lng);
    const s = 0.55 + 0.45 * (Math.log(1 + (t.count || 1)) / Math.log(1 + maxCount));
    let best = 0, bestDot = -Infinity, hits = 0;
    for (let i = 0; i < points.length; i += 3) {
      const d = points[i] * tx + points[i + 1] * ty + points[i + 2] * tz;
      if (d > bestDot) { bestDot = d; best = i; }
      if (d >= cosLimit) { strength.set(i, Math.max(strength.get(i) || 0, s)); hits++; }
    }
    if (!hits) strength.set(best, Math.max(strength.get(best) || 0, s)); // tiny places: nearest dot
  }
  return strength;
}

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    land: light ? 'rgba(10, 26, 43, 0.28)' : 'rgba(234, 244, 255, 0.55)',
    lit: (cs.getPropertyValue('--ice').trim() || '#8FDBFF'),
    litLight: (cs.getPropertyValue('--brand').trim() || '#1467B3'),
    glow: (cs.getPropertyValue('--glacier').trim() || '#2F7FD8'),
    light
  };
}

// ---------- Public API ----------
export function createGlobe(canvas, size) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const points = getLandPoints();
  let lit = new Map();
  let colors = readColors();
  let phi = Math.PI; // start with North America facing the viewer
  let frame = 0;
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

  const cx = size / 2, cy = size / 2, r = size * GLOBE_FRAC;
  const DOT = Math.max(0.75, size / 380);

  const themeWatch = new MutationObserver(() => { colors = readColors(); if (reduced) draw(); });
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const glow = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.22);
    glow.addColorStop(0, 'rgba(0,0,0,0)');
    glow.addColorStop(0.6, colors.light ? 'rgba(95,168,236,0.10)' : 'rgba(47,127,216,0.16)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.22, 0, TAU); ctx.fill();

    const c = Math.cos(phi), s = Math.sin(phi);

    // Pass 1: plain land dots, batched into one fill
    ctx.fillStyle = colors.land;
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 3) {
      if (lit.has(i)) continue;
      const rz = -points[i] * s + points[i + 2] * c;
      if (rz < 0) continue; // far side of the globe
      const sx = cx - (points[i] * c + points[i + 2] * s) * r;
      const sy = cy - points[i + 1] * r;
      ctx.moveTo(sx + DOT, sy);
      ctx.arc(sx, sy, DOT, 0, TAU);
    }
    ctx.fill();

    // Pass 2: lit dots where visitors are, drawn larger with a soft halo
    const litColor = colors.light ? colors.litLight : colors.lit;
    for (const [i, str] of lit) {
      const rz = -points[i] * s + points[i + 2] * c;
      if (rz < 0) continue;
      const sx = cx - (points[i] * c + points[i + 2] * s) * r;
      const sy = cy - points[i + 1] * r;
      const rad = DOT * (1.6 + 1.2 * str);
      ctx.globalAlpha = 0.22 * str;
      ctx.fillStyle = litColor;
      ctx.beginPath(); ctx.arc(sx, sy, rad * 2.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.55 + 0.45 * str;
      ctx.beginPath(); ctx.arc(sx, sy, rad, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    phi += ROTATION_PER_FRAME;
    draw();
    frame = requestAnimationFrame(loop);
  }

  return {
    setTargets(targets) { lit = buildHighlights(points, targets); draw(); },
    start() { cancelAnimationFrame(frame); if (reduced) draw(); else frame = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(frame); },
    destroy() { cancelAnimationFrame(frame); themeWatch.disconnect(); }
  };
}