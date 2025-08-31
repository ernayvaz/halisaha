"use client";

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  preventDefault: () => void;
}

export default function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as BeforeInstallPromptEvent;
      ev.preventDefault();
      setPromptEvent(ev);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  if (!visible) return null;

  const onInstall = async () => {
    try {
      await promptEvent?.prompt();
    } finally {
      setVisible(false);
    }
  };

  return (
    <div className="fixed bottom-4 inset-x-0 flex justify-center pointer-events-none">
      <div className="pointer-events-auto bg-white dark:bg-black border rounded shadow p-3 flex gap-2 items-center">
        <span className="text-sm">Uygulamayı ana ekrana eklemek ister misin?</span>
        <button onClick={onInstall} className="text-sm px-3 py-1 rounded bg-green-600 text-white">Yükle</button>
        <button onClick={() => setVisible(false)} className="text-sm px-3 py-1 rounded border">Kapat</button>
      </div>
    </div>
  );
}


