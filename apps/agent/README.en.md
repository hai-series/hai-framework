# Hai Agent

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

Hai Agent is a multi-user web workspace for collaborating with real agents, citing sources, approving tools, reviewing code changes and retrieving artifacts. Tasks, knowledge, attachments, memory and preferences belong to the signed-in account.

## Quick start

Use the repository's pinned Node.js and pnpm versions. Real agents also require Linux cgroup v2, Docker or Podman, a reachable model gateway and prepared Agent images. Development defaults to SQLite, LanceDB, local files and in-memory cache, so sign-in and resource management can be tried first.

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=agent^...
pnpm --filter agent build
NODE_ENV=development pnpm --filter agent preview --mode dev
```

Set `HAI_IAM_REGISTER_ENABLED=true` in `apps/agent/.env.local` for local registration. Register at least one backend and Runner environment for real agents. Browser tests create isolated accounts and data directories.

## Usage

After signing in, choose Liquid glass from the theme menu in the workspace toolbar. The app restores your selection on reload.

Task search covers the current account’s active or archived tasks on the server, including older records. Use **Load more** in task, file, and artifact lists, the knowledge file picker, and the manual tool resource picker.

| Feature                   | Action and observable result                                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tasks and conversation    | Create a task, choose a backend and send a prompt. Search, reload, rename, archive or restore tasks; refresh or switch API nodes to continue following persisted progress                                                                                                  |
| Execution and permissions | Choose automatic, shared, personal or exclusive mode in task settings; set access, approval, model, timeout and output format. Preview the actual plan and reason. Stop queued/running work; allow once, allow for the session, save a matching rule, deny or revoke rules |
| Files and projects        | Upload attachments or choose an assigned Git branch. Agents access authorized resources; successful project turns expose artifacts and diffs. Download or explicitly confirm a push to a separate task branch                                                              |
| Tools and skills          | Run forms/presets in Tools or select the same catalog in task settings. Choose published skills in the composer; inspect actual tool status and sanitized results                                                                                                          |
| Knowledge                 | Create a personal knowledge base, add text or uploaded files, index, then cite it. Inspect retrieved titles/snippets, retry failures and remove documents from retrieval                                                                                                   |
| Memory and preferences    | Add, search, edit or delete memory; choose default mode, response preferences, reading voice and memory policy. Each task may disable memory; new suggestions require confirmation by default                                                                              |
| Speech                    | Record or upload WAV/MP3, edit the transcript in the composer, then send. Read completed replies aloud and stop playback. Recording needs HTTPS or localhost                                                                                                               |
| Tokens and context        | View estimates and separately reported backend usage. Long histories are compacted into a bounded summary for a new native session; original history remains visible                                                                                                       |

If a chat submission response is lost, reopen the original task to recover the same turn. Progress and cancellation resume when its receipt is available. If the cache prevents sign-out from being confirmed, follow the retry message to revoke the same session.

### Execution modes

| Mode     | Isolation and intended use                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto`   | Shared mode is possible for supported read-only conversations without tools or external context. Ordinary work may reuse a worker within one account; projects and full access use exclusive workers                                                                |
| `shared` | Administrator-enabled, pinned DeepSeek Harness ACP image for read-only conversations without tools. One tenant shares the process, with separate account conversations; attachments, personal context, knowledge, memory and skills require personal/exclusive work |
| `user`   | Reuse only for the same principal and matching startup configuration; each session retains separate authorization and routing                                                                                                                                       |
| `task`   | One workspace and Worker allowance per task session; used for project mounts and full access                                                                                                                                                                        |

## Artifacts and manual tools

Artifacts can create Markdown, HTML, tables and charts. Edit ordinary Markdown paragraphs/headings visually; code, Mermaid, tables and complex blocks retain their source. Use Source for complex edits. Tables/charts reuse existing framework components; images, audio and video use authorized preview/download URLs.

Save version uses the version originally read as its write condition. Browse history read-only or restore it as a new draft. Concurrent saves keep your local draft so you can copy it before loading the latest version. Document versions are independent of a project's Git revision. AI selection rewriting presents a proposal before applying and saving it.

HTML previews allow script interaction in an iframe without same-origin access and with offline resource policy by default. The deployment still owns preview origins and real network boundaries; browser preview is not a container execution environment.

Find tools by name and start with forms or examples. Select uploaded files and existing artifacts by readable names, with manual IDs as a fallback. Complex objects stay in advanced parameters. Follow actual queued, running, cancelling and terminal states, then open output artifacts. Cancellation continues polling until a real terminal state; Refresh status resumes an interrupted wait.

Manual actions and agents share an `@h-ai/tools-runner` service. `@h-ai/tools/server` provides artifact tools. Task settings use stable tool names such as `artifact_create`. External MCP tools use names such as `mcp_<configuration id>`. Both entry points share the catalog and enablement policy, and executors recheck authorization. The Broker and tool service forward MCP calls to `ai.mcp.services.invoke`. [Set up the tool service](../../docs/usage/function/tools-runner.en.md#quick-start)

Enabled groups and environment bindings jointly determine the catalog. Artifacts and deterministic data analysis need no separate image. Image/audio/rewriting need the corresponding AI models; document, Office, OCR, website capture, project preview and video jobs need Runner environments. Unbound jobs are omitted. `video_render` renders a prepared project archive; the AI workflow below adds capture, planning, narration and asset assembly.

Menus, task changes, task creation, sign-out and SPA navigation confirm unsaved artifact changes before leaving; cancellation preserves the draft. Tool submission records an idempotency key in the URL, then replaces it with an opaque receipt. Reopen Tools or reload to continue status queries. An unconfirmed submission locks its original tool and parameters; retries use the same key to avoid duplicate paid work. Recovery also protects the existing receipt. Starting another operation requires confirmation that the old task may continue, then uses a new key. URLs contain no identity or payload; hard reload restores lookup, while in-memory parameters must be checked again.

### Project website previews

Upload a project ZIP with `index.html` at its root, select `preview_build`, and choose the uploaded file by name. With `environments.preview` bound, a fixed offline builder bundles supported local HTML, JS/TS, CSS and browser-only Svelte components into one HTML artifact for the existing isolated preview. It belongs to `web`; local building requires no browserProxy. Closing the preview unloads its iframe, without a persistent preview server.

It supports a restricted Vite-style layout, without executing package scripts, Vite/Svelte/TypeScript configuration or installing dependencies. SvelteKit, arbitrary npm packages, node_modules and plugins are unsupported. Only one module entry is allowed; srcset, async/defer and nested documents are unsupported, and assets must be supported local files. Limits are 8 MiB expanded input, 1 MiB per source and final HTML, and a 60-second build command. Failed builds do not publish an old page. [Project preview requirements](../../docs/usage/function/tools-runner.en.md#web-preview)

### Website introduction videos

The global `workbench.selection` must also enable `web_capture` and `video_render`. Select both web/video groups, or list website_video/web_capture/video_render under tools. Union groups/tools, then apply exclude. Selecting only video or website_video, or excluding either dependency, omits the complete workflow from the catalog. Task settings cannot override global disabling.

Configure an LLM, default WAV TTS, web/video environments and browserProxy. Select website_video, enter an HTTPS URL and goal, then optionally choose a 6–30 second duration and landscape, portrait or square canvas. The workflow captures the real site, plans its script/storyboard, synthesizes per-shot narration, assembles the project and returns MP4.

Retained outputs include script, design, editable storyboard Markdown, WAVs, subtitles, a captured cover, project ZIP and workflow manifest. Retry an edited storyboard with storyboardId; reuse captureId and unchanged audioIds. Subtitles use sentence intervals; excessive narration fails explicitly without cutting off speech. Projects can be rendered again independently. [Video workflow inputs and recovery](../../docs/usage/function/tools-runner.en.md#website-video)

## Configuration

Keep private values in `.env.local`; process environment overrides matching fields. See [.env.example](.env.example) and [ACP configuration](../../docs/usage/configuration/ai.md#acp-接入与模型能力).

`config/_kit.yml` sets trusted proxies, access rules and fixed-window rate limiting. The app allows 360 requests per trusted client IP every 60 seconds by default. Production instances share counters in Redis. [Kit HTTP configuration](../../docs/usage/configuration/kit.en.md)

| Setting                                              | Purpose                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HAI_AI_LLM`                                         | Model IDs, protocols, gateways, credentials and capabilities. Codex uses Responses; DeepSeek Harness may use Chat. Retrieval requires an embedding scenario and its true dimension                                                                                          |
| `HAI_AI_ACP`                                         | Agent IDs, adapters, model/environment IDs. Set `sharedMode: true` only for validated DeepSeek Harness shared images; use image-default command/environment                                                                                                                 |
| `HAI_AI_IMAGE` / `HAI_AI_AUDIO`                      | Image generation, ASR/TTS models, scenario defaults and server credentials                                                                                                                                                                                                  |
| `HAI_RUNNER`                                         | Unique restart-stable node ID, engine, executor role, pinned images and quotas; allowlisted model/tool egress and internal container networks                                                                                                                               |
| `HAI_AGENT`                                          | Tenant, workbench switches/selection, job environments/browserProxy, external tool mappings, skills and projects. Projects require trusted absolute Git directories, registered refs, readers and publishers; publish only to registered remotes and separate task branches |
| `HAI_AGENT_TOOLURL` / `HAI_AGENT_TOOLPORT`           | Each executor's reachable MCP Broker URL and port; web nodes can query and approve. Register external services and input Schemas before model execution                                                                                                                     |
| `HAI_DB` / `HAI_CACHE` / `HAI_VECDB` / `HAI_STORAGE` | Shared PostgreSQL, Redis, Qdrant and S3 for multiple processes. Keep configuration and project baselines consistent. Tools reuses Runner tables, leases and events without another queue/state store                                                                        |

### Enable workbench capabilities as needed

Extend `config/_agent.yml` or override it with `HAI_AGENT` JSON. Environment values are registered Runner environment IDs, not image names.

```yaml
workbench:
  artifacts: true
  tools: true
  selection:
    groups: [documents, image, audio, web, video, analysis, mcp]
  environments:
    documents: document-tools
    web: website-capture
    preview: website-preview
    video: video-render
  browserProxy: http://172.28.0.1:4318
```

`artifacts/tools` default to true. Omitting `selection` selects the built-in groups shown, while explicit `selection: {}` disables everything. Union `selection.groups/tools`, then apply `selection.exclude` to enable or exclude individual tools using the same ToolSelection contract. `environments` defaults to empty. Add `environments.office/ocr/browser/preview` mappings as needed. Office and OCR tools belong to the `documents` group; browser screenshots and project previews belong to `web`. There are no office/ocr/browser tool groups. The default selection already includes documents/web; after binding environments, select those groups or individual tool names. The `mcp` group contains only explicitly mapped external services in the server's `tools` allowlist, with defined input Schemas. Models and environments require separate configuration; switches do not download images or start services.

`browser/web` require both an environment and a valid `browserProxy`. The trusted host supplies `http://full-dotted-decimal-IPv4:explicit-port`, with port 1–65535 and either an empty path or `/`. HTTPS, hostnames, IPv6, abbreviated/hexadecimal IPs, credentials, non-root paths, query strings and fragments are unsupported. Addresses `0.0.0.0`, `127.0.0.0/8`, `169.254.0.0/16` and `224.0.0.0/4` are rejected. Invalid settings omit the corresponding browser/web tools from the catalog. Reuse existing model egress infrastructure if available. The app forwards the proxy as `HAI_TOOL_BROWSER_PROXY`, beyond model argument control. Document, Office, OCR, project preview and rendering environments are offline. See [Tools jobs](../../packages/tools/jobs/README.md) for images, capabilities and network policies.

Start real acceptance with `resources.pids: 512` for the web/video Runner environments; this validation observed `EAGAIN` under a 128-PID limit. Node `toolCapacity.pids` must also cover the environment and intended concurrency. 512 is a starting point, not a guarantee for every website, resolution or workload; measure CPU, memory, temporary disk and execution deadlines separately.

Use `resources.scratchMiB: 6144` for the video Runner environment and `toolCapacity.scratchMiB: 8192` on the node as this validation's starting budget. HyperFrames 0.9.56 requires at least 1024 MiB free in both tmp and output. Runner gives tmp only one quarter of the total when input files exist, so the old 512 MiB total fails before rendering. Disk quotas do not mean allocated memory; account for coordinator and concurrent capacity, and retain the disk check. See [job configuration](../../packages/tools/jobs/README.md#配置). Real videos and the full workflow still need separate acceptance.

Browsers and tasks pass authorized file IDs. Reads, final publication and saves recheck account access. The Broker retains short-lived tokens and revocation; media downloads support Range and ownership checks. Executors recheck disabled groups and revoked task-tool access rather than trusting old catalogs.

Shared deployments use TLS and explicit registration/account management. API nodes set Runner `executor: false`; the web image does not claim jobs by default and includes Git/certificates for confirmed task-branch publishing. Execution processes use the same application build and their own Runner IDs, with Docker/Podman and Git when projects are enabled. Each executor has its own reachable Broker address.

The reverse proxy must remove client-supplied `X-Forwarded-*` before setting trusted values. Set `PROTOCOL_HEADER=x-forwarded-proto` only when required by that trusted setup. Allow upload size at both proxy and web server; SvelteKit Node can use `BODY_SIZE_LIMIT=12M`. Full-access administrators still remain within container resource, mount and egress limits.

Use scoped relay credentials for model calls; keep upstream keys at the relay rather than in executable task environments. Project examples import at most 512 ordinary files and 16 MiB input, subject to temporary-disk limits. Backend/mode changes may transfer a text summary, while native histories and working directories are independent across Workers. Save needed patches first. New tasks use personal memory defaults; changing tasks clears unsent drafts/references, leaving sent history intact.

Web and execution nodes need the same Git commit. Web containers run as UID 1000; mount owned project directories read-only. Deployment credentials may push only the intended `agent/` branches; SSH keys and known_hosts are mounted read-only at `/home/node/.ssh`.

### Business API example

The server derives the scope from a verified IAM session. Backends/environments are assumed registered. Keep business IDs stable for retries.

```ts
import { ai } from '@h-ai/ai'

// Bind the authenticated user to the agent tenant. The returned facade scopes subsequent calls to that subject.
const scoped = ai.acp.scoped({ tenantId: 'agent', userId: 'authenticated-user' })
// Select coder and automatic execution, deduplicate with job-123, and return the session or an error.
const created = await scoped.sessions.create({
  agentId: 'coder',
  execution: { mode: 'auto' }
}, { idempotencyKey: 'job-123' })
if (!created.success)
  throw new Error(created.error.message)
// Submit this prompt with turn-1 and access to project-docs. Success returns an accepted task ID and state.
const accepted = await created.data.submit({
  prompt: 'Read the sources and summarize',
  idempotencyKey: 'turn-1',
  context: {
    knowledgeBaseIds: ['project-docs']
  }
})
if (!accepted.success)
  throw new Error(accepted.error.message)
// Read up to 100 events after sequence 0 for the accepted task. A failed result carries the read error.
const page = await scoped.tasks.events(accepted.data.taskId, 0, 100)
if (!page.success)
  throw new Error(page.error.message)
```

## Development and tests

```sh
pnpm --filter agent typecheck
pnpm --filter agent test
pnpm --filter agent test:e2e
pnpm --filter agent test:e2e e2e/workbench.spec.ts
pnpm --filter agent test:e2e e2e/tools-workbench.spec.ts
```

The managed E2E entry allocates isolated data. The tools config enables the Runner executor; the default browser config does not claim jobs. Cross-node disabling additionally needs an API node sharing the test database/Storage with `selection: {}`, supplied as `AGENT_E2E_DISABLED_TOOLS_URL`; otherwise that case is explicitly skipped.

Real model acceptance needs registered gateways, models and container environments. Use two accounts and two execution nodes to check isolation, resume, approvals, models, files and tool ownership. Keep browser evidence in test output directories.

## License

[Apache-2.0](../../LICENSE)
