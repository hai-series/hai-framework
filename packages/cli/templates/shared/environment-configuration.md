# 分环境配置

应用运行参数集中在各项目的环境文件。公共文件只保存可公开的值，凭据写入本机覆盖或由部署平台注入。

| 文件           | 用途                                                   | Git    |
| -------------- | ------------------------------------------------------ | ------ |
| `.env.example` | 所有可用字段的示例、用途、枚举和范围；可选字段保留注释 | 提交   |
| `.env`         | 所有环境共用的公共基础配置                             | 提交   |
| `.env.dev`     | 开发环境公共覆盖                                       | 提交   |
| `.env.test`    | 测试环境公共覆盖                                       | 提交   |
| `.env.prod`    | 生产环境公共覆盖                                       | 提交   |
| `.env.local`   | 当前机器的私有配置，覆盖公共配置                       | 不提交 |

YAML 使用 `${HAI_DB_TYPE:sqlite}` 等显式引用，冒号后是未配置时的本地默认值。应用仍通过 `core.config.validate(name, ModuleConfigSchema)` 和模块初始化校验类型、枚举、范围和必填项；插值本身不能代替校验。只开启实际使用的模块，未启用模块的整份 YAML 保留注释。

## 命名和类型

- `HAI_<配置名>_<字段路径>`：`_db.yml` 的 `type` 对应 `HAI_DB_TYPE`；`_ai.yml` 的 `llm.apiKey` 对应 `HAI_AI_LLM_APIKEY`。camelCase 不拆词，数组使用从零开始的索引，如 `HAI_AI_AUDIO_MODELS_0_BASEURL`。
- 框架配置统一采用路径命名，如 `HAI_REACH_PROVIDERS_0_PASS`。第三方 SDK 自身读取的 `OPENAI_API_KEY` 等外部变量保留厂商约定；应用 YAML 使用框架标准名。
- 完整变量引用按 YAML 标量还原类型：布尔用 `true/false`，数字不带单位；要保留看似数字/布尔的字符串，在环境值中保留 YAML 引号，例如 dotenv 中 `HAI_AI_LLM_APIKEY='"123456"'`。空字符串保持为空字符串。
- `HAI_DB` 等父级变量可用 JSON/YAML 整体替换对象，优先于子级变量；非必要不整体覆盖，避免遗漏字段。
- `PUBLIC_` / `VITE_` 只用于浏览器可见的 API 地址和非敏感参数。业务正文、模板 ID、表名/列名及数据结构留在代码/YAML；环境参数不能改变固定表结构契约。

## 加载与启动

| 入口             | 开发       | 测试环境                 | 生产环境                                      |
| ---------------- | ---------- | ------------------------ | --------------------------------------------- |
| Vite / SvelteKit | `pnpm dev` | `pnpm dev:test`          | `pnpm build:prod` 或 `pnpm dev:prod` 预览配置 |
| Node service     | `pnpm dev` | 构建后 `pnpm start:test` | 构建后 `pnpm start:prod`                      |

所有入口优先级一致：**进程环境 > `.env.local` > `.env.<dev|test|prod>` > `.env`**。Vite 配置在 Node 阶段通过 `core.config.loadEnvFiles({ mode, envDir })` 读取，检查 `success` 后注入进程；`development`/`production` 分别映射到 `dev`/`prod`。Node 服务按 `.env`、环境文件、`.env.local` 的顺序传入 `--env-file`，后者覆盖前者，已有进程环境最高。`core.init` 只读取已注入的变量，不自行读取 dotenv。

`prod` 是文件模式名，对应 `HAI_CORE_ENV=production`；环境枚举为 `development | test | production | staging`。SvelteKit adapter-node 产物使用 `node --env-file=.env --env-file=.env.prod --env-file-if-exists=.env.local build/index.js`。文件路径相对进程工作目录，公共文件随项目提交；容器通过部署平台或 `--env-file` 注入目标环境值。浏览器只接收公开白名单，构建产物和镜像不包含 `.env.local`。

Fullstack 的环境文件在工程根；service 脚本通过 `../../.env*` 加载，Web/App/Desktop 的 Vite `envDir` 指向根目录。API workspace 的环境文件在 `apps/<name>-service/`。独立应用在各自根目录加载。浏览器配置在构建期注入时，改环境参数后须重新构建；fullstack 的公开应用元数据由 service `app.info` 返回。

## 迁移已有项目

先把原来被忽略的 `.env` 私有值迁入 `.env.local`，再提交公共基础和环境文件。本机文件只保留需要覆盖的值，避免整份复制示例后固定开发环境。旧的 `HAI_AI_LLM_API_KEY` / `HAI_AI_LLM_BASE_URL` 改为 `HAI_AI_LLM_APIKEY` / `HAI_AI_LLM_BASEURL`；音频和图像厂商回退变量同样使用 `APIKEY` 后缀。Reach 和 deploy 凭据按当前 YAML 路径命名，以项目 `.env.example` 为准，同步迁移部署平台变量和本机文件。

原 `HAI_AI_ANTHROPIC_API_KEY` / `HAI_AI_ANTHROPIC_BASE_URL` 不再使用。默认协议为 `anthropic` 时改用标准 LLM 变量；混合模型池中有独立凭据或端点时，将 `apiKey` / `baseUrl` 配置在对应模型项。厂商回退 `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` 保留，优先级以 AI 模块说明为准。

## 常用变量及约束

| 变量                                                              | 说明与取值约束                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `HAI_CORE_ENV`                                                    | `development \| test \| production \| staging`                                         |
| `HAI_CORE_DEBUG`                                                  | `true \| false`                                                                        |
| `HAI_CORE_LOGGING_LEVEL`                                          | `trace \| debug \| info \| warn \| error \| fatal`                                     |
| `HAI_CORE_LOGGING_FORMAT`                                         | `json \| pretty`                                                                       |
| `HAI_DB_TYPE`                                                     | `sqlite \| postgresql \| mysql`                                                        |
| `HAI_DB_DATABASE`                                                 | SQLite 文件路径或 `:memory:`；网络数据库为数据库名                                     |
| `HAI_DB_HOST` / `HAI_DB_PORT` / `HAI_DB_USER` / `HAI_DB_PASSWORD` | 主机、整数端口 1–65535、用户名、敏感密码；PostgreSQL 常用 5432，MySQL 常用 3306        |
| `HAI_DB_URL` / `HAI_DB_SSL`                                       | 非空连接 URL 优先于拆分字段；TLS 为布尔值、require/prefer/allow/disable 或 TLS 对象    |
| `HAI_CACHE_TYPE` / `HAI_CACHE_DB`                                 | `memory \| redis`；DB 为整数 0–15；memory 仅单进程使用                                 |
| `HAI_STORAGE_TYPE`                                                | `local \| s3`；local 要求 root，s3 要求 bucket、region、accessKeyId、secretAccessKey   |
| `HAI_SERV_SERVER_HOST` / `HAI_SERV_SERVER_PORT`                   | HTTP 主机和整数端口 1–65535；部署平台 HOST/PORT 可覆盖                                 |
| `HAI_AI_LLM_API` / `HAI_AI_LLM_TEMPERATURE`                       | `chat \| responses \| anthropic`；temperature 为数字 0–2                               |
| `HAI_AI_LLM_APIKEY` / `HAI_AI_LLM_BASEURL` / `HAI_AI_LLM_MODEL`   | 厂商密钥、服务 URL、实际可用模型名；启用时满足厂商要求                                 |
| `HAI_ADMIN_DEFAULT_PASSWORD`                                      | 首次创建管理员的密码，满足 IAM 密码策略；CLI 为 fullstack 本地 `.env.local` 生成随机值 |
| `PUBLIC_API_BASE`                                                 | 可公开的 API 地址，不得包含用户名、密码或 token                                        |

其余变量逐项见对应 `.env.example` 及模块公开 Schema；可选块启用后也应使用相同命名、显式引用与逐项说明。

## 跨环境切换数据库

保持 `_db.yml` 不变，在公共 `.env.test` 设置：

```dotenv
HAI_DB_TYPE=sqlite
HAI_DB_DATABASE=:memory:
```

在公共 `.env.prod` 设置非敏感连接参数，密码由生产进程或目标机器 `.env.local` 注入：

```dotenv
HAI_DB_TYPE=postgresql
HAI_DB_DATABASE=my_app
HAI_DB_HOST=db.internal
HAI_DB_PORT=5432
HAI_DB_USER=my_app
# 在目标环境注入 HAI_DB_PASSWORD，或提供完整 HAI_DB_URL。
HAI_DB_SSL=require
```

切换到 MySQL 时相应设置 `HAI_DB_TYPE=mysql`、端口和凭据。确保项目已安装所选 Provider 的驱动；数据库数据迁移另行执行，切换配置不会搬迁数据。缓存切到 Redis、存储切到 S3 时同样填写对应连接字段。
