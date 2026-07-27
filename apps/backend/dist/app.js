"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBackendApp = createBackendApp;
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const global_exception_filter_1 = require("./filters/global-exception.filter");
const platform_logger_1 = require("./logging/platform-logger");
const request_context_middleware_1 = require("./middleware/request-context.middleware");
async function createBackendApp() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bufferLogs: true
    });
    const logger = app.get(platform_logger_1.PlatformLogger);
    app.useLogger(logger);
    app.use((0, request_context_middleware_1.createRequestContextMiddleware)(logger));
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new common_1.ValidationPipe({
        forbidNonWhitelisted: true,
        transform: false,
        validationError: {
            target: false,
            value: false
        },
        whitelist: true
    }));
    app.useGlobalFilters(new global_exception_filter_1.GlobalExceptionFilter(logger));
    return app;
}
//# sourceMappingURL=app.js.map