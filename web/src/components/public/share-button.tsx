'use client';

import { useState } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { ShareIcon } from '@/components/ui/icons';

// navigator.share (native sheet — WhatsApp included) when available, since
// link-sharing via WhatsApp is very common in the Senegalese context (more
// relevant here than a row of individual social buttons). Falls back to a
// clipboard copy with a short confirmation otherwise.
export function ShareButton({ title, className }: { title: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled the native share sheet — not an error to surface.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={handleShare} className={buttonClasses('ghost', className)}>
      <ShareIcon className="h-4 w-4" />
      {copied ? 'Lien copié !' : 'Partager'}
    </button>
  );
}
