---
name: hai-review-app
description: "Use when: reviewing app code in hai-framework, auditing app quality, checking app conventions, reviewing routes, reviewing API service workspaces, app security, app i18n review. 对 hai-framework 应用层代码进行审查：路由安全 → 认证授权 → i18n → 组件使用 → API 端点 / service workspace → 服务层 → 性能。"
---

# hai-review-app — 应用代码审查规范

> 面向 AI 助手的应用审查指南。适用于 `apps/` 下的 SvelteKit 应用、纯 Svelte/Vite 客户端与 API service workspace；审查基准参照 `hai-create-app`。

---

## §1 审查准则

1. **先读后改**：审查前先读 `hai-create-app` 确认基准。
2. **分层审查**：UI 层 → 服务层 → API 层 → 基础设施层，逐层展开。
3. **成套更新**：代码 / 翻译 / 测试 / 文档同步。

---

## §2 结构与分层审查

- [ ] 目录结构符合 `hai-create-app §2`
- [ ] 禁止在 UI 层写业务逻辑（组件只负责渲染和交互）
- [ ] 禁止在 services 层写 UI 代码（不引用 Svelte / DOM）
- [ ] 底层操作通过 @h-ai 模块调用，不直接操作 DB/加密/存储
- [ ] init.ts 按依赖顺序初始化

---

## §3 认证与授权审查

- [ ] hooks.server.ts 包含完整初始化 + i18n + 会话验证
- [ ] 保护路由有 `+layout.server.ts` 守卫（检查 `locals.session`）
- [ ] API 端点有权限检查（`kit.guard.require` / `kit.guard.check`）
- [ ] 认证守卫 + API 权限双重保护
- [ ] token 使用 httpOnly cookie 或安全 TokenStore，未存 localStorage
- [ ] 重定向目标经过校验（防 Open Redirect，只允许站内路径）
- [ ] CSRF token 通过 `kit.client.create` 自动附加

---

## §4 路由与页面审查

- [ ] 路由组织合理（认证分组、保护目录、API 分离）
- [ ] `+page.svelte` 使用 `$props()` 接收 data，类型正确
- [ ] `+page.server.ts` 并行加载无依赖数据（`Promise.all`）
- [ ] 无 N+1 数据加载（循环中 await）
- [ ] 分页参数校验（正整数、上限）
- [ ] Svelte 组件只做渲染和交互，无业务逻辑

---

## §5 API 端点审查

- [ ] 输入用 Zod Schema 校验（`kit.validate.body` / `query` / `params`）
- [ ] 权限用 `kit.guard.require`
- [ ] 响应用 `kit.response.*`（不手动构造 Response）
- [ ] HaiResult 型错误用 `kit.response.fromError` 转换
- [ ] Schema 定义集中在 `lib/server/schemas/`
- [ ] 文件上传有类型白名单 + 大小限制
- [ ] 无 SQL 字符串拼接

---

## §6 i18n 审查

- [ ] 所有用户可见文本使用 i18n key
- [ ] 未直接修改 `src/lib/paraglide/` 生成文件
- [ ] @h-ai/ui 场景组件未传入不必要的翻译 props
- [ ] 翻译键命名一致（`{page}_{element}`）
- [ ] zh-CN 和 en-US 两个文件保持同步
- [ ] 日志消息英文，代码注释中文

---

## §7 UI 组件审查

- [ ] 使用 @h-ai/ui 已有组件，未重复实现
- [ ] `{@html}` 仅用于受控 HTML（已 sanitize）
- [ ] 客户端 localStorage 无敏感 token
- [ ] 组件 props 使用 TypeScript 类型，无 `any`
- [ ] 权限组件使用 `setPermissionContext()` + `usePermission()`

---

## §7.1 产品体验与交互审查（用户视角走查）

> 以真实用户身份从入口走到目标页面，逐路径确认体验闭环。

### 视觉与布局

- [ ] 页面层级与视觉重心清晰，主操作（CTA）足够突出
- [ ] spacing / alignment / color 统一使用 design token，无散落 magic number
- [ ] 响应式断点（桌面 / 平板 / 移动）下无溢出、遮挡、错位
- [ ] 暗色 / 亮色主题下文字对比度满足 WCAG AA

### 交互流程

- [ ] 关键路径步骤最短，无多余跳转或确认
- [ ] 危险操作（删除、提交、不可逆变更）有**二次确认 + 可撤销**机制
- [ ] 所有可点击区域 hit area ≥ 44px（移动端尤其）
- [ ] 表单：失焦校验 + 提交校验 + 错误聚焦回首个错误项
- [ ] 长任务有进度反馈（百分比 / 预计时间 / skeleton）

### 四态反馈（必须完整）

| 状态 | 检查 |
|------|------|
| Loading | 骨架屏或 spinner，相关按钮禁用防重复提交 |
| Empty | 友好空态插画 + 引导操作（"新建第一个"） |
| Error | 具体可操作的提示（"请输入有效邮箱"，非"输入有误"），含重试 |
| Success | 即时反馈（toast / inline）+ 后续动作引导 |

### 边界与产品逻辑

- [ ] 边缘场景覆盖：空数据、超长文本（截断/换行）、并发操作、权限不足、网络抖动
- [ ] 无死路：用户在任意页面都能退出/返回，面包屑与浏览器返回行为一致
- [ ] 导航结构与用户心智模型吻合（功能分组、层级深度 ≤ 3）
- [ ] 国际化文本展开后不破坏布局（德语 / 中文长短差异）
- [ ] 业务规则边界明确：配额、超限、过期等场景有明确文案

---

## §8 安全审查

### 输入与注入

- [ ] API 边界 Zod Schema 校验
- [ ] SQL 参数化（`?` 占位符）
- [ ] 无 `eval` / `Function` / `innerHTML`（受控 SVG 除外）
- [ ] 文件路径操作校验合法性，无 `../` 逃逸

### 认证与密钥

- [ ] 无硬编码密钥
- [ ] `PUBLIC_` 前缀变量无敏感信息
- [ ] 敏感信息未出现在日志中
- [ ] 服务端密钥用 `$env/static/private`
- [ ] 登录/注册 API 不向前端返回 `accessToken`（优先使用 httpOnly Cookie 会话）
- [ ] 前端不使用 `localStorage` / `sessionStorage` / `kit.auth.createTokenStore` 持久化敏感 Token
- [ ] 默认/初始管理员密码不写入日志；首次初始化密码必须通过环境变量或安全密钥管理注入

### HTTP 安全

- [ ] CORS / CSP / X-Content-Type-Options 响应头
- [ ] 外部 URL 经过校验（防 SSRF）

---

## §9 性能审查

- [ ] 无 await-in-loop（N+1）
- [ ] 并行加载无依赖数据（`Promise.all`）
- [ ] 大列表分页
- [ ] 模块实例缓存复用
- [ ] 无阻塞同步 I/O（运行时路径）

---

## §10 审查流程

### 快速审查（单个路由/页面）

1. 读取相关文件（+page.svelte、+page.server.ts、API、Schema）
2. 逐条检查 §2-§9 中相关项
3. 输出问题清单（P0-P3）

### 完整审查（整个应用）

1. 从 hooks.server.ts 和 init.ts 开始
2. 逐路由组审查（认证组 → 管理组 → API 组）
3. 审查服务层和 Schema
4. 审查 i18n 和 UI 组件使用
5. **走查产品体验**（§7.1 四态 / 危险操作 / 死路 / 响应式）
6. 汇总 + 修复 P0/P1 + 门禁验证


### 问题格式

```
### {等级} 问题标题
- 位置：`src/routes/xx/+page.server.ts` L42
- 问题：具体描述
- 风险：后果
- 建议：改进方案
```

| 等级 | 含义 | 处理 |
|------|------|------|
| **P0** | 安全漏洞 / 数据泄露 / 服务崩溃 | 立即修复 |
| **P1** | 权限绕过 / 认证缺失 / 错误吞没 | 本轮修复 |
| **P2** | 性能瓶颈 / 缺少校验 / i18n 遗漏 | 建议修复 |
| **P3** | 风格 / 命名 / 结构 | 顺手修复 |

---

## 示例触发语句

- "审查 admin-console 代码"
- "review h5-app 的认证流程"
- "检查这个页面的安全性"
- "审查 API 端点"
