import { establishDiscoveryEligibility, projectDiscoveryListing, recordDiscoveryOutcome } from '../domain/public-discovery.mjs';

// Establishes listing eligibility and stops after its governed outcome. It does
// not query, search, filter, rank, recommend, map, render, or orchestrate listings.
export function executePublicDiscovery({ eligibility, outcome, outcomeInput, duplicateContext }) {
  const eligible = establishDiscoveryEligibility(eligibility, duplicateContext);
  const discovery = recordDiscoveryOutcome(eligible, outcome, outcomeInput);
  return Object.freeze({ discovery, listing: projectDiscoveryListing(discovery) });
}

