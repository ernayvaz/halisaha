"use client";

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('serviceWorker' in navigator) {
      const register = async () => {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js');
          // Force an update check so new SW takes control quickly after deploy
          try { await reg.update(); } catch {}

          // Web Push subscription WITHOUT prompting the user.
          // Only subscribe if permission was already granted earlier.
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
              if (vapid) {
                const sub = await (await navigator.serviceWorker.ready).pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(vapid),
                });
                await fetch('/api/notifications/subscribe', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(sub),
                });
              }
            }
          } catch {}
        } catch {
          // ignore
        }
      };
      register();
    }
  }, []);
  return null;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}


