# @h-ai/capacitor 設定

[原文（中国語）](capacitor.md) · [データ構造](../data/capacitor.ja.md) · [API リファレンス](../function/capacitor.ja.md)

ネイティブプロジェクトで `appId`、`appName`、実際の Web 出力先 `webDir` を設定します。API クライアントに渡す URL は実機から到達できる必要があります。`CAPACITOR_SERVER_URL` は実機での開発時に任意で指定し、リリースでは同期済みの静的ファイルを使います。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `camera.takePhoto`: `source`, `quality`, `resultType` | `prompt`, `90`, `uri` | カメラ・写真・選択画面、0～100 の品質、URI・Base64・Data URL 出力を指定。 |
| `camera.takePhoto`: `width`, `height` | 省略可 | 最大の幅と高さ（ピクセル）。 |
| `statusBar.configure`: `style`, `backgroundColor`, `overlay` | 省略可 | 省略時は現在の設定を保持。16 進カラーと WebView に重ねるかを指定。 |
| `push.register`, `push.listen`: `signal` | 省略可 | 中断すると登録を取り消すかリスナーを解除。 |
| `push.listen`: `onReceived`, `onActionPerformed` | 省略可 | 受信時と通知を操作したときのコールバック。 |
