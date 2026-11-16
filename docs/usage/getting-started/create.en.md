# Create and run a project

[First delivery](workflow.en.md) · [Prepare your environment](../overview/environment.en.md) · [Next: configure and develop](develop.en.md)

Use the npm `latest` channel for a normal installation. To make team installations reproducible, look up the published version and pin it. The framework repository's version can be ahead of the registry.

<a id="install-cli"></a>

## Install the CLI

```sh
pnpm view @h-ai/cli dist-tags
pnpm view @h-ai/cli@latest version
pnpm add -g @h-ai/cli@latest
hai --version
```

The first two commands list the published channels and the default version. Use `@h-ai/cli@beta` for a published beta, or replace `@latest` with the version your team selected. Compare the output of `hai --version` with that version. In Windows PowerShell, run the pnpm commands as `pnpm.cmd`.

<a id="run-app"></a>

## Generate and run an app

```sh
hai create my-app --type fullstack --frontends web --defaults
cd my-app
pnpm dev
```

The first command generates a Web frontend and API workspace, installs dependencies, and initializes Git. It leaves the new repository local. The next commands enter the project and start the development processes, which print their addresses. Run `hai create my-app` for interactive choices. With `--no-install`, run `pnpm install` yourself before starting. Use `--no-deploy` to omit the development deployment tools.

<a id="project-types"></a>

## Choose a template and options

| Option | What it generates or controls |
| --- | --- |
| `--type fullstack` | An API and clients with a common contract. `--frontends` defaults to `web,app,desktop`. `miniapp` is reserved and is excluded from builds. |
| `--type api` | A contract and standalone Node API. Both API and fullstack are pnpm workspaces. |
| `admin`, `website`, `h5` | Same-origin SvelteKit applications. The initial interactive choice and the default with `--defaults` are `admin`. |
| `mobile-app` | A Capacitor and Vite client. Install the platform tools to use native features. |
| `--no-git`, `--git-remote` | Skip Git setup or set a remote. Adding the remote leaves commits local. |
| `--package-manager` | Select pnpm, npm, or yarn for a single project. Workspace templates use pnpm. |
| `--defaults` | Accept the CLI defaults without prompts. Supply credentials separately in the target environment. |

Use `hai add <module>` to add a supported module to an existing app, then configure and connect it in the application. For generated routes, `page` targets SvelteKit. `api` generates SvelteKit routes or the Serv contract and procedure, depending on the selected `--workspace`. Fullstack clients use the generated hash routes.

<a id="project-layout"></a>

## Read the generated structure

In the example above, `packages/my-app-contract` defines the HTTP interface, `packages/my-app-serv` implements it, `packages/my-app-shared` holds common code, and `apps/my-app-web` supplies the pages. Fullstack projects read environment files from the project root. The standalone API template uses the server workspace under `apps/`. Read the generated `README.md` and `AGENTS.md` before editing.

The templates install the packages they use. Admin and H5 include identity and its data and notification dependencies. Website starts as a Node SSR app with Core, Kit, and UI. The API template includes identity, notifications, upload, and feedback. Fullstack also includes audit, storage, and scheduling. Mobile-app starts with client capabilities. Add AI, payment, vectors or Datapipe as needed. Generated YAML and `.env.example` list optional settings in comments until you enable them. To publish a static website, check for server-side dependencies, startup code, APIs, and actions first. [Static website settings](../configuration/delivery.md#静态website与github-pages)

<a id="first-run-check"></a>

## Verify the first run

Open the address printed by the development server. In templates with IAM, the initial account is `admin`. Read the random password from `HAI_ADMIN_DEFAULT_PASSWORD` in the selected private environment file, such as `.env.dev.local`. Keep it out of screenshots and logs. An account already stored in the database keeps its password across restarts.

Try one successful action and one failure. Check the service that received the request, the user-facing message, and the trace in the logs. A missing dependency should fail at startup or at the operation that needs it. Models, production notifications, and payments need their corresponding service providers. Default container builds skip optional CUDA/TensorRT downloads.
