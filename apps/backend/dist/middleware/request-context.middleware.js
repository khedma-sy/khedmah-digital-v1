"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRequestContextMiddleware = createRequestContextMiddleware;
const node_crypto_1 = require("node:crypto");
const request_context_1 = require("../context/request-context");
const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';
function firstHeaderValue(value) {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}
function safeIdentifier(value) {
    if (!value || value.trim().length === 0) {
        return (0, node_crypto_1.randomUUID)();
    }
    return value.trim().slice(0, 128);
}
function createRequestContextMiddleware(logger) {
    return (request, response, next) => {
        const requestId = safeIdentifier(firstHeaderValue(request.headers[REQUEST_ID_HEADER]));
        const correlationId = safeIdentifier(firstHeaderValue(request.headers[CORRELATION_ID_HEADER]) ?? requestId);
        const startedAt = Date.now();
        response.setHeader(REQUEST_ID_HEADER, requestId);
        response.setHeader(CORRELATION_ID_HEADER, correlationId);
        (0, request_context_1.runWithRequestContext)({ requestId, correlationId, startedAt }, () => {
            response.on('finish', () => {
                logger.logRequestLifecycle({
                    requestId,
                    correlationId,
                    method: request.method,
                    path: request.path,
                    statusCode: response.statusCode,
                    durationMs: Date.now() - startedAt
                });
            });
            next();
        });
    };
}
//# sourceMappingURL=request-context.middleware.js.map