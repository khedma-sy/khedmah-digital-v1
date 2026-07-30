# Live Firebase Report

## Status

**NOT VERIFIED**

The Firebase project identifier, Firebase CLI, Google identity, protected Web configuration, and protected Android configuration were unavailable. No Firebase Console or runtime request was made.

| Service | Result | Evidence still required |
|---|---|---|
| Authentication | **NOT VERIFIED** | Approved provider/domain/app configuration plus positive and negative test identity flow and backend token verification. |
| Firestore | **NOT VERIFIED** | Project/rules/index/backup state plus authorized and denied non-production-safe operations. |
| Cloud Storage | **NOT VERIFIED** | Bucket/rules/CORS/lifecycle state plus authorized and denied operations. |
| Analytics | **NOT VERIFIED** | Consent/configuration state and a privacy-safe test event receipt. |
| Crashlytics | **NOT VERIFIED** | SDK/app state and controlled Staging test issue receipt. |
| Cloud Messaging preparation | **NOT VERIFIED** | Sender/app configuration and preparation state; no Production notification may be sent. |

No user, document, object, event, crash, FCM token, or notification was created by this attempt.
