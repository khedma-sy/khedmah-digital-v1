# Environment separation

The platform contract requires four isolated identities: Development → Preview → Staging → Production. Each must have a unique Google Cloud project and Firebase project. Preview and Staging require distinct service accounts, Secret Manager values, Artifact Registry repositories, Cloud Run services, data, quotas, and logs. `scripts/validate-environment-separation.mjs` rejects missing or duplicated project identities. No deployment script in this layer accepts Production as a target.
