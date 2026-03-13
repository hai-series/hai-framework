# hai Desktop App

> hai Agent Framework - 桌面应用（Tauri v2 + SvelteKit SPA）

## 技术栈

- **桌面壳**：Tauri v2（Rust）
- **前端**：SvelteKit + Svelte 5 + TailwindCSS + DaisyUI
- **i18n**：Paraglide
- **UI 组件**：@h-ai/ui

## 前置要求

- [Rust](https://www.rust-lang.org/tools/install)（含 `cargo`）
- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) ≥ 9
- Windows：需安装 [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 和 WebView2
- macOS：需安装 Xcode Command Line Tools
- Linux：需安装 `libwebkit2gtk-4.1-dev`、`build-essential`、`libssl-dev` 等系统依赖

## 快速开始

```bash
# 1. 安装依赖（在仓库根目录）
pnpm install

# 2. 启动开发模式（前端 + Tauri 窗口）
cd apps/desktop-app
pnpm tauri:dev

# 3. 构建生产包
pnpm tauri:build
```

## 项目结构

```
desktop-app/
├── src/                  # SvelteKit 前端源码
│   ├── routes/           # 页面路由
│   ├── lib/              # 共享逻辑
│   ├── app.html          # HTML 模板
│   └── app.css           # 全局样式
├── src-tauri/            # Tauri Rust 后端
│   ├── src/
│   │   ├── main.rs       # 桌面入口
│   │   └── lib.rs        # 核心逻辑 + Commands
│   ├── capabilities/     # 权限声明
│   ├── icons/            # 应用图标
│   ├── Cargo.toml        # Rust 依赖
│   ├── build.rs          # 构建脚本
│   └── tauri.conf.json   # Tauri 配置
├── messages/             # i18n 翻译文件
├── static/               # 静态资源
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## 开发说明

- SvelteKit 使用 `adapter-static` 输出纯静态 SPA（`ssr = false`）
- Tauri 负责将 SPA 包装为原生桌面窗口
- 前端通过 `@tauri-apps/api` 调用 Rust 后端 Commands
- 开发时 Tauri 连接 Vite dev server（端口 5176）；构建时使用 `build/` 目录
