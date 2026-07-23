export const LogLevel = Object.freeze({
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
});

const levelWeight = Object.freeze({
  [LogLevel.DEBUG]: 10,
  [LogLevel.INFO]: 20,
  [LogLevel.WARN]: 30,
  [LogLevel.ERROR]: 40,
});

const sensitiveKeyPattern = /(password|secret|token|credential|privateUserInformation)/i;

function normalizeLevel(level) {
  return levelWeight[level] ? level : LogLevel.INFO;
}

export function redactSensitiveMetadata(metadata = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, sensitiveKeyPattern.test(key) ? '[REDACTED]' : value]),
  ));
}

export function createLogEntry({ level = LogLevel.INFO, message, requestId, metadata = {} }) {
  return Object.freeze({
    level: normalizeLevel(level),
    message: String(message || ''),
    requestId: requestId ? String(requestId) : undefined,
    metadata: redactSensitiveMetadata(metadata),
    timestamp: new Date().toISOString(),
  });
}

export function createMemoryLogger({ level = LogLevel.INFO } = {}) {
  const minimumLevel = normalizeLevel(level);
  const entries = [];

  function shouldLog(entryLevel) {
    return levelWeight[normalizeLevel(entryLevel)] >= levelWeight[minimumLevel];
  }

  function write(entryLevel, message, context = {}) {
    if (!shouldLog(entryLevel)) {
      return undefined;
    }

    const entry = createLogEntry({
      level: entryLevel,
      message,
      requestId: context.requestId,
      metadata: context.metadata,
    });
    entries.push(entry);
    return entry;
  }

  return Object.freeze({
    debug: (message, context) => write(LogLevel.DEBUG, message, context),
    info: (message, context) => write(LogLevel.INFO, message, context),
    warn: (message, context) => write(LogLevel.WARN, message, context),
    error: (message, context) => write(LogLevel.ERROR, message, context),
    entries: () => [...entries],
  });
}
