# Frontend Foundation

Next.js, React, and TypeScript frontend foundation for Khedmah Digital V1.

Implemented in Mission 007:

- Application structure.
- TypeScript configuration.
- Base layout.
- Arabic-first `lang="ar"` configuration.
- RTL `dir="rtl"` foundation.
- Global styling foundation.

Not implemented:

- Business screens.
- Dashboards.
- User screens.
- Profiles.
- Authentication pages.
- Search.
- Marketplace.
- Messaging.
- Payments.
- Analytics features.
- Khedmah Connect.
- Community features.


## Firebase

The modular client is centralized in [`lib/firebase`](lib/firebase/). Provide the `NEXT_PUBLIC_FIREBASE_*` contract at build time. Import services from `lib/firebase`; do not initialize another app or duplicate configuration. Messaging remains preparation-only.
