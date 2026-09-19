output "browser_key_resource" {
  description = "Browser API key resource name."
  value       = google_apikeys_key.browser.id
}

output "android_key_resource" {
  description = "Android API key resource name."
  value       = google_apikeys_key.android.id
}

output "browser_key_uid" {
  description = "Browser API key UID for post-apply verification."
  value       = google_apikeys_key.browser.uid
}

output "android_key_uid" {
  description = "Android API key UID for post-apply verification."
  value       = google_apikeys_key.android.uid
}

output "browser_key_string" {
  description = "Browser API key value; publish only to Secret Manager."
  value       = google_apikeys_key.browser.key_string
  sensitive   = true
}

output "android_key_string" {
  description = "Android API key value; publish only to Secret Manager."
  value       = google_apikeys_key.android.key_string
  sensitive   = true
}
