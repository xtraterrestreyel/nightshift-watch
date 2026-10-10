// Phone menu for the site header. On small screens the header links are hidden to save
// room, so this adds a menu button that opens them in a dropdown.
export function initMobileMenu() {
  const header = document.querySelector('.glass-nav');
  const nav = header && header.querySelector('.nav-links');
  if (!nav || header.querySelector('.menu-btn')) return;
  const links = [...nav.querySelectorAll('a:not(.btn-m)')];
  if (!links.length) return;

  const panel = document.createElement('div');
  panel.className = 'mobile-menu';
  panel.id = 'mobileMenu';
  panel.hidden = true;
  panel.innerHTML = links.map(a => `<a href="${a.getAttribute('href')}">${a.textContent}</a>`).join('');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menu-btn';
  btn.setAttribute('aria-label', 'Open menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'mobileMenu');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path class="l1" d="M4 7h16"/><path class="l2" d="M4 12h16"/><path class="l3" d="M4 17h16"/></svg>';
  nav.appendChild(btn);
  header.appendChild(panel);

  const setOpen = (open) => {
    panel.hidden = !open;
    header.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(panel.hidden); });
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('click', (e) => { if (!header.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  window.addEventListener('resize', () => { if (window.innerWidth > 760) setOpen(false); });
}