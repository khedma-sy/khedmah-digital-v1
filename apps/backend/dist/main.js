"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const platform_config_1 = require("./config/platform-config");
const app_1 = require("./app");
async function bootstrap() {
    const config = (0, platform_config_1.loadPlatformConfig)();
    const app = await (0, app_1.createBackendApp)();
    await app.listen(config.port);
}
void bootstrap();
//# sourceMappingURL=main.js.map