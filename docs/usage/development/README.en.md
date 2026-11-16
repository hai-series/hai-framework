# Develop application features

[Guide home](../README.en.md) · [Configuration reference](../configuration/README.en.md)

Start with the guide for the flow you are building. Each guide describes how to connect the pieces and links to the settings it uses.

## Define the request and data boundaries

Read [frontend, backend and API authorization](frontend-backend.md) for a separate API or a multi-client app. It explains what belongs in the request contract, on the server, and in the client. Follow [data, transactions and attachments](data.md) when persisting records or uploading files. Exercise failed operations and retries to check for partial writes or duplicate records.

## Connect identity and the interface

[Sign-in, password changes and sign-out](authentication.md) walks through entering the app, recovering access, and revoking sessions. [Layout and interactions](ui.md) covers forms, lists, dialogs, themes, and toasts, including loading, empty, and error states. Check permissions on the server for each operation.

## Connect optional services

[AI content, models and retrieval](ai.md) starts with rendering content and adds model calls and persistent stores. [Payments and native features](integrations.md) distinguishes local checks from provider sandbox and device tests.

For an agent that works in a real project, see [ACP agents, workspaces and sessions](ai-acp.md). Choose a local, container, or remote service, set the main branch for each Git workspace, and follow the session, worktree, and release flows. The [multi-user agent workspace](agent.md) connects sign-in, ACP, knowledge, memory, audio, and tool approvals.

## Verify one complete flow

Cover a successful action, an authorization refusal, and recovery from a failure. Check [operations and troubleshooting](../operations/feedback.md) for runtime issues and [verification](../governance/verification.md) for what each check can establish.
