# Markdown の閲覧例

このサンプルでは **太字**、_斜体_、~~取り消し線~~、`インラインコード`、[リンク](https://github.github.com/gfm/) の表示を確認できます。

## リストとタスク

- 注文処理
  - 在庫確認
    - 在庫不足を記録
- 顧客に通知

1. 依存関係をインストール
2. プロジェクトを設定
3. アプリを起動

- [x] ページのレイアウト
- [ ] 業務フローの検証

> サンプルの注記：リスト・引用・表は読みやすい順序で配置します。
>
> > 入れ子の引用にも十分な余白が必要です。

## コードの強調表示

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

## 表

| 項目             | 状態   | 次の作業             |
| ---------------- | ------ | -------------------- |
| ページレイアウト | 完了   | 狭い画面を確認       |
| 操作結果の通知   | 未検証 | キーボード操作を確認 |

---

## 画像

外部サービスに依存せず、アプリのアイコンで画像の表示を確認します。

![アプリのアイコン](/favicon.png)
