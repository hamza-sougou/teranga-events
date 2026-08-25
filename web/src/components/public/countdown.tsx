'use client';

import { useEffect, useState } from 'react';

interface CountdownProps {
  startAt: string;
  endAt: string;
}

function diffParts(targetMs: number, nowMs: number) {
  const totalSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-black tabular-nums text-on-dark">{String(value).padStart(2, '0')}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-on-dark-muted">{label}</span>
    </div>
  );
}

// Never shows a negative countdown — three explicit states instead: counting
// down to doors-open, currently happening, or already over.
export function Countdown({ startAt, endAt }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();

  if (now > endMs) {
    return (
      <div className="rounded-card border-[1.5px] border-white/20 bg-overlay px-4 py-3 text-center text-[13px] font-bold text-on-dark backdrop-blur-sm">
        Évènement terminé
      </div>
    );
  }

  if (now >= startMs) {
    return (
      <div className="rounded-card border-[1.5px] border-white/20 bg-overlay px-4 py-3 text-center text-[13px] font-bold text-on-dark backdrop-blur-sm">
        Évènement en cours
      </div>
    );
  }

  const { days, hours, minutes, seconds } = diffParts(startMs, now);

  return (
    <div className="flex gap-3 rounded-card border-[1.5px] border-white/20 bg-overlay px-4 py-3 backdrop-blur-sm">
      <Unit value={days} label="Jours" />
      <Unit value={hours} label="Heures" />
      <Unit value={minutes} label="Min" />
      <Unit value={seconds} label="Sec" />
    </div>
  );
}
