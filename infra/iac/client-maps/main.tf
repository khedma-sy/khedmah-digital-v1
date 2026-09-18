resource "google_apikeys_key" "browser" {
  project      = var.project_id
  name         = "khedmah-v1-maps-browser"
  display_name = "Khedmah V1 Maps Web"

  restrictions {
    browser_key_restrictions {
      allowed_referrers = sort(tolist(var.browser_allowed_referrers))
    }

    api_targets {
      service = "maps-backend.googleapis.com"
    }

    api_targets {
      service = "places-backend.googleapis.com"
    }
  }
}

resource "google_apikeys_key" "android" {
  project      = var.project_id
  name         = "khedmah-v1-maps-android"
  display_name = "Khedmah V1 Maps Android"

  restrictions {
    android_key_restrictions {
      allowed_applications {
        package_name     = var.android_package_name
        sha1_fingerprint = var.android_sha1
      }
    }

    api_targets {
      service = "maps-android-backend.googleapis.com"
    }
  }
}
