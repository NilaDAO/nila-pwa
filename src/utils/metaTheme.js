import { useEffect } from 'react';

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

// The status bar per screen (13 Nov; Android draws it in this colour, an iPhone draws the page under it): the map's
// ground green while a map fills the screen, else the dark of the app's screens (their top, the registration gradient's
// start). Set while the screen is open, the dark back when it closes.
export const STATUS = { dark: '#121212', map: '#25361f' };
export function useStatusBar(color, on = true) {
  useEffect(() => {
    if (!on) return undefined;
    setMetaThemeColor(color);
    return () => setMetaThemeColor(STATUS.dark);
  }, [color, on]);
}
