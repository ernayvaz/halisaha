"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function ProfileButton() {
  const [label, setLabel] = useState<string | null>(null);
  
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/me');
        if (!r.ok) return;
        const me = await r.json();
        if (alive) setLabel((me.displayName||me.handle||'?').slice(0,1).toUpperCase());
      } catch {}
    })();
    return () => { alive = false; };
  }, []);
  
  if (!label) return null;
  
  return (
    <Link href="/me" className="fixed top-3 right-3 w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold" aria-label="Open profile">
      {label}
    </Link>
  );
}
