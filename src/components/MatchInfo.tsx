"use client";

import { useEffect, useState } from "react";

type Event = {
  id: string;
  code: string;
  name?: string | null;
  date?: string | null;
  startTime?: string | null;
  durationMinutes?: number | null;
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function MatchInfo({ eventCode, title }: { eventCode?: string; title?: string }) {
  const [eventData, setEventData] = useState<Event | null>(null);
  const [countdown, setCountdown] = useState<string>("--:--:--");

  useEffect(() => {
    if (!eventCode) return;
    const loadEvent = async () => {
      try {
        const r = await fetch(`/api/events?code=${encodeURIComponent(eventCode)}`);
        if (r.ok) {
          const e = await r.json();
          setEventData(e);
        }
      } catch {}
    };
    loadEvent();
  }, [eventCode]);

  useEffect(() => {
    if (!eventData?.date || !eventData?.startTime) return;
    
    const updateCountdown = () => {
      try {
        const [day, month, year] = eventData.date!.split('T')[0].split('-').map(Number);
        const [hour, minute] = eventData.startTime!.split(':').map(Number);
        const matchDate = new Date(year, month - 1, day, hour, minute);
        const now = new Date();
        const diff = matchDate.getTime() - now.getTime();
        setCountdown(formatCountdown(diff));
      } catch {
        setCountdown("--:--:--");
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [eventData]);

  if (!eventData) return null;

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('tr-TR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  const subtitle = [
    eventData.date ? formatDate(eventData.date) : null,
    eventData.startTime,
    eventData.durationMinutes ? `${eventData.durationMinutes} min` : null
  ].filter(Boolean).join(' • ');

  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        {title && <h1 className="text-xl font-semibold">{title}</h1>}
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <div className="bg-gray-100 px-3 py-1 rounded-lg text-sm font-mono text-gray-700">
        {countdown}
      </div>
    </div>
  );
}
