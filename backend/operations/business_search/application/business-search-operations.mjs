import { createBusinessSearchQuery, establishBusinessSearchEligibility, matchesBusinessSearchQuery, projectBusinessSearchResult, recordBusinessSearchOutcome } from '../domain/business-search.mjs';

// The candidate boundary is stable: a future optimized provider may supply the
// same canonical candidate without changing query, record, result, or audit models.
export function executeBusinessSearch({ queryInput, eligibility, outcome, outcomeInput, duplicateContext }) {
  const query = createBusinessSearchQuery(queryInput);
  const eligible = establishBusinessSearchEligibility(eligibility, duplicateContext);
  const search = recordBusinessSearchOutcome(eligible, outcome, outcomeInput);
  const result = matchesBusinessSearchQuery(search, query) ? projectBusinessSearchResult(search) : null;
  return Object.freeze({ search, query, results: Object.freeze(result ? [result] : []) });
}

