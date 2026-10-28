# Markdown 阅读示例

这是一段用于检查排版的示例内容，可观察 **粗体**、_斜体_、~~删除线~~、`行内代码` 和 [链接](https://github.github.com/gfm/) 的效果。

## 列表与任务

- 订单处理
  - 校验库存
    - 记录缺货情况
- 通知客户

1. 安装依赖
2. 配置项目
3. 启动应用

- [x] 页面布局
- [ ] 业务验收

> 示例提示：列表、引用和表格应保持清晰的阅读层级。
>
> > 嵌套引用也应有足够的留白。

## 代码高亮

```typescript
const total = orders.reduce((sum, order) => sum + order.amount, 0)
```

```python
total = sum(order.amount for order in orders)
```

```bash
pnpm install --frozen-lockfile
pnpm dev
```

```json
{ "page": 1, "pageSize": 20 }
```

```sql
SELECT id, name FROM users ORDER BY id LIMIT 20;
```

## 表格

| 项目     | 状态   | 下一步       |
| -------- | ------ | ------------ |
| 页面布局 | 已完成 | 检查窄屏     |
| 操作反馈 | 待验证 | 检查键盘操作 |

---

## 图片

下方使用本应用图标展示图片渲染，不依赖外部图片服务。

![应用图标](/favicon.png)
