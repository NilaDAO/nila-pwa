// Design tokens (nila-design tokens.json). Inline styles, not Tailwind: tailwind.config.js does not
// scan these folders, and the live build must not change.
export const C = {
  ink: '#121212', raised: '#1f2733', text: '#f1f5f9', muted: '#94a3b8', accent: '#d4cf5a',
  gold: '#d4a634', coral: '#E69283', ground: '#0d1117',
};
export const R = { card: 24, button: 12, round: 9999 };
export const S = { gutter: 8, inline: 10, stack: 14, sheet: 18 };
export const FONT = "'Inter', system-ui, sans-serif";
export const SHADOW = 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px';
export const TAB_BAR_HEIGHT = 72;

/** Inter 400/700, loaded only when the new shell mounts (flag on). */
export function loadInter() {
  if (document.getElementById('nila-inter')) return;
  const l = document.createElement('link');
  l.id = 'nila-inter';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap';
  document.head.appendChild(l);
}
