# hai API Service

> 基于 hai-framework 构建的 SvelteKit 无头 REST API 服务示例应用，展示框架核心模块集成能力。

## ✨ 特性

- 🚀 **轻量 API 服务** — SvelteKit + Node Adapter，部署为独立 Node.js 服务
- 📦 **标准 CRUD** — Items 资源的完整增删改查接口
- 💾 **数据持久化** — @h-ai/reldb（SQLite / PostgreSQL / MySQL）
- ⚡ **缓存加速** — @h-ai/cache（memory / Redis），列表与详情自动缓存
- 🛡️ **中间件** — 统一日志、限流、错误处理（@h-ai/kit）
- 🔧 **配置校验** — 基于 Zod Schema 的启动前配置校验

## 🚀 快速开始

### 前置要求

- Node.js ≥ 20
- pnpm ≥ 9

### 安装与启动

```bash
# 在 hai-framework monorepo 根目录
pnpm install

# 启动开发服务器
pnpm --filter api-service dev
```

### 构建

```bash
pnpm --filter api-service build
pnpm --filter api-service preview
```

## ⚙️ 配置

### YAML 配置文件

- `config/_core.yml`：应用名称、版本、运行环境
- `config/_db.yml`：数据库连接（SQLite / PostgreSQL / MySQL）
- `config/_cache.yml`：缓存类型及连接参数（memory / Redis）

配置值支持 `${ENV_VAR:default}` 语法引用环境变量。

### 环境变量

| 变量名               | 说明            | 默认值                  |
| -------------------- | --------------- | ----------------------- |
| `HAI_RELDB_TYPE`     | 数据库类型      | `sqlite`                |
| `HAI_RELDB_DATABASE` | 数据库路径/地址 | `./data/api-service.db` |
| `HAI_CACHE_TYPE`     | 缓存类型        | `memory`                |

## 📋 API 端点

| 方法     | 路径                | 说明                   |
| -------- | ------------------- | ---------------------- |
| `GET`    | `/api/v1/health`    | 健康检查               |
| `GET`    | `/api/v1/items`     | 列表（支持分页、搜索） |
| `POST`   | `/api/v1/items`     | 创建                   |
| `GET`    | `/api/v1/items/:id` | 详情                   |
| `PUT`    | `/api/v1/items/:id` | 更新                   |
| `DELETE` | `/api/v1/items/:id` | 删除                   |

## 🧪 开发命令

```bash
pnpm --filter api-service dev         # 启动开发服务器
pnpm --filter api-service build       # 构建生产版本
pnpm --filter api-service preview     # 预览生产版本
pnpm --filter api-service check       # Svelte + TypeScript 类型检查
pnpm --filter api-service lint        # ESLint 代码检查
pnpm --filter api-service test:e2e    # 运行 E2E 测试（Playwright）
```
