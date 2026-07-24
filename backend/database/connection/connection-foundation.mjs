export const DatabaseAdapter = Object.freeze({
  POSTGRESQL: 'postgresql',
});

export const DatabaseConnectionState = Object.freeze({
  UNCONFIGURED: 'unconfigured',
  CONFIGURATION_VALIDATED: 'configuration_validated',
  READY_FOR_FUTURE_CONNECTION: 'ready_for_future_connection',
});

export function createDatabaseConnectionDescriptor(config = {}) {
  return Object.freeze({
    adapter: config.adapter || DatabaseAdapter.POSTGRESQL,
    environment: config.environment || 'development',
    schema: config.schema || 'public',
    state: DatabaseConnectionState.READY_FOR_FUTURE_CONNECTION,
    opensNetworkConnection: false,
    includesCredentials: false,
    includesConnectionString: false,
  });
}
