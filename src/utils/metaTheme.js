// src/utils/metaTheme.js
export function setMetaThemeColor(color) {
  // update meta tag
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);

  // mirror to CSS variable for overlays (header::before and .statusbar-cover)
  document.documentElement.style.setProperty('--statusbar-color', color);
}
