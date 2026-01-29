# hai Admin Console

> 基于 hai Admin Framework 构建的现代化管理后台示例应用

[![GitHub](https://img.shields.io/badge/GitHub-200hub/hai--framework--admin--console-blue)](https://github.com/200hub/hai-framework-admin-console)
[![License](https://img.shields.io/badge/License-Apache%202.0-green)](LICENSE)

## ✨ 特性

- 🎨 **现代化 UI** - 基于 Svelte 5 Runes + TailwindCSS v4 + DaisyUI v5
- 🔐 **完整认证** - JWT 认证、角色权限、会话管理
- 📊 **数据管理** - CRUD 操作、搜索过滤、分页排序
- 🌍 **国际化** - 中英文切换支持
- 🌓 **主题切换** - 亮色/暗色主题
- 📱 **响应式** - 移动端完美适配
- 🤖 **AI 集成** - 内置 AI 对话、代码审计功能

## 🚀 快速开始

### 方式一：使用 CLI 创建（推荐）

```bash
# 安装 CLI
pnpm add -g @hai/cli

# 创建新项目（交互式选择功能）
pnpm hai create my-admin-app

# 进入项目目录
cd my-admin-app

# 启动开发服务器
pnpm dev
```

### 方式二：克隆本仓库

```bash
# 克隆仓库
git clone https://github.com/200hub/hai-framework-admin-console
cd hai-framework-admin-console

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填写必要配置

# 启动开发服务器
pnpm dev
```

### 方式三：作为 hai-framework monorepo 的子应用

```bash
# 在 hai-framework 根目录
cd apps/admin-console
pnpm dev
```

## 📋 功能模块

| 模块       | 描述                | 路由        |
| ---------- | ------------------- | ----------- |
| 🏠 仪表盘   | 数据概览、统计图表  | `/`         |
| 👥 用户管理 | 用户 CRUD、角色分配 | `/users`    |
| 🔑 角色权限 | 角色管理、权限配置  | `/roles`    |
| 📝 系统日志 | 操作日志、审计追踪  | `/logs`     |
| ⚙️ 系统设置 | 系统配置、个人设置  | `/settings` |
| 🤖 AI 对话  | 智能问答、代码审计  | `/ai`       |

## 🛠️ 技术栈

- **前端框架**: Svelte 5 + SvelteKit 2
- **样式**: TailwindCSS v4 + DaisyUI v5
- **语言**: TypeScript 5.7+
- **构建工具**: Vite 6
- **包管理**: pnpm
- **核心依赖**: @hai/* 框架包

## 📁 项目结构

```
src/
├── app.html              # HTML 模板
├── app.css               # 全局样式（TailwindCSS v4）
├── app.d.ts              # 全局类型声明
├── hooks.server.ts       # 服务端钩子（认证、日志）
├── lib/
│   ├── components/       # 业务组件
│   │   ├── layout/       # 布局组件
│   │   └── ui/           # UI 组件
│   ├── services/         # 业务服务
│   ├── stores/           # 状态管理
│   ├── types/            # 类型定义
│   └── utils/            # 工具函数
└── routes/
    ├── (app)/            # 需要认证的路由
    │   ├── +layout.svelte
    │   ├── users/        # 用户管理
    │   ├── roles/        # 角色管理
    │   ├── logs/         # 系统日志
    │   ├── settings/     # 系统设置
    │   └── ai/           # AI 功能
    ├── (auth)/           # 认证相关
    │   ├── login/
    │   └── register/
    └── api/              # API 路由
        └── v1/
```

## ⚙️ 环境变量

```bash
# .env
DATABASE_URL=file:./data/app.db    # 数据库连接
JWT_SECRET=your-secret-key          # JWT 密钥
OPENAI_API_KEY=sk-xxx               # OpenAI API Key (可选)
HAI_LOG_LEVEL=info                  # 日志级别
HAI_LOG_FORMAT=logfmt               # 日志格式 (logfmt/json)
```

## 🧪 开发命令

```bash
pnpm dev          # 启动开发服务器
pnpm build        # 构建生产版本
pnpm preview      # 预览生产版本
pnpm check        # 类型检查
pnpm lint         # 代码检查
pnpm test         # 运行测试
```

## 🎭 演示账号

| 角色     | 用户名 | 密码     |
| -------- | ------ | -------- |
| 管理员   | admin  | admin123 |
| 普通用户 | user   | user123  |

## 📝 依赖 hai-framework 包

此应用依赖以下 @hai/* 包：

- `@hai/core` - 核心工具（Result、错误处理、日志）
- `@hai/core` - 配置管理
- `@hai/crypto` - 加密模块（SM2/SM3/SM4、Argon2）
- `@hai/db` - 数据库抽象（Drizzle ORM）
- `@hai/auth` - 认证授权
- `@hai/ai` - AI 集成
- `@hai/kit` - SvelteKit 集成
- `@hai/ui` - UI 组件库

## 🔗 相关链接

- [hai-framework 主仓库](https://github.com/200hub/hai-framework)
- [框架文档](https://hai-framework.dev)
- [组件文档](https://hai-framework.dev/ui)

## 📄 许可证

Apache License 2.0 © 2024 [200hub](https://github.com/200hub)
