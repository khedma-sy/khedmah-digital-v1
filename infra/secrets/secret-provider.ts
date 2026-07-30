export interface SecretProvider { access(name: string): Promise<string>; }
export interface SecretManagerClient { accessSecretVersion(request: { name: string }): Promise<readonly [{ payload?: { data?: Uint8Array } }]>; }

export class EnvironmentSecretProvider implements SecretProvider {
  constructor(private readonly env: Readonly<Record<string, string | undefined>> = process.env) {}
  async access(name: string): Promise<string> {
    const value = this.env[name]?.trim();
    if (!value) throw new Error(`Required secret is unavailable: ${name}`);
    return value;
  }
}

/** Adapter for @google-cloud/secret-manager, injected to keep the boundary testable. */
export class GoogleSecretManagerProvider implements SecretProvider {
  constructor(private readonly client: SecretManagerClient, private readonly projectId: string) {}
  async access(name: string): Promise<string> {
    if (!/^[A-Z][A-Z0-9_]+$/.test(name)) throw new Error("Invalid secret name");
    const [version] = await this.client.accessSecretVersion({ name: `projects/${this.projectId}/secrets/${name}/versions/latest` });
    const data = version.payload?.data;
    if (!data) throw new Error(`Required secret is unavailable: ${name}`);
    return new TextDecoder().decode(data);
  }
}
