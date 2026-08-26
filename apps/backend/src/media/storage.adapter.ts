/**
 * Storage abstraction. Implementations:
 *   - LocalStorageAdapter (development/test): writes to local filesystem temp
 *   - GcsStorageAdapter (production): writes to Google Cloud Storage
 */
export interface StorageAdapter {
  save(key: string, data: Buffer, mimeType: string): Promise<void>;
  read(key: string): Promise<{ data: Buffer; mimeType: string }>;
  delete(key: string): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly objects = new Map<string, { data: Buffer; mimeType: string }>();

  async save(key: string, data: Buffer, mimeType: string): Promise<void> {
    this.objects.set(key, { data: Buffer.from(data), mimeType });
  }

  async read(key: string): Promise<{ data: Buffer; mimeType: string }> {
    const object = this.objects.get(key);
    if (!object) throw new Error('Stored media object was not found.');
    return { data: Buffer.from(object.data), mimeType: object.mimeType };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
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

  async save(key: string, data: Buffer, mimeType: string): Promise<void> {
    const token = await this.accessToken();
    const endpoint = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?uploadType=media&name=${encodeURIComponent(key)}`;
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType, 'Content-Length': String(data.length) }, body: data });
    if (!response.ok) throw new Error(`GCS upload failed with status ${response.status}.`);
  }

  async read(key: string): Promise<{ data: Buffer; mimeType: string }> {
    const token = await this.accessToken();
    const endpoint = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(key)}?alt=media`;
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`GCS read failed with status ${response.status}.`);
    return {
      data: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') ?? 'application/octet-stream'
    };
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
