# CLI Templates

此目录包含 `hai create` 命令使用的项目模板文件。

## 目录结构

```
templates/
├── base/                    # 所有应用类型共用的骨架文件
│   ├── package.json.hbs     # 动态：按 features 注入依赖
│   ├── vite.config.ts.hbs   # 动态：按 hasI18n / hasUi 注入插件
│   ├── tsconfig.json
│   ├── svelte.config.js
│   ├── .gitignore
│   ├── playwright.config.ts
│   └── src/
│       ├── app.html.hbs         # 动态：i18n 时输出 %lang% 占位符
│       ├── app.d.ts
│       ├── app.css
│       ├── hooks.server.ts.hbs  # 动态：按 features / hasI18n 组装 handle 序列
│       └── lib/server/
│           └── init.ts.hbs      # 动态：按 features 注入模块初始化
│
├── apps/                    # 应用类型专属路由与页面
│   ├── admin/               # 管理后台
│   │   ├── messages/        # i18n 消息文件（zh-CN / en-US）
│   │   └── src/routes/      # +page / +layout .svelte.hbs
│   ├── website/             # 企业官网
│   │   ├── messages/
│   │   └── src/routes/
│   ├── h5/                  # H5 移动端
│   │   ├── messages/
│   │   └── src/routes/
│   └── api/                 # 纯 API 服务（无 UI / 无 i18n）
│       └── src/routes/
│
├── features/                # 可选 feature 路由（叠加到 src/routes/）
│   ├── iam/
│   │   ├── routes-shared/   # 所有应用类型共用（API 端点）
│   │   ├── routes-admin/    # admin 专属（登录/注册页 .hbs）
│   │   └── routes-h5/       # h5 专属（登录/注册页 .hbs）
│   ├── storage/
│   │   └── routes/          # 上传 API
│   └── ai/
│       └── routes/          # 聊天流 API
│
├── i18n/                    # i18n 脚手架（hasI18n 时复制到项目根）
│   └── project.inlang/
│       └── settings.json    # Paraglide 项目配置
│
└── skills/                  # AI Skill 模板（供 CLI 分发，非项目模板）
```

## 文件类型说明

| 类型                                       | 处理方式                                     |
| ------------------------------------------ | -------------------------------------------- |
| 普通文件（`.ts` / `.svelte` / `.json` 等） | 直接复制，内容不变                           |
| `.hbs` 文件                                | 经 Handlebars 渲染后输出（去掉 `.hbs` 后缀） |

## 渲染上下文（TemplateContext）

所有 `.hbs` 文件可使用以下变量：

| 变量                   | 类型      | 说明                                         |
| ---------------------- | --------- | -------------------------------------------- |
| `{{projectName}}`      | `string`  | 项目名称（如 `my-app`）                      |
| `{{appType}}`          | `string`  | 应用类型：`admin` / `website` / `h5` / `api` |
| `{{hasUi}}`            | `boolean` | 是否包含 UI（非 `api` 类型为 `true`）        |
| `{{hasI18n}}`          | `boolean` | 是否启用 i18n（非 `api` 类型为 `true`）      |
| `{{defaultLocale}}`    | `string`  | 默认语言，如 `zh-CN`                         |
| `{{packageManager}}`   | `string`  | 包管理器：`pnpm` / `npm` / `yarn`            |
| `{{features.iam}}`     | `boolean` | 是否选中 iam feature                         |
| `{{features.db}}`      | `boolean` | 是否选中 db feature                          |
| `{{features.cache}}`   | `boolean` | 是否选中 cache feature                       |
| `{{features.crypto}}`  | `boolean` | 是否选中 crypto feature                      |
| `{{features.storage}}` | `boolean` | 是否选中 storage feature                     |
| `{{features.ai}}`      | `boolean` | 是否选中 ai feature                          |

### 常用条件写法

```handlebars
{{!-- 按 feature 条件注入内容 --}}
{{#if features.iam}}
import { iam } from '@h-ai/iam'
{{/if}}

{{!-- 按 i18n 条件切换内容 --}}
{{#if hasI18n}}
  <title>{m.page_title()}</title>
{{else}}
  <title>首页</title>
{{/if}}
```

## 生成流程

模板引擎执行 6 个步骤：

1. **复制 `base/` 静态文件** → 项目根
2. **复制 `apps/{appType}/` 路由** → 项目根（`messages/` 仅 `hasI18n` 时复制）
3. **叠加 feature 静态路由** → `src/routes/`
4. **渲染所有 `.hbs` 文件** — `base/` + `apps/{appType}/` 输出到项目根；`features/*/routes*/` 输出到 `src/routes/`
5. **复制 `i18n/` 脚手架** → 项目根（仅 `hasI18n` 时）
6. **确保 `static/` 目录存在**

## 新增模板

### 新增应用页面

在 `apps/{appType}/src/routes/` 下创建 `.svelte` 或 `.svelte.hbs` 文件。若含用户可见文本，使用 `.hbs` 并加 `{{#if hasI18n}}` 条件，同时在对应的 `apps/{appType}/messages/` 里补充 i18n key。

### 新增 feature 路由

在 `features/{featureId}/routes-shared/`（API 路由）或 `features/{featureId}/routes-{appType}/`（UI 页面）下创建文件，然后在 `template-engine.ts` 的 `FEATURE_ROUTE_DIRS` / `FEATURE_APP_ROUTE_DIRS` 中注册该目录。
