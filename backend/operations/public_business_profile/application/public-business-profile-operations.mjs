import { createPublicBusinessProfile, projectPublicBusinessProfile } from '../domain/public-business-profile.mjs';

// Creates the governed representation and stops. It performs no rendering,
// discovery, search, indexing, ranking, or runtime orchestration.
export function establishPublicBusinessProfile(input, duplicateContext) {
  const profile = createPublicBusinessProfile(input, duplicateContext);
  return Object.freeze({ profile, publicRepresentation: projectPublicBusinessProfile(profile) });
}

