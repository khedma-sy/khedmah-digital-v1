import { optionalBoolean, requireEnvironment, type Environment } from "./env";
export function googleConfig(env: Environment = process.env) {
  return Object.freeze({
    projectId: requireEnvironment("GOOGLE_CLOUD_PROJECT", env), region: requireEnvironment("GOOGLE_CLOUD_REGION", env),
    oauth: Object.freeze({
      webClientId: requireEnvironment("GOOGLE_OAUTH_WEB_CLIENT_ID", env),
      androidClientId: requireEnvironment("GOOGLE_OAUTH_ANDROID_CLIENT_ID", env),
      serverClientId: requireEnvironment("GOOGLE_OAUTH_SERVER_CLIENT_ID", env),
      allowedAudiences: requireEnvironment("GOOGLE_OAUTH_ALLOWED_AUDIENCES", env).split(",").map(v => v.trim()).filter(Boolean),
    }),
    telemetry: Object.freeze({ logging: optionalBoolean("GOOGLE_LOGGING_ENABLED", env), monitoring: optionalBoolean("GOOGLE_MONITORING_ENABLED", env), errorReporting: optionalBoolean("GOOGLE_ERROR_REPORTING_ENABLED", env) }),
  });
}
