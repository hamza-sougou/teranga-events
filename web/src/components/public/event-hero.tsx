'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import { Countdown } from './countdown';
import type { PublicEvent } from '@/types';

// Near-fullscreen but deliberately not 100vh — keeps a visible hint that
// there's more content below, so the page doesn't read as if it stops here.
const HERO_HEIGHT = 'h-[88vh] min-h-[560px]';

// Image only — name/date/location/category live in the header block below
// the hero now, not overlaid on the photo. No gradient either: the
// countdown is the only thing left on the image, and it carries its own
// bg-overlay chip (see countdown.tsx) so it stays legible without one.
export function EventHero({ event, coverUrl }: { event: PublicEvent; coverUrl: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end start'] });
  // Image drifts slower than the page scroll for the parallax depth effect —
  // skipped entirely under prefers-reduced-motion (not just toned down),
  // this class of effect is a real physical-discomfort trigger for some
  // users, not an optional nicety.
  const y = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [0, 0] : [0, 160]);

  return (
    <div ref={containerRef} className={`relative ${HERO_HEIGHT} overflow-hidden bg-ink`}>
      <motion.div style={{ y }} className="absolute -inset-y-16 inset-x-0">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={event.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-ink-2" />
        )}
      </motion.div>

      <div className="absolute bottom-6 right-6 sm:bottom-10 sm:right-10">
        <Countdown startAt={event.startAt} endAt={event.endAt} />
      </div>
    </div>
  );
}
