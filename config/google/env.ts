export type Environment = Readonly<Record<string, string | undefined>>;
const forbidden = /^(?:change[-_ ]?me|placeholder|todo|example|undefined|null)$/i;
export function requireEnvironment(name: string, env: Environment = process.env): string {
  const value = env[name]?.trim();
  if (!value || forbidden.test(value)) throw new Error(`Missing or invalid required environment variable: ${name}`);
  return value;
}
export function optionalBoolean(name: string, env: Environment = process.env): boolean {
  const value = env[name]?.trim().toLowerCase();
  if (!value) return false;
  if (value !== "true" && value !== "false") throw new Error(`${name} must be true or false`);
  return value === "true";
}
export function redact(value: unknown): string { return value == null ? "[absent]" : "[redacted]"; }
