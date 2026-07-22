import { loadPlatformConfig } from './config/platform-config';
import { createBackendApp } from './app';

async function bootstrap(): Promise<void> {
  const config = loadPlatformConfig();
  const app = await createBackendApp();

  await app.listen(config.port);
}

void bootstrap();
