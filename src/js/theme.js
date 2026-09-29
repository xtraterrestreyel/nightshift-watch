// Light / dark theme. Dark is the default everywhere; a visitor's choice is remembered.
const KEY = 'nightshift.theme';

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function updateButtons() {
  const light = currentTheme() === 'light';
  document.querySelectorAll('[data-theme-toggle]').forEach(b => {
    const label = light ? 'Switch to dark mode' : 'Switch to light mode';
    b.setAttribute('aria-label', label);
    b.setAttribute('title', label);
  });
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  try { localStorage.setItem(KEY, theme); } catch (e) { /* storage blocked */ }
  updateButtons();
}

export function initThemeToggle() {
  document.querySelectorAll('[data-theme-toggle]').forEach(b => {
    b.addEventListener('click', () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light'));
  });
  updateButtons();
}