# CLI Templates

此目录包含 `hai create` 命令使用的项目模板文件。

## 目录结构

```
templates/
├── shared/              # 共用模板文件
│   ├── app.html.hbs
│   ├── app.d.ts.hbs
│   ├── hooks.server.ts.hbs
│   ├── svelte.config.js.hbs
│   ├── vite.config.ts.hbs
│   └── gitignore.hbs
├── admin/               # 管理后台模板
│   ├── routes/
│   └── lib/
├── website/             # 企业官网模板
│   └── routes/
├── h5/                  # H5 移动端模板
│   └── routes/
└── api/                 # API 服务模板
    └── routes/
```

## 模板引擎

使用 [Handlebars](https://handlebarsjs.com/) 模板引擎。

### 可用变量

| 变量              | 说明            |
| ----------------- | --------------- |
| `{{projectName}}` | 项目名称        |
| `{{pascalCase}}`  | PascalCase 名称 |
| `{{camelCase}}`   | camelCase 名称  |
| `{{kebabCase}}`   | kebab-case 名称 |
| `{{year}}`        | 当前年份        |

### 可用 Helpers

| Helper           | 说明     |
| ---------------- | -------- |
| `{{#if_eq a b}}` | 条件判断 |
| `{{date}}`       | 当前日期 |
| `{{year}}`       | 当前年份 |
| `{{upper str}}`  | 转大写   |
| `{{lower str}}`  | 转小写   |

> 注意：当前版本模板内联在 `src/commands/create.ts` 中。
> 后续版本将逐步迁移到此目录作为 `.hbs` 文件。
