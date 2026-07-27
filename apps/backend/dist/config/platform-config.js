"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPlatformConfig = loadPlatformConfig;
const DEFAULT_PORT = 3001;
const DEFAULT_VERSION = '0.1.0';
const SUPPORTED_ENVIRONMENTS = new Set(['development', 'staging', 'production']);
function parseEnvironment(value) {
    if (value && SUPPORTED_ENVIRONMENTS.has(value)) {
        return value;
    }
    return 'development';
}
function parsePort(value) {
    if (!value) {
        return DEFAULT_PORT;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        return DEFAULT_PORT;
    }
    return parsed;
}
function parseVersion(value) {
    if (!value || value.trim().length === 0) {
        return DEFAULT_VERSION;
    }
    return value.trim();
}
function loadPlatformConfig() {
    return {
        environment: parseEnvironment(process.env.NODE_ENV),
        port: parsePort(process.env.PORT),
        version: parseVersion(process.env.APP_VERSION),
        serviceName: 'khedmah-digital-v1-backend'
    };
}
//# sourceMappingURL=platform-config.js.map