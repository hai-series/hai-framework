# Develop application features

[Guide home](../README.en.md) · [Configuration reference](../configuration/README.en.md)

Start with the guide for the flow you are building. Each guide describes how to connect the pieces and links to the settings it uses.

## Define the request and data boundaries

Read [frontend, backend and API authorization](frontend-backend.md) for a separate API or a multi-client app. It explains what belongs in the request contract, on the server, and in the client. Follow [data, transactions and attachments](data.md) when persisting records or uploading files. Exercise failed operations and retries to check for partial writes or duplicate records.

## Connect identity and the interface

[Sign-in, password changes and sign-out](authentication.md) walks through entering the app, recovering access, and revoking sessions. [Layout and interactions](ui.md) covers forms, lists, dialogs, themes, and toasts, including loading, empty, and error states. Check permissions on the server for each operation.

## Connect optional services

[AI content, models and retrieval](ai.md) starts with rendering content and adds model calls and persistent stores. [Payments and native features](integrations.md) distinguishes local checks from provider sandbox and device tests.

For an agent that works in a real project, see [ACP agents, workspaces and sessions](ai-acp.md). Choose a local, container, or remote service, set the main branch for each Git workspace, and follow the session, worktree, and release flows. The [multi-user agent workspace](agent.md) connects sign-in, ACP, knowledge, memory, audio, tool forms and editable artifacts; see the [application guide](../../../apps/agent/README.en.md).

## Run a Node SSR build

Current SvelteKit adapter-node 6 assumes `https` when neither `kit.paths.origin` nor a configured protocol header supplies the scheme. Plain HTTP access to the Node port can therefore cause form POSTs to return 403 for an origin mismatch; runtime `ORIGIN` has no effect. Use the project's existing build and startup scripts behind a trusted reverse proxy. For example, set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` before Node starts; the proxy removes incoming forwarding headers, validates the public Host, and rebuilds the scheme and Host headers. Restrict backend access to the proxy and terminate HTTPS TLS there. A fixed `kit.paths.origin` is compiled into the artifact and requires rebuilding when the hostname or scheme changes; runtime proxy settings allow one artifact to serve different environments.

## Verify one complete flow

Cover a successful action, an authorization refusal, and recovery from a failure. Check [operations and troubleshooting](../operations/feedback.md) for runtime issues and [verification](../governance/verification.md) for what each check can establish.

Use the same package scripts as application users. Check default startup in the actual project directory with `pnpm dev`, loading its normal public and private environment files. Do not inject application settings, generate fallback keys or replace initial passwords. Execute frontend modules in a real browser and trigger server initialization through a page or health request. Ordinary E2E uses Playwright with a short configuration that calls existing `dev:test`, `start:test` or `preview` scripts. Report development startup, test-mode artifacts and production backends separately.

Development and test example keyrings are supplied in `.env.dev` and `.env.test`; production uses separate private keys. Keep initial password changes, short sessions and notification scenarios in the test directory and explain their purpose. Restore mode files after each scenario. These scenarios do not replace ordinary startup checks.
