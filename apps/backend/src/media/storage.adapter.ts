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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gcs = require('@google-cloud/storage');
    if (!gcs || !gcs.Storage) {
      throw new Error('@google-cloud/storage is not installed. Run: npm install @google-cloud/storage');
    }
    const storage = new gcs.Storage();
    const file = storage.bucket(this.bucket).file(key);
    await file.save(data, { contentType: mimeType, resumable: false });
    await file.makePublic();
    return `https://storage.googleapis.com/${this.bucket}/${key}`;
  }

  async delete(key: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gcs = require('@google-cloud/storage');
    if (!gcs || !gcs.Storage) {
      throw new Error('@google-cloud/storage is not installed.');
    }
    const storage = new gcs.Storage();
    await storage.bucket(this.bucket).file(key).delete({ ignoreNotFound: true });
  }
}

export function createStorageAdapter(): StorageAdapter {
  if (process.env.GCS_MEDIA_BUCKET) {
    return new GcsStorageAdapter();
  }
  return new LocalStorageAdapter();
}
