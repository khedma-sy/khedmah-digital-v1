import type { CanonicalApplicationPort, CanonicalModuleAdapter } from './canonical-module-adapter';

export type CanonicalBoundaryValue = Readonly<Record<string, unknown>>;

export interface IdentityApplicationPort<Input extends CanonicalBoundaryValue, Output extends CanonicalBoundaryValue>
  extends CanonicalApplicationPort<Input, Output> {}

export interface ProfileApplicationPort<Input extends CanonicalBoundaryValue, Output extends CanonicalBoundaryValue>
  extends CanonicalApplicationPort<Input, Output> {}

export interface OrganizationApplicationPort<Input extends CanonicalBoundaryValue, Output extends CanonicalBoundaryValue>
  extends CanonicalApplicationPort<Input, Output> {}

export type IdentityModuleAdapter<RuntimeInput, CanonicalInput extends CanonicalBoundaryValue, CanonicalOutput extends CanonicalBoundaryValue, RuntimeOutput> =
  CanonicalModuleAdapter<RuntimeInput, CanonicalInput, CanonicalOutput, RuntimeOutput>;

export type ProfileModuleAdapter<RuntimeInput, CanonicalInput extends CanonicalBoundaryValue, CanonicalOutput extends CanonicalBoundaryValue, RuntimeOutput> =
  CanonicalModuleAdapter<RuntimeInput, CanonicalInput, CanonicalOutput, RuntimeOutput>;

export type OrganizationModuleAdapter<RuntimeInput, CanonicalInput extends CanonicalBoundaryValue, CanonicalOutput extends CanonicalBoundaryValue, RuntimeOutput> =
  CanonicalModuleAdapter<RuntimeInput, CanonicalInput, CanonicalOutput, RuntimeOutput>;

