/**
 * Storage abstraction. Implementations:
 *   - LocalStorageAdapter (development/test): writes to local filesystem temp
 *   - GcsStorageAdapter (production): writes to Google Cloud Storage
 */
export interface StorageAdapter {
  save(key: string, data: Buffer, mimeType: string): Promise<string | undefined>; // returns public URL if public
  delete(key: string): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  async save(key: string, _data: Buffer, _mimeType: string): Promise<string | undefined> {
    // In tests/development we do not write to disk to keep things stateless.
    // Return a synthetic URL so callers can reference the asset.
    return `http://localhost:3001/api/v1/media/local/${encodeURIComponent(key)}`;
  }

  async delete(_key: string): Promise<void> {
    // no-op in local adapter
  }
}

export class GcsStorageAdapter implements StorageAdapter {
  private readonly bucket: string;

  constructor() {
    const bucket = process.env.GCS_MEDIA_BUCKET;
    if (!bucket) {
      throw new Error('GCS_MEDIA_BUCKET environment variable is required for GcsStorageAdapter.');
    }
    this.bucket = bucket;
  }

  async save(key: string, data: Buffer, mimeType: string): Promise<string | undefined> {
    const token = await this.accessToken();
    const endpoint = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?uploadType=media&predefinedAcl=publicRead&name=${encodeURIComponent(key)}`;
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType, 'Content-Length': String(data.length) }, body: data });
    if (!response.ok) throw new Error(`GCS upload failed with status ${response.status}.`);
    return `https://storage.googleapis.com/${this.bucket}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const token = await this.accessToken();
    const endpoint = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(key)}`;
    const response = await fetch(endpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok && response.status !== 404) throw new Error(`GCS delete failed with status ${response.status}.`);
  }

  private async accessToken(): Promise<string> {
    const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
    if (!response.ok) throw new Error('Unable to obtain Google Cloud storage credentials.');
    const payload = await response.json() as { access_token?: string };
    if (!payload.access_token) throw new Error('Google Cloud access token is missing.');
    return payload.access_token;
  }
}

export function createStorageAdapter(): StorageAdapter {
  if (process.env.GCS_MEDIA_BUCKET) {
    return new GcsStorageAdapter();
  }
  return new LocalStorageAdapter();
}
