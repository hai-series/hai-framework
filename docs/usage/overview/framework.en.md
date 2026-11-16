# Capabilities and application structure

[Chapter overview](README.en.md) · [Find a guide for your task](reading-paths.en.md)

hai-framework is a TypeScript framework for AI calls, identity and authorization, data, user interfaces, notifications, audit, and application delivery. Use an individual package or combine packages into an application. Check any external services the packages need before running the application.

<a id="adopt-one-feature"></a>

## Adopt one feature

For chat, start with the server-side AI API and a model credential on the server. Add a persistent store when you need conversation history. Add text processing, embeddings, and a vector store for knowledge retrieval. The UI package can render Markdown and edit documents independently of a model.

To let an agent work in a project, see [ACP project sessions](../development/ai-acp.md). Choose a local, container, or remote HTTP/WS service, configure the model, and register the workspace. Set the main branch for each Git project, decide whether sessions share a directory or use separate worktrees, and explicitly control updates and releases.

RelDB, Cache, and IAM have initialization and shutdown methods. Datapipe functions run when called. Serv creates an HTTP app, Kit integrates with SvelteKit, and UI provides components. When an operation returns `HaiResult`, check `success` before using `data`.

<a id="application-structure"></a>

## Choose an application structure

| Structure | How it fits together |
| --- | --- |
| Same-origin web app | One SvelteKit app serves pages and APIs. Kit connects requests, authentication, and standard responses. Use this for a single admin console, corporate site, or mobile website. |
| Standalone API or multiple clients | API Contract describes input and output, Serv runs the API in Node, and API Client calls it with types. The fullstack template puts the contract, server, shared code, and Web/mobile/desktop clients in separate workspaces. The clients share the same server authorization. |
| Containers and native releases | `serv` and `web` identify container services. `app` and `desktop` identify installers. A static website can also run on GitHub Pages. Verify each created artifact in its target environment. |

<a id="production"></a>

## Production dependencies

When you enable persistent databases, sessions, files, or vectors, prepare the backend each module requires and back up the data and credentials. This also applies to single-instance applications. A static site without stateful services can be published as files.

Plan how to recover when a dependency fails, times out, or leaves the result of an external operation unknown. A Compose update can briefly interrupt the services it replaces. Recover persistent writes and schema changes using the application's own procedure. See [module APIs](../function/README.en.md) and [verification](../governance/verification.md).
