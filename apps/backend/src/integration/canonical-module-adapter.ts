/**
 * Type-only boundary for translating between NestJS-facing values and a
 * canonical application port. Implementations require a separate mission.
 */
export interface CanonicalModuleAdapter<RuntimeInput, CanonicalInput, CanonicalOutput, RuntimeOutput> {
  toCanonicalInput(input: RuntimeInput): CanonicalInput;
  toRuntimeOutput(output: CanonicalOutput): RuntimeOutput;
}

/**
 * Runtime-neutral application port shape. The executable host may call a port,
 * but it must not supply HTTP or NestJS objects to canonical modules.
 */
export interface CanonicalApplicationPort<Input, Output> {
  execute(input: Input): Promise<Output> | Output;
}

