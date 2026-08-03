import { PublicBusinessProfile } from '../business-profiles/business-profile.types';
import { PublicServiceListing } from '../service-catalog/service-catalog.types';

export interface SearchResults {
  readonly businesses: readonly PublicBusinessProfile[];
  readonly services: readonly PublicServiceListing[];
  readonly total: number;
}
