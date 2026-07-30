package com.khedmah.digital

import android.app.Application
import com.google.firebase.FirebaseApp

class KhedmahApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val configuredAppId = resources.getIdentifier("google_app_id", "string", packageName)
        if (configuredAppId != 0) {
            checkNotNull(FirebaseApp.initializeApp(this)) { "Firebase production configuration is invalid" }
        }
    }
}
