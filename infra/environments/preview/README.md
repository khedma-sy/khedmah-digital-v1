# Preview environment

Every open pull request owns two Cloud Run services in the dedicated Preview Google Cloud project and uses a dedicated Preview Firebase project. Service names include the PR number; image tags include PR number and commit SHA. Preview never receives production or staging data, identities, secrets, service accounts, repositories, or mutable configuration. Closing the PR deletes both services.
