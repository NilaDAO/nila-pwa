const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

export function register(config) {
  const enableDevSw = process.env.REACT_APP_ENABLE_SW_DEV === 'true';
  const isDev = process.env.NODE_ENV !== 'production';
  if ((process.env.NODE_ENV === 'production' || enableDevSw) && 'serviceWorker' in navigator) {
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    if (publicUrl.origin !== window.location.origin) return;

    window.addEventListener('load', () => {
      const swUrl = (enableDevSw && isDev)
        ? `${process.env.PUBLIC_URL}/nila-sw-dev.js`
        : `${process.env.PUBLIC_URL}/nila-sw.js`;

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // re-emit an event or set state so install UI can re-check eligibility
        window.dispatchEvent(new Event('nila:sw-controlled'));
      });
      
      if (isLocalhost) {
        checkValidServiceWorker(swUrl, config);
        navigator.serviceWorker.ready.then(() => {
          console.log('✅ Local SW ready. Dev mode: cache-first strategy active.');
        });
      } else {
        registerValidSW(swUrl, config);
      }
    });
  }
};

navigator.serviceWorker.addEventListener('message', (evt) => {
  if (evt.data?.type === 'APP_UPDATED') {
    const { version, forceLogout } = evt.data;
    console.info(`🌟 New app version: ${version}`);
    if (forceLogout) {
      // 1) clear all workbox caches
      caches.keys().then(keys =>
        Promise.all(keys.map(key => caches.delete(key)))
      ).then(() => {
        // 2) optionally wipe any client‐side state here, then
        window.location.reload();
      });
    }
  }

  if (evt.data?.type === 'PUSH_RECEIVED') {
    console.info('🔔 Push received in page', evt.data);
  }
});

// serviceWorkerRegistration.js
export function registerValidSW(swUrl, cfg) {
  navigator.serviceWorker
    .register(swUrl)
    .then(reg => {
      console.log('✅ SW registered');

      // ① a new SW is found
      reg.onupdatefound = () => {
        const newSW = reg.installing;
        if (!newSW) return;

        newSW.onstatechange = () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('🔁 New build ready … activating');

            // ② tell the waiting worker to activate NOW
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });

            // ③ when it becomes the controller, hard-reload
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              console.log('✨ New SW controlling page, reloading');
              window.location.reload();           // no param needed; boolean flag is deprecated
            });
          }
        };
      };
    })
    .catch(err => console.error('❌ SW reg failed', err));
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && !contentType.includes('javascript'))
      ) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            console.warn('🧹 No valid SW found. Unregistering and reloading...');
            window.location.reload();
          });
        });
      } else {
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('⚠️ No internet connection. Running in offline mode.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => registration.unregister())
      .catch((error) => console.error(error.message));
  }
}
