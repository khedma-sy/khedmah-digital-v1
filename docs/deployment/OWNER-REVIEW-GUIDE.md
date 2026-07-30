# Pull Request Owner Review Guide

Every eligible PR automatically receives one bot comment containing a clickable Preview URL, backend health URL, changed-file summary, executed gates, screenshot artifact link, and these review steps.

1. Confirm every required quality job is green.
2. Open the Preview URL and verify the changed paths and Arabic RTL behavior.
3. Download the `preview-<PR>-screenshots` artifact and compare `before.png` (Staging) with `after.png` (Preview).
4. Exercise the PR's documented flows using test-only data. Never enter production or personal data.
5. Review browser/runtime errors and the backend health endpoint.
6. Record approval or actionable defects in the PR.
7. Merge only after Preview succeeds. After merge to `develop`, confirm the Staging deployment summary and health.

Preview failure blocks review and merge. A missing screenshot, URL, security gate, Firebase gate, Google gate, or health check is a deployment failure—not an optional warning.
