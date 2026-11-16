# Find a guide for your task

[Chapter overview](README.en.md) · [Guide home](../README.en.md)

Choose the path that matches the work you want to finish.

<a id="first-app"></a>

## Run your first application

[Prepare your environment](environment.en.md), [create and run a project](../getting-started/create.en.md), and [change one observable setting](../getting-started/develop.en.md). Use a test account to sign in and perform one successful action and one that fails. Check [forms and feedback](../development/ui.md) to see how the application reports the result and retains input. When you are ready to deliver, [build](../getting-started/build.md) and [deploy](../operations/deployment.md).

<a id="developer"></a>

## Develop a complete feature

Start with [frontend, backend and authorization](../development/frontend-backend.md) and choose from the [application guides](../development/README.en.md). Add [data](../development/data.md), [identity](../development/authentication.md), or [AI](../development/ai.md) as needed. Look up values in the [configuration reference](../configuration/README.en.md). Use [verification](../governance/verification.md) to pick unit, integration, and browser tests for the changed flow. Include authorization failures and retries.

<a id="configuration-owner"></a>

## Manage settings across environments

Read [configuration sources and overrides](../configuration/runtime.md) to find who loads a value and who uses it. Check [shared data services](../configuration/data.md), [identity settings](../configuration/identity.md), and the relevant HTTP, AI, or operations settings. Verify each change against the running app. Check the [deployment settings](../configuration/delivery.md#环境和秘密的来源) for private overrides, managed secrets, and backups.

<a id="operator"></a>

## Deploy and recover a release

[Build the artifacts](../getting-started/build.md) and record their version, build ID, architecture, and checksum. Confirm the target environment, backups, previous successful release, and maintenance window in [deployment settings](../configuration/delivery.md). [Plan and deploy](../operations/deployment.md), then verify a user flow. If a step fails, check the remote state before following [recovery and rollback](../configuration/delivery.md#失败恢复与发布后回滚). Use [feedback and troubleshooting](../operations/feedback.md) to link reference numbers to logs and business state.

<a id="maintainer"></a>

## Maintain a public API

Follow [framework maintenance](../governance/framework-maintenance.md) to find affected public exports, callers, templates, and settings. Cross-check the API reference against the implementation. Review [security and recovery](../governance/security-review.md), then run the checks defined in [verification](../governance/verification.md). Update the module reference and screenshots, and check the published registry version after release.

<a id="reviewer"></a>

## Review security and failure recovery

Use [security review](../governance/security-review.md) to identify users, requests, trust boundaries, credentials, and external effects. Follow the server-side [identity](../configuration/identity.md) and [transport](../configuration/http.md) checks. Review [data](../configuration/data.md), [jobs](../configuration/operations.md), and [recovery](../configuration/delivery.md). Use [verification](../governance/verification.md) to record what you reproduced and what still needs a target environment.
