// Slow-rising frost particles for the animated background
export function makeFlakes(holderId = 'flakes') {
  const holder = document.getElementById(holderId);
  if (!holder) return;
  const count = window.innerWidth < 700 ? 10 : 18;
  for (let i = 0; i < count; i++) {
    const f = document.createElement('span');
    const size = 2 + Math.random() * 3;
    f.className = 'flake';
    f.style.left = (Math.random() * 100) + '%';
    f.style.width = size + 'px';
    f.style.height = size + 'px';
    f.style.animationDuration = (22 + Math.random() * 26) + 's';
    f.style.animationDelay = (-Math.random() * 40) + 's';
    f.style.setProperty('--dx', ((Math.random() - 0.5) * 120) + 'px');
    f.style.setProperty('--o', (0.2 + Math.random() * 0.35).toFixed(2));
    holder.appendChild(f);
  }
}