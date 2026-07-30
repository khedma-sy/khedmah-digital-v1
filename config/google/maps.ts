import { requireEnvironment, type Environment } from "./env";
export function mapsConfig(env: Environment = process.env) {
  return Object.freeze({
    browserApiKey: requireEnvironment("GOOGLE_MAPS_BROWSER_API_KEY", env), androidApiKey: requireEnvironment("GOOGLE_MAPS_ANDROID_API_KEY", env),
    serverApiKey: requireEnvironment("GOOGLE_MAPS_SERVER_API_KEY", env),
    allowedWebOrigins: requireEnvironment("GOOGLE_MAPS_ALLOWED_WEB_ORIGINS", env).split(",").map(v => v.trim()).filter(Boolean),
    androidRestriction: Object.freeze({ packageName: requireEnvironment("GOOGLE_MAPS_ANDROID_PACKAGE", env), sha1: requireEnvironment("GOOGLE_MAPS_ANDROID_SHA1", env) }),
  });
}
