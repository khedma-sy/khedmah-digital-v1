# MISSION-216 — Google Cloud staging deployment report

## Execution summary

- **Execution date:** 2026-07-28 UTC
- **Source revision:** `4344dc5`
- **Google Cloud CLI:** `578.0.0`
- **Intended region:** `me-central1`, from `cloudbuild.staging.yaml`
- **Final decision:** **STAGING DEPLOYMENT REQUIRES ACTION**

The deployment could not start because the execution environment has no active Google Cloud account and no configured Google Cloud project. Every requested Google Cloud operation was attempted in mission order; dependent operations failed before creating cloud resources.

## Deployment evidence

| Required evidence | Result |
| --- | --- |
| Active Google Cloud account | None returned by `gcloud auth list --filter=status:ACTIVE --format='value(account)'` |
| Current Google Cloud project | `(unset)` |
| Current configured Cloud Run region | `(unset)` |
| Intended deployment region | `me-central1` |
| API enablement | Failed: required property `project` is not set |
| Artifact Registry repository | Could not verify `khedmah-staging`: required project attribute is absent |
| Cloud Build ID | Not created |
| Cloud Build status | Not started; `gcloud builds submit` exited `1` because `project` is not set |
| Backend image URI | Intended: `me-central1-docker.pkg.dev/PROJECT_ID/khedmah-staging/backend:4344dc5`; not built or pushed |
| Frontend image URI | Intended: `me-central1-docker.pkg.dev/PROJECT_ID/khedmah-staging/frontend:4344dc5`; not built or pushed |
| Backend service | `khedmah-backend-staging`; deployment failed before service creation or update |
| Frontend service | `khedmah-frontend-staging`; deployment failed before service creation or update |
| Backend service URL | Unavailable |
| Frontend service URL | Unavailable |
| Backend health check | Not reachable because no service URL was created or discovered |
| Frontend health check | Not reachable because no service URL was created or discovered |
| Cloud Logging verification | Failed: required property `project` is not set; no deployment logs were available |

`PROJECT_ID` in the intended URIs above is a non-secret placeholder, not a deployed project identifier.

## Ordered command results

### 1. Verify project and region

```text
$ gcloud auth list --filter=status:ACTIVE --format='value(account)'
WARNING: The following filter keys were not present in any resource : status
[no account returned]

$ gcloud config get-value project
(unset)

$ gcloud config get-value run/region
(unset)
```

The build configuration supplies `me-central1` as its staging region default, but the CLI itself had no configured region or project.

### 2. Enable required APIs

Attempted for Artifact Registry, Cloud Build, and Cloud Run:

```text
$ gcloud services enable artifactregistry.googleapis.com cloudbuild.googleapis.com run.googleapis.com --quiet
ERROR: (gcloud.services.enable) The required property [project] is not currently set.
Exit status: 1
```

### 3. Verify Artifact Registry

```text
$ gcloud artifacts repositories describe khedmah-staging --location=me-central1 --format=json
ERROR: (gcloud.artifacts.repositories.describe) Error parsing [repository].
Failed to find attribute [project].
Exit status: 1
```

### 4. Execute Cloud Build and publish images

```text
$ gcloud builds submit . --config=cloudbuild.staging.yaml --substitutions='_REGION=me-central1,_REPOSITORY=khedmah-staging,_IMAGE_TAG=4344dc5' --quiet
ERROR: (gcloud.builds.submit) The required property [project] is not currently set.
Exit status: 1
```

No build was created, so there is no Cloud Build ID or build status beyond the local submission failure. Neither container image was built or pushed.

### 5. Deploy Backend and Frontend

Both requested deployments were attempted and failed with exit status `1`:

```text
ERROR: (gcloud.run.deploy) The [project] resource is not properly specified.
Please specify the argument [--project] or set [core/project].
```

No service revision or service URL was returned for either `khedmah-backend-staging` or `khedmah-frontend-staging`.

### 6. Run health checks

Service discovery was attempted for both services. Each `gcloud run services describe` command failed with exit status `1` because the project was not set. The required HTTP checks were still invoked and failed explicitly rather than being skipped:

```text
backend_url=''
curl: (3) URL rejected: No host part in the URL
BACKEND_HEALTH_EXIT:3

frontend_url=''
curl: (3) URL rejected: No host part in the URL
FRONTEND_HEALTH_EXIT:3
```

Both health results are **failed / not reachable**, not passed.

### 7. Verify Cloud Logging

```text
$ gcloud logging read 'resource.type="cloud_run_revision" AND (resource.labels.service_name="khedmah-backend-staging" OR resource.labels.service_name="khedmah-frontend-staging")' --limit=10 --format=json
ERROR: (gcloud.logging.read) The required property [project] is not currently set.
Exit status: 1
```

## Deployment errors and required action

The blocking errors are:

1. No authenticated Google Cloud account is available to the non-interactive execution environment.
2. No target Google Cloud project is configured or supplied.
3. Consequently, API status, repository existence, Cloud Build, Cloud Run, health, and logging evidence cannot be resolved.

An authorized operator must provide non-interactive Google Cloud credentials and the target project ID, then set the project and rerun the commands in the [Google Cloud staging deployment runbook](../operations/GOOGLE-CLOUD-STAGING-DEPLOYMENT.md). No credential should be committed to this repository.

## Final conclusion

No staging resources were successfully built, pushed, deployed, or verified during this execution. The deployment must not be represented as successful.

## Final decision

**STAGING DEPLOYMENT REQUIRES ACTION**
