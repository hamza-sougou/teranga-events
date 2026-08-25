'use client';

import { useState } from 'react';

const MAX_CHARS = 320;

export function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > MAX_CHARS;
  const shown = expanded || !isLong ? text : `${text.slice(0, MAX_CHARS).trimEnd()}…`;

  return (
    <div>
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-text">{shown}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[13px] font-bold text-indigo hover:underline"
        >
          {expanded ? 'Voir moins' : 'Voir plus'}
        </button>
      )}
    </div>
  );
}
