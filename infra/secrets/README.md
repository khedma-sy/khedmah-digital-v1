# Production secret boundary

This directory stores **secret names only**. Values belong in Google Secret Manager; local values belong in ignored environment files. CI must use Workload Identity Federation, never downloaded service-account keys. Applications must not print credentials, OAuth/FCM tokens, user coordinates, or signed URLs.
