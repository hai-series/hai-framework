# Markdown reading example

Use this sample to inspect **bold**, _italic_, ~~strikethrough~~, `inline code`, and [links](https://github.github.com/gfm/).

## Lists and tasks

- Process orders
  - Check stock
    - Record shortages
- Notify customers

1. Install dependencies
2. Configure the project
3. Start the application

- [x] Page layout
- [ ] Workflow acceptance

> Example note: lists, quotes, and tables should have a clear reading order.
>
> > Nested quotes also need sufficient spacing.

## Code highlighting

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

## Table

| Item            | Status    | Next step               |
| --------------- | --------- | ----------------------- |
| Page layout     | Complete  | Check narrow screens    |
| Action feedback | To verify | Check keyboard controls |

---

## Image

The application icon demonstrates image rendering without an external image service.

![Application icon](/favicon.png)
