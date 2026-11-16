# UI 配置

[配置手册](README.md)

## 配置入口

在 Svelte 项目中安装样式依赖，并按项目需要设置 Tailwind CSS、DaisyUI 和补丁。组件的标题、选项和操作函数直接写在组件标签上，例如 `<Button onclick={save}>保存</Button>`。整个页面共享的主题、语言和导览进度通常在根布局中设置一次。

## 配置示例

```ts
import { createGuide } from '@h-ai/ui/guide'
import { createLocaleStore } from '@h-ai/ui/i18n'
import { applyTheme } from '@h-ai/ui/theme'

applyTheme('light')
const locale = createLocaleStore({ defaultLocale: 'zh-CN', persistKey: 'orders-locale' })
const guide = createGuide({ tours: [], persistence: 'memory' })
```

在浏览器中调用 `applyTheme('light')` 后，页面切换为浅色主题。`createLocaleStore()` 返回给组件树共享的语言状态，示例使用 `orders-locale` 保存语言偏好。`createGuide()` 返回导览控制器。示例没有设置具体步骤，刷新页面后内存中的导览进度会丢失。可按功能使用以上三个公开导入路径。

## 配置清单

| 配置项                                                     | 默认值/必填                         | 说明                                                                                                                         |
| ---------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `applyTheme(theme, persist)`                               | `theme` 必填，`persist` 默认 `true` | 从支持的主题 ID 中选择。被持久化的主题写入浏览器的 `theme` 键                                                                |
| 主题色 `DEFAULT_THEME_COLOR`                               | `#5765f0`                           | 内建主题色，应用可用 CSS 自定义属性替换                                                                                      |
| `createThemeBootstrapScript.storageKey`                    | 必填                                | 首屏脚本读取的浏览器偏好存储键                                                                                               |
| `createThemeBootstrapScript.defaultThemeId`                | `light`                             | 浏览器还没有有效偏好时使用的主题                                                                                             |
| `createThemeBootstrapScript.defaultThemeColor`             | 可省略                              | 指定时使用十六进制颜色；空值跳过默认颜色设置                                                                                 |
| `createThemeBootstrapScript.colorCssVar`、`toneDatasetKey` | 可省略                              | 指定后写入主题颜色 CSS 变量、亮暗色数据属性                                                                                  |
| `createThemeBootstrapScript.locale`                        | 可省略                              | 同时规范化首屏语言信息，提供 `key`、`defaultValue`、`supportedValues`                                                        |
| `createLocaleStore.defaultLocale`                          | `zh-CN`                             | 没有有效候选语言时的默认值                                                                                                   |
| `createLocaleStore.supportedLocales`                       | 框架内建语言列表                    | 填应用实际支持的语言，每项有 `code` 和显示名称 `label`，例如 `{ code: 'en-US', label: 'English' }`                           |
| `createLocaleStore.detectBrowser`                          | `true`                              | 浏览器有多项语言偏好时依序匹配                                                                                               |
| `createLocaleStore.persistKey`                             | `hai-locale`                        | 用于保存浏览器语言偏好的键                                                                                                   |
| `createGuide.tours`                                        | 必填，可为 `[]`                     | 可执行的导览与步骤                                                                                                           |
| `createGuide.articles`                                     | 可省略                              | 帮助中心文章                                                                                                                 |
| `createGuide.persistence`                                  | `cookie`                            | 也可选 `localStorage` 或 `memory`，用于存放导览进度                                                                          |
| `createGuide.persistKey`                                   | `hai-guide`                         | 导览进度键前缀。同源部署多个应用时分别配置                                                                                   |
| `createGuide.nav`                                          | 可省略                              | 应用自带的路由导航适配器                                                                                                     |
| `createGuide.waitTimeout`                                  | `3000`                              | 等待每个导览目标 DOM 元素的毫秒数                                                                                            |
| `AuthPanel.config`、`actions`                              | 由应用传入                          | `config` 决定页面显示哪些选项，可用 [IAM 接口返回的设置](api-contract.md#配置清单)。`actions` 接收点击登录或注册时调用的函数 |
| CRUD `resource`、`controller options`                      | 资源和 API 回调由应用提供           | 配置字段展示、表单、分页和加载行为，例如 `autoLoad: false` 关闭自动加载                                                      |
| 表单、Toast、其他组件 Props                                | 由组件指定                          | 通过组件入参配置布局、回调或时长等控件表现。[页面体验配置](experience.md)                                                    |

## 生效与核对

浏览器只保存主题和语言等外观偏好。服务端渲染时，为每次请求创建各自的语言状态。例如一个请求选择中文，另一个请求选择英文，两个页面都应显示各自的语言。CLI 生成项目可以沿用模板已有的依赖补丁。手工接入时核对补丁对应的依赖版本。[补丁目录](../../../patches/)
