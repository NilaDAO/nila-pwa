const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY 
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL 

// Add these helpers
export async function getSubscriptionStatus() {
  const permission = (typeof Notification !== 'undefined') ? Notification.permission : 'default';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, permission, hasSub: false };
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return {
    supported: true,
    permission,
    hasSub: !!sub,
    endpoint: sub?.endpoint,
    // keys only if the subscription exists (useful to resync with backend)
    keys: sub ? {
      p256dh: sub.toJSON()?.keys?.p256dh,
      auth: sub.toJSON()?.keys?.auth
    } : undefined
  };
}

// Optional: ensure server is in sync without re-subscribing
export async function syncSubscription(address) {
  const status = await getSubscriptionStatus();
  if (!status.hasSub) return false;
  const url = `${API_BASE_URL}/utils/save-subscription`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({
      address,
      subscription: {
        endpoint: status.endpoint,
        keys: status.keys
      }
    })
  });
  return true;
}

export async function unsubscribeUser(address) {
  // watch out, doesnt work in localhost
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push not supported in this browser');
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    console.log('no active subscription');
    return { supported: true, hadSubscription: false };
  }
  try {
    const ok = await sub.unsubscribe();
    if (!ok) throw new Error('unsubscribe failed');
    // tell your server to remove it
    const url = `${API_BASE_URL}/utils/delete-subscription`;
    await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        address: address // only address is needed to delete the subscription
      })
    })
    console.log('unsubscribed');
    return { supported: true, hadSubscription: true };
  } catch (e) {
    console.error('unsubscribe error', e);
    throw e;
  }
}

export async function subscribeUser(address) {
  console.log('subscribe user to notifications', address)
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push not supported');
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  console.log('serviceWorker ready?', registration)
  try {
    if (!VAPID_PUBLIC_KEY) throw new Error('REACT_APP_VAPID_PUBLIC_KEY is not set');
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });
    console.log('subscription', subscription)
    // Send subscription to backend
    const url = `${API_BASE_URL}/utils/save-subscription`;
      await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        subscription,
        address: address
      })
    })
    return 0; // success
  } catch (e){
    console.error('pushmanager subscribe error', e)
    if (e.name === 'InvalidStateError') {
      console.warn('Push subscription failed: InvalidStateError');
      return 1 // unknown error

    } else if (e.name === 'NotAllowedError') {
      console.warn('Push subscription failed: NotAllowedError');
      return 2 // user has explicit denied, tell to manually enable
    } else {
      console.error('Push subscription failed:', e);
      return 3 // unknown error 
    }
  }
}

// helper
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
