import type { ReactNode } from 'react';

export default function EvLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-1">{children}</div>
      <footer className="mt-8 p-4 border-t">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="text-xs text-gray-500">Share this event</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/qrcode" alt="QR" width={96} height={96} className="border rounded" />
        </div>
      </footer>
    </div>
  );
}


