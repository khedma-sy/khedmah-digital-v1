package com.khedmah.digital

import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.tasks.await

class GoogleIdentity(private val context: Context) {
    private val credentialManager = CredentialManager.create(context)

    val configured: Boolean
        get() = BuildConfig.GOOGLE_OAUTH_SERVER_CLIENT_ID.endsWith(".apps.googleusercontent.com") &&
            FirebaseApp.getApps(context).isNotEmpty()

    suspend fun firebaseIdToken(): String {
        check(configured) { "تسجيل Google غير مهيأ في نسخة التطبيق الحالية." }
        val googleOption = GetGoogleIdOption.Builder()
            .setServerClientId(BuildConfig.GOOGLE_OAUTH_SERVER_CLIENT_ID)
            .setFilterByAuthorizedAccounts(false)
            .build()
        val response = credentialManager.getCredential(
            context,
            GetCredentialRequest.Builder().addCredentialOption(googleOption).build()
        )
        val credential = response.credential
        check(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            "لم يُرجع Google بيانات اعتماد صالحة."
        }
        val googleToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
        val firebaseUser = FirebaseAuth.getInstance()
            .signInWithCredential(GoogleAuthProvider.getCredential(googleToken, null))
            .await()
            .user ?: error("تعذر إنشاء جلسة Firebase.")
        return firebaseUser.getIdToken(true).await().token ?: error("تعذر إصدار رمز الدخول.")
    }

    suspend fun signOut() {
        if (FirebaseApp.getApps(context).isNotEmpty()) FirebaseAuth.getInstance().signOut()
        credentialManager.clearCredentialState(ClearCredentialStateRequest())
    }
}
