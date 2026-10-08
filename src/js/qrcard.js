// Branded Night Shift QR card: logo on top, blue QR with the logo in the center,
// website and rep code underneath. Uses the highest error correction (H) so the
// center logo never stops the code from scanning.
import QRCode from 'qrcode';

const LOGO_SRC = 'brand/night-shift-logo.png';
let logoPromise = null;

function loadLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = LOGO_SRC;
    });
  }
  return logoPromise;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Draws the card at 600 x 760 (times scale). Returns the canvas.
export async function drawQrCard(canvas, { link, code, scale = 2 }) {
  const W = 600, H = 760;
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* ignore */ }
  const logo = await loadLogo();

  // Background: deep navy with a blue glow behind the logo and the code
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#071a33'); bg.addColorStop(1, '#030a15');
  roundRect(ctx, 0, 0, W, H, 34); ctx.fillStyle = bg; ctx.fill();
  ctx.save(); roundRect(ctx, 0, 0, W, H, 34); ctx.clip();
  for (const [cx, cy, r, a] of [[W / 2, 95, 300, 0.30], [W / 2, 410, 320, 0.22]]) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(30,144,255,${a})`); g.addColorStop(1, 'rgba(30,144,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 33); ctx.strokeStyle = 'rgba(80,170,255,.45)'; ctx.lineWidth = 2; ctx.stroke();

  // Logo across the top
  if (logo) {
    const lw = 500, lh = lw * logo.height / logo.width;
    ctx.drawImage(logo, (W - lw) / 2, (196 - lh) / 2, lw, lh);
  } else {
    ctx.fillStyle = '#9fdcff'; ctx.font = '700 54px Sora, Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('NIGHT SHIFT', W / 2, 120);
  }

  // White panel for the code
  const panel = 420, px = (W - panel) / 2, py = 196;
  ctx.save();
  ctx.shadowColor = 'rgba(30,144,255,.55)'; ctx.shadowBlur = 34;
  roundRect(ctx, px, py, panel, panel, 26); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();

  // QR modules
  const qr = QRCode.create(link, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size, data = qr.modules.data;
  const pad = 24, area = panel - pad * 2, cell = area / n, ox = px + pad, oy = py + pad;
  const isFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  // Center badge size (kept under 10% of the code so it always scans)
  const bw = area * 0.50, bh = bw * 0.30;
  const bx = ox + (area - bw) / 2, by = oy + (area - bh) / 2;
  const underBadge = (r, c) => {
    const x = ox + c * cell, y = oy + r * cell;
    return x + cell > bx - 4 && x < bx + bw + 4 && y + cell > by - 4 && y < by + bh + 4;
  };

  const dots = ctx.createLinearGradient(ox, oy, ox + area, oy + area);
  dots.addColorStop(0, '#041d45'); dots.addColorStop(1, '#0844a0');
  ctx.fillStyle = dots;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!data[r * n + c] || isFinder(r, c) || underBadge(r, c)) continue;
      roundRect(ctx, ox + c * cell + cell * 0.05, oy + r * cell + cell * 0.05, cell * 0.9, cell * 0.9, cell * 0.25);
      ctx.fill();
    }
  }

  // Corner squares in brand blue
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = ox + c * cell, y = oy + r * cell, s = cell * 7;
    roundRect(ctx, x, y, s, s, cell * 1.3); ctx.fillStyle = '#0a4cb4'; ctx.fill();
    roundRect(ctx, x + cell, y + cell, s - cell * 2, s - cell * 2, cell * 0.8); ctx.fillStyle = '#ffffff'; ctx.fill();
    roundRect(ctx, x + cell * 2, y + cell * 2, cell * 3, cell * 3, cell * 0.6); ctx.fillStyle = '#041a3a'; ctx.fill();
  }

  // Logo badge in the center
  ctx.save();
  ctx.shadowColor = 'rgba(11,94,215,.5)'; ctx.shadowBlur = 12;
  roundRect(ctx, bx, by, bw, bh, bh * 0.32); ctx.fillStyle = '#04101f'; ctx.fill();
  ctx.restore();
  roundRect(ctx, bx, by, bw, bh, bh * 0.32); ctx.strokeStyle = '#2a8cff'; ctx.lineWidth = 2; ctx.stroke();
  // Logo centered in the badge (the logo file is trimmed tight, so this is true center)
  if (logo) {
    const iw = bw - 22, ih = iw * logo.height / logo.width;
    ctx.drawImage(logo, bx + (bw - iw) / 2, by + (bh - ih) / 2, iw, ih);
  }

  // Words underneath
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff'; ctx.font = '600 25px Sora, Arial, sans-serif';
  ctx.fillText('Scan to see Night Shift in action', W / 2, 668);
  ctx.fillStyle = '#7cc8ff'; ctx.font = '600 19px Sora, Arial, sans-serif';
  ctx.fillText('nightshift.watch', W / 2, 700);
  if (code) {
    ctx.fillStyle = 'rgba(200,220,240,.6)'; ctx.font = '500 14px Sora, Arial, sans-serif';
    ctx.fillText('Rep code ' + code, W / 2, 732);
  }
  return canvas;
}