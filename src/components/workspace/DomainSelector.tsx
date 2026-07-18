'use client';

import React from 'react';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { AVAILABLE_DOMAINS } from '@/domains/registry';

const DOMAIN_LABELS: Record<string, string> = {
  concrete: 'Concrete',
  imp: 'IMP'
};

// Chooses which domain governs the *next* shape drawn or scanned — does not
// affect items already on the checklist, since each item carries its own
// domainId and resolves against that. A project can freely mix concrete and
// IMP items (see domains/registry.ts).
export function DomainSelector() {
  const activeDomain = useTakeoffStore((s) => s.activeDomain);
  const setActiveDomain = useTakeoffStore((s) => s.setActiveDomain);

  return (
    <select
      value={activeDomain.id}
      onChange={(e) => {
        const domain = AVAILABLE_DOMAINS.find((d) => d.id === e.target.value);
        if (domain) setActiveDomain(domain);
      }}
      className="px-2 py-1.5 rounded text-xs font-semibold bg-slate-800 text-white border border-slate-700 hover:bg-slate-700"
      aria-label="Estimating domain for new takeoffs"
    >
      {AVAILABLE_DOMAINS.map((d) => (
        <option key={d.id} value={d.id}>
          {DOMAIN_LABELS[d.id]}
        </option>
      ))}
    </select>
  );
}