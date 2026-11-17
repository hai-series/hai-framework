# @h-ai/capacitor 設定

[原文（中国語）](capacitor.md) · [データ構造](../data/capacitor.ja.md) · [API リファレンス](../function/capacitor.ja.md)

ネイティブプロジェクトで `appId`、`appName`、実際の Web 出力先 `webDir` を設定します。API クライアントに渡す URL は実機から到達できる必要があります。`CAPACITOR_SERVER_URL` は実機での開発時に任意で指定し、リリースでは同期済みの静的ファイルを使います。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `appId` | プロジェクトで指定 | `capacitor.config.ts` のアプリ識別子。 |
| `appName` | プロジェクトで指定 | ネイティブアプリの表示名。 |
| `webDir` | ビルド出力と一致 | ネイティブパッケージにコピーするディレクトリ。 |
| `CAPACITOR_SERVER_URL` | 省略可 | 生成テンプレートが端末開発用に読み取る環境値。リリースでは同期した資産を使用。 |
