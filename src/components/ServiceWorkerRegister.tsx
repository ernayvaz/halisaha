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
        } catch {
          // ignore
        }
      };
      register();
    }
  }, []);
  return null;
}


