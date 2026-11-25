# Floot public web release — 2026-11-25

Floot confirmed that the owner-requested web publication succeeded on 2026-11-25 at 16:47:30 UTC (19:47:30 Damascus). The previous public release was published on 2026-11-20 at 14:37 UTC.

- Public site: https://khedma-meeting.floot.app/platform
- Release: `179562525227493ab4ce0-8f3c-4466-81ce-40a63b9bddd0`
- Floot source digest: `sha256:6fb74963038eba4833e26774e4e1858b384376b06f2d3dff76aec5402904cf47`, covering 1,398 files.
- The publication job succeeded, and a separate live status readback confirmed the release ID. No new functional tests were run for this publication at the owner's instruction. The source digest identifies the Floot release; GitHub source parity was not established.
- GitHub baseline was `25bd354a43635e58853e3502be71bae5ce608a41`. Node.js CI, Test & Verify, and isolated PostgreSQL quote integration succeeded on that commit. PR #404 was the open documentation PR at readback.

## Related milestones and open work

- The [LAB receipt](EVIDENCE-LAB-SCHEMA037-COMMITTED-2026-11-25.md) records committed migrations 036/037, verified stop and cleanup, and the exact retained Backend Docker image ID.
- No serving Backend deployment or native build was part of the web publication. The next Backend milestone remains private Cloud Run startup against LAB schema 037.
- Floot reported no attached custom domains. The intended `khedmah.uk` address is not part of this release. Floot also reported that scheduled jobs are inactive on the current free plan.
