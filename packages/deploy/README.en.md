# @h-ai/deploy

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

An automated deployment module with two targets: deploy SvelteKit apps to Vercel with cloud infrastructure provisioning, or containerize and deploy to any Linux host over SSH (docker-ssh).

## Deployment targets

| Provider     | Target          | Description                                              |
| ------------ | --------------- | -------------------------------------------------------- |
| `vercel`     | Vercel platform | SvelteKit + adapter-vercel with cloud provisioners       |
| `docker-ssh` | Any Linux host  | SvelteKit + adapter-node / native Node services over SSH |

## Cloud services (provisioners)

| Service type | Provisioner   | Description                     |
| ------------ | ------------- | ------------------------------- |
| Database     | Neon          | PostgreSQL Serverless           |
| Cache        | Upstash       | Redis TCP + TLS                 |
| Storage      | Cloudflare R2 | S3-compatible object storage    |
| Email        | Resend        | SMTP (existing verified domain) |
| SMS          | Alibaba Cloud | Alibaba Cloud SMS               |

## Quick start

```typescript
import { deploy } from '@h-ai/deploy'

// 可选：从 ~/.hai/credentials.yml 注入 HAI_DEPLOY_* 环境变量
deploy.credentials.load()

// 初始化
await deploy.init({
  provider: { type: 'vercel', token: 'vel_xxx' },
  services: {
    db: { provisioner: 'neon', apiKey: 'neon_xxx' },
    cache: { provisioner: 'upstash', email: 'a@b.com', apiKey: 'up_xxx' },
  },
})

// 扫描应用依赖
const scan = await deploy.scan('./apps/my-app', { environment: 'test' })

// 开通基础设施
const provisions = await deploy.provisionAll('my-app')

// 完整部署
const result = await deploy.deployApp('./apps/my-app', { environment: 'test' })

await deploy.close()
```

## Environments and middleware

Run `hai deploy --env test`, or enter the environment first in an interactive terminal. The matching `.env.test` must exist; otherwise deployment stops and asks you to create it. Scanning resolves environment variables and module dependencies, then shows the effective backend, purpose and source. Choose default configuration, a custom connection, or keep unchanged for each middleware. Keeping is offered only when the target file already declares complete configuration; it skips writes, authentication and provisioning for that item. `--yes` keeps complete target settings and otherwise uses the current backend defaults; `--env-dir` selects the environment directory.

For a complete environment, choose “deploy directly” or run `hai deploy packages/my-app-serv --env prod --yes --skip-middleware` to skip all middleware prompts, writes and provisioning while preserving existing services. Missing targets are guided through SSH/Vercel setup. Host, ports, key paths, remote directory and tokens are stored only in `.env.local` as `HAI_DEPLOY_PROVIDER` and reused later. SDK callers can save machine settings with `saveDeploymentEnvironment(snapshot, values, { private: true })`; store private key paths only.

Defaults generate matching Compose services/volumes or invoke supported cloud provisioners. Backends without a cloud provisioner require custom connections. SQLite/memory/local/disabled retain their semantics. Custom inputs are validated field by field. Public values go into the selected environment file; credentials and authenticated JSON/URLs go into `.env.local`, with redacted output. See the [backend and connection field reference](../cli/templates/skills/hai-deploy/middleware.md).

## Configuration

Keep Git-safe configuration in `config/_deploy.yml` and secrets in `~/.hai/credentials.yml`:

```yaml
# config/_deploy.yml
provider:
  type: vercel
  token: ${HAI_DEPLOY_PROVIDER_TOKEN}

services:
  db:
    provisioner: neon
    apiKey: ${HAI_DEPLOY_SERVICES_DB_APIKEY}
  cache:
    provisioner: upstash
    email: ${HAI_DEPLOY_SERVICES_CACHE_EMAIL}
    apiKey: ${HAI_DEPLOY_SERVICES_CACHE_APIKEY}
```

These variables are explicit special mappings managed by `deploy.credentials`. If convention-based variables
such as `HAI_DEPLOY_PROVIDER_TOKEN` are also set, the convention-based variables take precedence.

Use `deploy.credentials.*` to manage credential files explicitly in scripts or the CLI:

```typescript
deploy.credentials.load()
deploy.credentials.save('HAI_DEPLOY_PROVIDER_TOKEN', 'vel_xxx')
deploy.credentials.saveAll({
  HAI_DEPLOY_SERVICES_DB_APIKEY: 'neon_xxx',
})
```

> `deploy.scan()` and `deploy.credentials.*()` use the local filesystem and do not require `deploy.init()`.

Scanning starts at the target workspace importer in `pnpm-lock.yaml` and follows runtime dependencies and workspace links, excluding dev dependencies, peers and unrelated applications. Old configuration files do not activate modules. Run `pnpm install` if the lockfile, importer or dependency nodes are missing. Specify the deployment directory explicitly; the scanner does not read package.json, pnpm-workspace.yaml or guess the project layout. The optional AI peer in `serv` does not enable AI/CUDA.

## docker-ssh deployment

Containerize the application and deploy over SSH to any Linux host; no cloud account is required.

### Prerequisites

- **Local**: install docker or podman (`auto` prefers podman).
- **Remote host**: SSH access, docker/podman and compose installed, and a login user permitted to run containers.
- **Application**: SvelteKit must use `@sveltejs/adapter-node` (covered by the supplied `Dockerfile`); otherwise `ADAPTER_MISSING` is returned.

### Steps

1. Store the SSH private key path in the credential file, outside the repository. Edit `~/.hai/credentials.yml` or use the API:

```typescript
deploy.credentials.save('HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE', '~/.ssh/hai_deploy')
```

2. Declare the target host in `config/_deploy.yml`:

```yaml
provider:
  type: docker-ssh
  ssh:
    host: 10.0.0.20 # 主机 IP 或 ~/.ssh/config 别名
    port: 22
    username: deploy
    identityFile: ${HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE} # 私钥文件路径，省略则用 ssh-agent
  remote:
    baseDir: /opt/hai/apps # 远程部署根目录
    runtime: auto # 远程运行时；auto 优先 podman，其次 docker
  expose:
    type: port
    containerPort: 3000 # 容器内端口（adapter-node 默认 3000）
    hostPort: 18080 # 宿主机端口 → 访问地址 http://10.0.0.20:18080

container:
  runtime: auto # 本地构建运行时（可选）

services: {} # 启用的服务会自动生成 compose sidecar，见下
```

3. Deploy and verify with the CLI or API (equivalent behavior):

```bash
hai deploy --env test # 读取 config/_deploy.yml，输出访问地址
```

```typescript
import { deploy } from '@h-ai/deploy'

deploy.credentials.load() // 注入 HAI_DEPLOY_* 环境变量
await deploy.init(dockerSshConfig)
const result = await deploy.deployApp('./apps/my-app', { environment: 'test' })
if (result.success) {
  result.data.url // http://<host>:<hostPort>
  result.data.healthCheck // 'passed'（HTTP 探测成功）
}
await deploy.close()
```

### How it works

For docker-ssh, `deployApp()` runs these steps:

1. **Scan**: read the target importer in `pnpm-lock.yaml` and `config/*.yml` to identify `@sveltejs/adapter-node`, required services, and backend types.
2. **Local build**: use the project's `Dockerfile` to build `hai-<app>:<deploymentId>` (podman adds `--format docker --jobs=1`).
3. **Export**: save the image as tar with `docker/podman save`.
4. **Preflight**: verify SSH connectivity and remote `docker/podman version` / `compose version`.
5. **Transfer/load**: upload tar with `scp`, load remotely, and retag under `localhost/` to avoid accidental registry pulls.
6. **Runtime files**: generate `compose.yml` (app + sidecars) and `.env.runtime` (including `HAI_*` overrides and credentials), upload to `<baseDir>/<app>/`, and set `.env.runtime` permissions to `600`.
7. **Start**: `start-<mode>.sh` exports `HAI_DEPLOY_ENVIRONMENT`/`HAI_CORE_ENV` and starts Compose. Explicit environments get separate project names and volumes; kept services retain their previous definitions.
8. **Health check**: check `/` for SvelteKit or `/health` for native Node services; require a successful response.

> Images, `compose.yml`, and `.env.runtime` are stored in the application's `.hai/deploy/<mode>/`, excluded by the template `.gitignore`.

### Feature-based compose sidecars

`deploy.scan()` identifies services and their **actual backend types** (`type` in `_db.yml` / `_vecdb.yml`, etc.), generates matching sidecars, and injects `HAI_*` overrides:

| Detected service | Backend (`type`) | Added sidecar                          | Injected variables            |
| ---------------- | ---------------- | -------------------------------------- | ----------------------------- |
| `db`             | `postgresql`     | `postgres:16-alpine`                   | `HAI_DB`                      |
| `db`             | `mysql`          | `mysql:8.4`                            | `HAI_DB`                      |
| `db`             | `sqlite`         | None (mount `/app/data` volume)        | —                             |
| `cache`          | `redis`          | `redis:7-alpine`                       | `HAI_CACHE`                   |
| `storage`        | `s3`             | RustFS / MinIO + bucket initialization | `HAI_STORAGE`                 |
| `vecdb`          | `qdrant`         | `qdrant/qdrant`                        | `HAI_VECDB`                   |
| `vecdb`          | `pgvector`       | `pgvector/pgvector`                    | `HAI_VECDB`                   |
| `vecdb`          | `chroma`         | `chromadb/chroma`                      | `HAI_VECDB`                   |
| `ldap`           | `ldap`           | OpenLDAP                               | `HAI_IAM_LDAP`                |
| `email`          | `smtp`           | Mailpit (test capture)                 | `HAI_REACH_PROVIDERS_<index>` |
| `vecdb`          | `lancedb`        | None (mount `/app/data` volume)        | —                             |

- Memory cache, disabled LDAP and console providers create no external services. Local storage uses a volume. Default SMTP captures test messages; use custom SMTP/Resend for production delivery.
- Existing cloud provisioners take precedence (for example Neon providing `HAI_DB`); no duplicate sidecar is created.
- Sidecar secrets go to ignored local private configuration and remote `.env.runtime` (`600`), never `compose.yml` or public environment files.

> Security: `identityFile` is a private key **path**, not key content. `strictHostKeyChecking: true` (default)
> uses accept-new: trust first use and reject changed keys. You may connect once manually with `ssh` for an unknown host.

## Error handling

```typescript
import { HaiDeployError } from '@h-ai/deploy'

const result = await deploy.deployApp('./apps/my-app', { environment: 'test' })
if (!result.success) {
  switch (result.error.code) {
    case HaiDeployError.AUTH_FAILED.code:
      // Vercel Token 无效
      break
    case HaiDeployError.BUILD_FAILED.code:
      // 构建失败
      break
  }
}
```

Common error codes:

| Error code                        | code             | Description                           |
| --------------------------------- | ---------------- | ------------------------------------- |
| `HaiDeployError.DEPLOY_FAILED`    | `hai:deploy:001` | Deployment failed                     |
| `HaiDeployError.BUILD_FAILED`     | `hai:deploy:003` | Build failed                          |
| `HaiDeployError.AUTH_FAILED`      | `hai:deploy:006` | Authentication failed                 |
| `HaiDeployError.PROVISION_FAILED` | `hai:deploy:007` | Provisioning failed                   |
| `HaiDeployError.NOT_INITIALIZED`  | `hai:deploy:010` | Not initialized                       |
| `HaiDeployError.ENV_VAR_FAILED`   | `hai:deploy:011` | Environment variable operation failed |

docker-ssh-specific error codes:

| Error code                                   | code             | Description                 |
| -------------------------------------------- | ---------------- | --------------------------- |
| `HaiDeployError.CONTAINER_RUNTIME_NOT_FOUND` | `hai:deploy:015` | Container runtime not found |
| `HaiDeployError.CONTAINER_BUILD_FAILED`      | `hai:deploy:016` | Image build failed          |
| `HaiDeployError.REMOTE_CONNECT_FAILED`       | `hai:deploy:017` | Remote connection failed    |
| `HaiDeployError.REMOTE_COMMAND_FAILED`       | `hai:deploy:018` | Remote command failed       |
| `HaiDeployError.IMAGE_TRANSFER_FAILED`       | `hai:deploy:019` | Image transfer failed       |
| `HaiDeployError.HEALTH_CHECK_FAILED`         | `hai:deploy:020` | Health check failed         |

## Tests

`pnpm --filter @h-ai/cli test:deploy-gates` validates current package archives with a generated fullstack project, Podman/SSH, the selected environment, login and repeat deployment. Logs and acceptance artifacts stay in ignored temporary directories.

```bash
pnpm --filter @h-ai/deploy test
```

## License

Apache-2.0

Provisioned configuration: Neon emits HAI_DB (PostgreSQL JSON), Upstash HAI_CACHE (Redis rediss URL JSON), and R2 HAI_STORAGE (flat S3 JSON). Email/SMS emit HAI_REACH_PROVIDERS; deployApp merges both channels while preserving YAML message templates, replacing the original providers array. Core supports whole-object/array overrides, with parents preceding leaves and schema validation retained. Build subprocesses and target runtimes share provisioned values. R2 needs existing S3 accessKeyId/secretAccessKey, Resend a verified-domain from address, and Alibaba Cloud approved signName/templates. Applications need matching `_db.yml` / `_cache.yml` / `_storage.yml` / `_reach.yml` loaded at startup; network clients require Node.

Configuration references: [Upstash TLS](https://upstash.com/docs/redis/features/security), [Resend SMTP](https://resend.com/docs/send-with-smtp). Deterministic acceptance generates real applications and validates Core and module schemas. It does not create cloud resources or send email/SMS, so it does not establish cloud read/write acceptance.

Deployment recovery: `ProvisionResult.resourceStatus` marks created/reused. `getDeployRecovery(result.error)` reads projectName, stage, platformProjectId, and resource lists; unknown means an uncertain request result that must first be checked in the provider console. Preserve returned IDs for failed resources. Recovery excludes envVars, raw exceptions, and credentials; the CLI shows resources and advice. Same-name retries reuse resources. Reused resources are never deleted automatically; clean up newly created resources only after manually confirming they are unused.
