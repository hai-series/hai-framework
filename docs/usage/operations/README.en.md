# Deploy and operate

[Guide home](../README.en.md) · [Getting started](../getting-started/workflow.en.md)

Before deploying, check the artifact, target environment, and previous successful release. Verify a user flow after the change. A timeout or a disconnected SSH session leaves the final remote state uncertain. Inspect the target before retrying.

## Plan and run a deployment

[Deployment](deployment.md) covers read-only planning, full and incremental releases, and health and version checks. See [deployment settings](../configuration/delivery.md) for inputs, secret sources, and the state each operation requires. Keep private environment values out of terminal output.

## Recover or roll back

Read the deployment result, the remote `current` record, and the running containers to tell a verified recovery from a failed or unknown one. Use the previous artifact and its matching configuration to make a new full deployment. Handle data changes and external effects under the application's recovery procedure. See [failure recovery and rollback](../configuration/delivery.md#失败恢复与发布后回滚).

## Investigate feedback and background jobs

Review reports and replies through My Feedback or the staff list. [Feedback troubleshooting](feedback.md) · [Operational settings](../configuration/operations.md)

## Record what was verified

Record whether the run used fixtures, an application instance, real backend services, or a public gateway. Each covers different failure modes. Follow [verification](../governance/verification.md) when recording the result.
