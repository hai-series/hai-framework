# @h-ai/ui 配置

<a id="h-aiui-文件配置"></a>

[English](ui.en.md) · [日本語](ui.ja.md)

[配置手册](README.md) · [组件与示例](../function/ui.md#component-catalog) · [浏览器存储](../data/ui.md#browser-storage)

<a id="configuration-fields"></a>

## 配置入口

`@h-ai/ui` 由 Svelte 挂载。模块没有 `config/_ui.yml`、专属环境变量或初始化函数。样式和自动导入由前端构建读取，主题、语言、导览与组件参数由应用布局和页面传入。

| 所在位置 | 谁读取 | 影响与生效时间 |
| --- | --- | --- |
| 前端入口样式，例如 `src/app.css` | Tailwind CSS 4、DaisyUI 5 | 编译 UI 类名和主题。改动后重新构建，开发服务器会更新样式。 |
| Vite 或 Svelte 配置中的预处理链 | Svelte 编译器 | 可选注册 `ui.autoImport()`，在编译使用组件的 Svelte 模板时注入导入。 |
| 根布局、HTML shell 和页面组件 | 应用代码和浏览器 | 应用主题、语言和已保存的偏好，配置控件属性和回调。 |
| `config/_core.yml` 的 `defaultLocale` | 调用 Core 初始化和语言 API 的宿主 | 宿主把配置传给 Core 后才影响服务端默认翻译。SSR 按请求选择语言。 |

<a id="style-configuration"></a>

## 构建样式和选择主题

在前端入口样式中加载 UI 样式。以单应用的 `src/app.css` 为例，`@source` 相对于这个文件解析。如果在 monorepo 中通过根 `node_modules` 安装 UI，改成实际能解析到 `@h-ai/ui/dist` 的相对路径。Vite 项目先注册 `@tailwindcss/vite`。

```css
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';
@import '@h-ai/ui/styles/theme.css';
@source '../node_modules/@h-ai/ui/dist';
@plugin 'daisyui' {
  themes: light --default, dark;
}
```

在根布局导入这个 CSS 文件后，`light` 作为初始主题，选择 `dark` 后页面和原生表单控件切换配色。应用通过 `ThemeSelector` 的 `themeIds` 限定可选主题，列表应和已编译的主题一致。移动端还可按需引入 `@h-ai/ui/styles/design-tokens.css` 和 `@h-ai/ui/styles/mobile.css`。[样式与自动导入](../function/ui.md#styles) · [主题切换示例](../function/ui.md#theme)

Fullstack 模板在生成阶段从模块选项的 `fullstack.theme.defaultTheme` 读取默认主题，从 `fullstack.theme.themes` 读取主题列表。默认是 `light`，未指定列表时模板提供 `light`、`dark`、`high-contrast`、`formal`、`eye-care` 和 `liquid-glass`。默认主题会加入列表。项目生成后，各端的 `src/app.css` 决定编译的主题，共享主题 store 决定可选主题与回退值。[CLI 生成入口](../function/cli.md)

<a id="runtime-preferences"></a>

## 运行时偏好

- **主题**。普通布局用 `ui.getSavedTheme(fallback)` 读取主题名，用 `ui.applyTheme(id)` 应用并保存。HTML shell 如需在加载 Svelte 前恢复主题，可用 `ui.createThemeBootstrapScript(options)`，并为 JSON 偏好选择一个独立的存储键。
- **语言**。浏览器可用 `ui.createLocaleStore(options)` 优先读取可用的已保存语言，再检测浏览器语言，最后回退。若应用用 Paraglide 渲染业务文案，切换时也要调用应用自己的 `setLocale`。服务端按请求用 `core.i18n.runWithLocale` 或 `kit.i18n.runWithLocale` 包裹实际渲染。
- **导览和组件**。在布局中调用 `ui.createGuide(options)`，在页面上传组件属性与宿主回调。存储方式、复制、上传、检索等能力随代码接线生效。服务地址、鉴权和持久化由宿主提供。

[Core 默认语言](core.md) · [Kit 语言和请求上下文](../function/kit.md#hooks) · [调用参数](../function/ui.md#call-options)
