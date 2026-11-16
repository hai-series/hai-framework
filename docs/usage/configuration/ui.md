# UI 配置

[配置手册](README.md)

## 配置入口

宿主负责 Svelte、Tailwind CSS、DaisyUI 与项目补丁配置。组件的展示和业务交互参数通过 Svelte Props、绑定及回调传入。主题、语言和导览在应用启动时通过对应函数装配。组件按项目公用配置和各自的 Props 分层消费参数。

## 配置示例

```ts
import { applyTheme, createGuide, createLocaleStore } from '@h-ai/ui'

applyTheme('light')
const locale = createLocaleStore({ defaultLocale: 'zh-CN', persistKey: 'orders-locale' })
const guide = createGuide({ tours: [], persistence: 'memory' })
```

## 配置清单

| 配置项                                                     | 默认值/必填                         | 说明                                                                          |
| ---------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `applyTheme(theme, persist)`                               | `theme` 必填，`persist` 默认 `true` | 从支持的主题 ID 中选择。被持久化的主题写入浏览器的 `theme` 键                 |
| 主题色 `DEFAULT_THEME_COLOR`                               | `#5765f0`                           | 模块内建的主题色，可由宿主接入 CSS 自定义属性                                 |
| `createThemeBootstrapScript.storageKey`                    | 必填                                | 首屏脚本读取的浏览器偏好存储键                                                |
| `createThemeBootstrapScript.defaultThemeId`                | `light`                             | 浏览器还没有有效偏好时使用的主题                                              |
| `createThemeBootstrapScript.defaultThemeColor`             | 可省略                              | 指定时使用十六进制颜色；空值跳过默认颜色设置                                  |
| `createThemeBootstrapScript.colorCssVar`、`toneDatasetKey` | 可省略                              | 指定后写入主题颜色 CSS 变量、亮暗色数据属性                                   |
| `createThemeBootstrapScript.locale`                        | 可省略                              | 同时规范化首屏语言信息，提供 `key`、`defaultValue`、`supportedValues`         |
| `createLocaleStore.defaultLocale`                          | `zh-CN`                             | 没有有效候选语言时的默认值                                                    |
| `createLocaleStore.supportedLocales`                       | 框架内建语言列表                    | 宿主可限制支持语言，匹配后使用列表中的原始语言代码                            |
| `createLocaleStore.detectBrowser`                          | `true`                              | 浏览器有多项语言偏好时依序匹配                                                |
| `createLocaleStore.persistKey`                             | `hai-locale`                        | 用于保存浏览器语言偏好的键                                                    |
| `createGuide.tours`                                        | 必填，可为 `[]`                     | 可执行的导览与步骤                                                            |
| `createGuide.articles`                                     | 可省略                              | 帮助中心文章                                                                  |
| `createGuide.persistence`                                  | `cookie`                            | 也可选 `localStorage` 或 `memory`，用于存放导览进度                           |
| `createGuide.persistKey`                                   | `hai-guide`                         | 导览进度键前缀。同源部署多个应用时分别配置                                    |
| `createGuide.nav`                                          | 可省略                              | 应用自带的路由导航适配器                                                      |
| `createGuide.waitTimeout`                                  | `3000`                              | 等待每个导览目标 DOM 元素的毫秒数                                             |
| `AuthPanel.config`、`actions`                              | 由应用传入                          | 可以采用 [IAM 公开配置](api-contract.md#配置清单)，并注入登录、注册等宿主操作 |
| CRUD `resource`、`controller options`                      | 资源和 API 回调由应用提供           | 配置字段展示、表单、分页和加载行为，例如 `autoLoad: false` 关闭自动加载       |
| 表单、Toast、其他组件 Props                                | 由组件指定                          | 通过组件入参配置布局、回调或时长等控件表现。[页面体验配置](experience.md)     |

## 生效与核对

浏览器主题和语言偏好只保存公开设置。SSR 时按组件树或请求创建语言上下文；不同请求各自解析语言。使用 CLI 生成项目可沿用已有补丁注册。手工装配使用仓库中的对应补丁版本及注册方式。[补丁目录](../../../patches/)
