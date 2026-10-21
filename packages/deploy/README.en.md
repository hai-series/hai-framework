# @h-ai/deploy

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · [CLI](../cli/README.en.md) · [Environment and middleware](../cli/templates/skills/hai-deploy/middleware.md)

Deployment SDK used by the `hai deploy` command in `@h-ai/cli`. It also runs independently in Node.js scripts.

## Features and scope

| Target       | Application                                         | Operation                                                                           |
| ------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `docker-ssh` | Native Node services or SvelteKit with adapter-node | Build locally, upload over SSH, run Compose on Linux and check HTTP health          |
| `vercel`     | SvelteKit with adapter-vercel                       | Build, upload, set environment variables and wait for deployment; requires internet |

- Follow runtime dependencies and workspace links from the target importer in `pnpm-lock.yaml`, excluding development dependencies and peers. Application configuration selects middleware backends. Optional AI peers do not enable AI/CUDA.
- Select an environment and require `.env.<mode>` before choosing defaults, custom connections or keep unchanged per middleware. Complete environments can skip all middleware processing.
- Compose supports PostgreSQL, MySQL, Redis, RustFS/MinIO, Qdrant, pgvector, Chroma, OpenLDAP and Mailpit. SQLite, memory, local and LanceDB use their respective local storage. Mailpit captures test mail only.
- Cloud provisioning supports Neon, Upstash, Cloudflare R2, Resend and Alibaba Cloud SMS. R2 needs existing S3 credentials, Resend a verified sender domain, and SMS approved signatures/templates. Use custom connections for other backends.

**One fullstack command deploys API and Web together.** Templates with deploy and Web enabled generate `container.web` in the service configuration. `hai deploy packages/my-app-serv` builds/uploads both images into one Compose deployment. Web owns the public port and proxies the internal API on the same origin, using the actual API prefix and preserving page reloads. Without Web configuration, single-service behavior is retained. Prepare domains and TLS separately.

## Command-line deployment

### 1. Install and prepare

Node must satisfy `^22.22.2 || ^24.15.0 || >=26.0.0`; generated projects pin `pnpm@12.11.2`. Node 20 / pnpm 9.5.0 are unsupported. Use `pnpm.cmd` in Windows PowerShell.

In the generated workspace root, install CLI/SDK versions matching the application's framework and retain the lockfile. Installation needs a package source or complete offline dependencies:

```powershell
pnpm.cmd add -Dw @h-ai/cli @h-ai/deploy
pnpm.cmd exec hai --help
```

Creation with `--features deploy` already adds the local SDK, but does not install a global `hai`. With a global CLI, run `hai deploy` directly. The template's `pnpm run deploy` packages artifacts; it does not invoke this deployment command.

For docker-ssh, prepare:

- A running local Docker/Podman engine capable of building Linux images for the server architecture. Windows needs the corresponding virtualization/WSL2/VM environment; a client alone is insufficient. `auto` prefers Podman; Docker can be selected explicitly.
- Local `ssh` and `scp`, noninteractive key/agent authentication and the server host fingerprint.
- Remote Docker/Podman with its `compose` command. The SSH user must run containers and write the deployment directory. Windows must reach SSH and the exposed application port.
- `config/_deploy.yml` in the target package and `.env.prod` or `.env.test` in the environment directory. Missing environment files stop deployment.

### 2. Configure target and environment

Minimal `config/_deploy.yml` for Docker; supply machine-specific target details through the whole-object `HAI_DEPLOY_PROVIDER` override in `.env.local`:

```yaml
provider:
  type: docker-ssh
container:
  runtime: docker
  s3Engine: rustfs
  web:
    context: ../..
    dockerfile: Dockerfile
    target: web
    containerPort: 8080
services: {}
```

Replace the host, user, ports and key path for your environment. Never commit `.env.local`:

```dotenv
HAI_DEPLOY_PROVIDER='{"type":"docker-ssh","ssh":{"host":"10.0.0.20","port":22,"username":"deploy","identityFile":"C:/Users/me/.ssh/hai_deploy"},"remote":{"baseDir":"/opt/hai/apps","runtime":"docker"},"expose":{"type":"port","containerPort":3000,"hostPort":18080}}'
```

Alternatively, the wizard asks for missing target details, saves them in `.env.local` and reuses them. Store private key paths only. Edit `HAI_DEPLOY_PROVIDER` to switch a complete target.

Precedence: `.env` → `.env.<mode>` → `.env.local` → process environment. Parent JSON such as `HAI_DB` overrides child variables. `.env.example` documents all fields and enums. Commit `.env` and `.env.dev/test/prod`; keep real credentials in `.env.local`. Fullstack's first start also needs a private `HAI_ADMIN_DEFAULT_PASSWORD` satisfying the IAM password policy.

Joint deployment fills missing/wildcard CORS with the public origin and preserves explicit origins. For a production HTTPS endpoint, set `HAI_SERV_CORS_ORIGIN=https://app.hai.internal` in `.env.prod`. Production refresh cookies use Secure, so Web/API need trusted HTTPS endpoints. Exposing HTTP ports alone does not validate complete login/session refresh.

### 3. Deploy

From the fullstack root, replace the service directory:

```powershell
pnpm.cmd exec hai deploy packages/my-app-serv --env prod --env-dir .
```

The wizard shows the effective backend and purpose. Defaults generate Compose services/volumes; custom connections omit that middleware container. Keep unchanged is offered only when the target environment file explicitly declares complete configuration. Public values go to the selected environment file, credentials to `.env.local`, with redacted output.

When all database, cache and storage connections are already configured:

```powershell
pnpm.cmd exec hai deploy packages/my-app-serv --env prod --env-dir . --yes --skip-middleware
```

`--skip-middleware` (alias `--skip-provision`) skips middleware prompts, configuration updates and resource creation; application build/deployment still run. It does not start external middleware. `--yes` alone keeps complete settings and otherwise uses the current backend defaults.

`--project-name <name>` sets the name; an explicit environment adds a suffix. **`--skip-build` currently skips only Vercel application builds. docker-ssh always builds an image and has no option to deploy a specified existing image directly.** Failures return a nonzero exit code.

## docker-ssh execution and files

1. Use the API package Dockerfile or a fallback. Explicit `container.web` selects the Web context relative to the service package, Dockerfile relative to that context, target and internal port. Neighboring applications are not guessed.
2. Build/export both images with one deployment ID before uploading anything. A Web build failure leaves the remote deployment untouched.
3. Check the remote engine and Compose over SSH, upload the tar with SCP, then run `load` remotely.
4. Generate `compose.yml`, `.env.runtime`, `start-<mode>.sh` and, for joint deployment, `web.conf` locally and upload each to `<baseDir>/<projectName>-<mode>/`. These are separate from the image archive; no single Compose bundle is uploaded and no source build runs on Linux.
5. The remote script sets `HAI_DEPLOY_ENVIRONMENT`/`HAI_CORE_ENV` and runs `compose --env-file .env.runtime ... up -d`. Joint deployment checks API `/health`, Web `/_hai/web-health` and the home page before succeeding; standalone SvelteKit checks `/`. Web never mounts the private API `.env.runtime`.

Local artifacts live in the target package's Git-ignored `.hai/deploy/<mode>/`. Remote `.env.runtime` uses mode `600`. Retain local artifacts for repeat deployment: keep unchanged preserves services/volumes from the previous local Compose, not arbitrary server-side Compose definitions. Exclude private environment files and deployment archives from image contexts.

## Fully offline deployment

Offline means no internet; Windows and Linux must still communicate over an internal SSH/HTTP network. Vercel and cloud provisioning are unavailable.

### Materials to bring in advance

| Location      | Requirements                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows tools | Compatible Node (for example a supported Node 24), pnpm 12.11.2, installed CLI/SDK and transitive dependencies, OpenSSH, initialized and runnable Linux container engine                                                    |
| Project       | Complete source, pinned lockfile, environment files and private credentials; `pnpm.cmd exec hai --help` must work offline. Avoid on-demand `npx` / `pnpm dlx` downloads                                                     |
| Linux         | Docker CLI/Engine, Compose plugin (`docker compose version` works), authorized SSH key, container permissions, writable deployment directory, ports and disk space. Host Node/pnpm are unnecessary for running images       |
| Images        | API, Web and middleware images matching Linux CPU architecture and exact Compose names/tags; import with `docker load -i <archive.tar>`                                                                                     |
| Application   | PostgreSQL database/account, Redis connection/password, RustFS keys/bucket and initial administrator password. Existing services must already run and be reachable from the app container; `localhost` means that container |

Defaults use `postgres:16-alpine`, `redis:7-alpine` and `ghcr.io/rustfs/rustfs:1.0.1`. Other tags do not match automatically: import the exact images, correctly retag verified compatible images, or use custom connections. The SDK does not transfer middleware images. Other pinned images are in the [Compose implementation](src/container/deploy-container-compose.ts).

**The default source build is not ready for offline use without preparation.** Dockerfiles prepare pnpm and download packages and SQLite prebuilds; the fullstack root also runs `pnpm fetch` and uses an external Dockerfile frontend. Windows `node_modules`/pnpm store cannot replace Linux build dependencies. For offline source builds, bring Node base images, the build frontend, Corepack/pnpm, Linux dependencies and native binary caches into the local engine/build environment, adapt the Dockerfile, and rehearse with internet disconnected. `pnpm install --offline --frozen-lockfile` only addresses package-store access, not additional downloads by install scripts.

SQLite prebuilds must match better-sqlite3 version, Node ABI, CPU architecture and libc. Installation may still need them when runtime uses PostgreSQL. Preload prebuild-install's Linux cache or use an internal `container.sqlitePrebuildMirror`; otherwise bring the binary or a finished image. Default fullstack needs no CUDA.

### Reuse prebuilt images through the SDK offline

Prepare finished images before delivery. For a project named `my-app` with a Web frontend, build on the server's architecture in an environment with dependencies available:

```powershell
docker build --target runtime -t my-app-api:offline .
docker build --target web -t my-app-web:offline .
docker save -o my-app-images.tar my-app-api:offline my-app-web:offline
```

Import the archive into the offline Windows Linux engine with `docker load -i my-app-images.tar`. Create `packages/my-app-serv/Dockerfile` containing only:

```dockerfile
FROM my-app-api:offline
```

Add a service-package `.dockerignore` containing `*`. At the workspace root, create `Web.offline.Dockerfile` containing `FROM my-app-web:offline AS web`, plus `Web.offline.Dockerfile.dockerignore` containing `*`. Set `HAI_DEPLOY_CONTAINER_WEB_DOCKERFILE=Web.offline.Dockerfile` in `.env.local` to reuse the generated Web configuration; older projects first need the `container.web` YAML above. This makes the SDK's mandatory build reuse the finished API without package installation. Rebuild the finished image after source changes. Configure the target, then run the deployment command above. To create middleware containers, select `HAI_DB_TYPE=postgresql`, `HAI_CACHE_TYPE=redis`, `HAI_STORAGE_TYPE=s3` in `.env.prod` and choose defaults in the wizard. For existing services, enter custom connections; once complete, `--skip-middleware` is available. The SDK uploads and starts both images. Rehearse with internet disconnected to confirm the builder needs no network.

The same command publishes API/Web and returns the Web URL; no separate `docker run` is needed. For production, prepare an internal HTTPS endpoint proxying the public port, including proxy configuration/images, certificates, DNS/hosts and client trust. Browsers use one origin without a separate API domain. Verify health, login/business flows, hash/session reload, restarts and persistence. These adaptation instructions do not replace disconnected acceptance.

Official references: Docker [save](https://docs.docker.com/reference/cli/docker/image/save/) / [load](https://docs.docker.com/reference/cli/docker/image/load/), [pnpm install](https://pnpm.io/cli/install), [Compose plugin installation](https://docs.docker.com/compose/install/linux/).

## SDK and failures

Scripts do not need the CLI. Supply parsed configuration; use public `loadDeploymentEnvironment` / `loadDeploymentConfig` for the same environment resolution:

```typescript
import type { DeployConfigInput } from '@h-ai/deploy'
import { deploy } from '@h-ai/deploy'

/**
 * 使用现有中间件发布生产 API，并释放部署模块。
 * @param config - 从部署环境解析得到的配置
 * @returns 初始化或部署的 HaiResult，由调用者检查 success
 * @example `const result = await publish(config)`
 */
export async function publish(config: DeployConfigInput) {
  const initialized = await deploy.init(config)
  if (!initialized.success)
    return initialized
  try {
    return await deploy.deployApp('./packages/my-app-serv', {
      environment: 'prod',
      envDir: '.',
      skipProvision: true,
    })
  }
  finally {
    await deploy.close()
  }
}
```

Check `result.success` before reading `error.code/message` or `data.url/healthCheck`. `deploy.scan()` and `deploy.credentials.*()` require no initialization. `deployApp()` includes provisioning, so do not also call `provisionAll()` beforehand. Check results for manual provisioning too. SDK `skipProvision` has the CLI's skip-middleware semantics.

Cloud provisioners return whole-object `HAI_DB`, `HAI_CACHE`, `HAI_STORAGE` or `HAI_REACH_PROVIDERS`; applications must load their YAML and initialize the modules. `getDeployRecovery(result.error)` returns stage/resource IDs; verify `unknown` outcomes in the platform before retrying. Same-name retries reuse resources without automatic deletion. Types, configuration and error codes are available through the [public entry](src/index.ts).

## Testing and development

After installing dependencies, run from the framework root (Windows: `pnpm.cmd`):

```powershell
pnpm.cmd --filter @h-ai/deploy typecheck
pnpm.cmd --filter @h-ai/deploy lint
pnpm.cmd --filter @h-ai/deploy build
pnpm.cmd --filter @h-ai/deploy test
pnpm.cmd check:skills
```

`src/deploy-scanner.ts` handles lockfile traversal, `deploy-middleware.ts` connection fields, `container/` engines/SSH/Compose, `providers/` deployment targets and `provisioners/` cloud resources. CLI prompts live in `../cli/src/commands/cli-deploy*.ts`. Changes to backends/configuration must update consumers, environment examples, tests and the [deployment skill](../cli/templates/skills/hai-deploy/SKILL.md).

For deployment changes, also run CLI typecheck/lint/build/test and `pnpm.cmd --filter @h-ai/cli test:deploy-gates`: current package archives → generated fullstack → Podman/SSH → joint API/Web deployment → browser directly against remote Web → health, environment, login and repeat deployment, without a local preview. This needs a local engine and OpenSSH; first fixture setup downloads images and OS/Node dependencies, so it is not an offline acceptance test. Template changes also require `pnpm.cmd --filter @h-ai/cli test:scaffold-gates`. Unit tests do not prove cloud resource creation; validate paid cloud operations separately. Keep logs/screenshots/reports in Git-ignored `tmp/` or `test-results/`.

## License

Apache-2.0
