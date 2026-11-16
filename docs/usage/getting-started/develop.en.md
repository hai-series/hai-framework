# Configure and develop an app

[First delivery](workflow.en.md) · [Previous: create](create.en.md) · [Next: build](build.en.md)

Write down the feature's inputs, outputs, roles, data changes, and acceptance criteria before choosing packages. Set registration and administrator roles according to the application's own permission model.

<a id="configuration-sources"></a>

## Choose configuration sources

Use module YAML such as `_db.yml` for the settings structure. Supply addresses, provider names, and credentials for the target environment. The shared defaults are in `.env`. Public mode values go in `.env.dev`, `.env.test`, or `.env.prod`, and private overrides go in `.env.local` or `.env.<mode>.local`. See [loading, overrides and defaults](../configuration/runtime.md).

```sh
pnpm dev
pnpm dev:test
pnpm dev:prod
```

These commands choose settings for the development server. Build scripts keep deployment secrets out of compiled artifacts. After compiling a Node app, use the project's `start:test` or `start:prod`. In a fullstack project, the root `start` runs the API. Run the client workspace's preview script to see the Web build.

<a id="feature-flow"></a>

## Connect a complete feature

In a fullstack project, update the contract, server-side permissions and data operations, then the client and page. A SvelteKit project uses file routes and server loads. The fullstack hash router discovers new pages from the generated structure. Check `success` on methods returning `HaiResult`. Transaction callbacks, factories, and pure functions follow their documented signatures.

Find the [application guide](../development/README.en.md) and [settings](../configuration/README.en.md) for the feature. Translate user-facing messages in three languages and send warnings and errors to `ToastContainer`. Preserve form input on failure and refresh relevant data on success.

<a id="ai-assisted-development"></a>

## Work with a coding assistant

The CLI copies Skills into the generated project's `.agents/skills/`. Invoke a Skill in your assistant.

1. Record the goal, roles, permissions, screens, APIs, fields, states, failures, and acceptance criteria in `docs/`.
2. Review missing and ambiguous requirements with [hai-spec-review](../../../packages/cli/templates/skills/hai-spec-review/SKILL.md).
3. Use [hai-spec-implement](../../../packages/cli/templates/skills/hai-spec-implement/SKILL.md) to track the agreed document version and implement the tasks in dependency order. For focused changes, use the app implementation, review, or test Skill.
4. Review the diff, checks, and unverified cases with [hai-pr-review](../../../packages/cli/templates/skills/hai-pr-review/SKILL.md).

When requirements change, update the business documents first and compare them with the accepted version. Resume interrupted work from its task list.

<a id="check-feature"></a>

## Verify the result

Run the project's type checks, lint, applicable builds, tests, and affected browser tests in that order. Exercise actual screens and verify effective config in the running app. Test permission decisions, failures, and recovery. Release resources created by the tests in cleanup code and keep logs or screenshots needed to investigate the result.
