import type { EstimatingDomain } from '@/types/estimatingDomain';
import { concreteDomain } from './concrete';
import { impDomain } from './imp';

// Central lookup so any item can resolve its own domain by id, independent
// of whichever domain is currently selected for new draws. Necessary
// because a single project can legitimately mix domains — e.g. the Chef's
// Warehouse proposal bids Dock Pits/Freezer Slab/Curbing (concrete)
// alongside Wall/Liner Panels (IMP) in the same estimate.
export const DOMAIN_REGISTRY: Record<string, EstimatingDomain> = {
  [concreteDomain.id]: concreteDomain,
  [impDomain.id]: impDomain
};

export const AVAILABLE_DOMAINS: EstimatingDomain[] = [concreteDomain, impDomain];

export function getDomainById(id: string): EstimatingDomain {
  const domain = DOMAIN_REGISTRY[id];
  if (!domain) {
    console.warn(`Unknown domainId "${id}", falling back to concrete`);
    return concreteDomain;
  }
  return domain;
}