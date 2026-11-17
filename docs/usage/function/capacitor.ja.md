# @h-ai/capacitor API リファレンス

[原文（中国語）](capacitor.md) · [設定](../configuration/capacitor.ja.md) · [データ構造](../data/capacitor.ja.md)

<a id="quick-start"></a>

`capacitor.init()` の後にネイティブ機能を使います。実機が必要な処理の前に環境を確認します。アカウント変更や画面離脱時にはプッシュのリスナーを解除します。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `capacitor.init()`, `close()`, `getPlatform()`, `isNative()`, `isInitialized()` | 引数なしで初期化・終了し、環境と初期化状態を確認。 | `capacitor.getPlatform()` |
| `capacitor.device.getInfo()`, `getAppVersion()` | 端末情報またはインストール済みバージョンを返す。 | `await capacitor.device.getInfo()` |
| `capacitor.camera.takePhoto(options?)` | 既定では撮影元を選択し、URI で画像を返す。既定の品質は 90。 | `await capacitor.camera.takePhoto({ source: 'camera' })` |
| `capacitor.push.register(options?)`, `listen(handlers, options?)` | 権限とトークンの取得、または通知の受信・操作イベントの購読。解除には中断シグナルを渡せる。 | `await capacitor.push.listen({ onReceived }, { signal })` |
| `capacitor.statusBar.configure(options)`, `show()`, `hide()` | 色・スタイル・重なりを設定、または表示を切り替える。 | `await capacitor.statusBar.show()` |
| `capacitor.preferences.get(key)`, `set(key, value)`, `remove(key)` | 端末上の一般の文字列を管理。 | `await capacitor.preferences.set('theme', 'dark')` |
| `createCapacitorTokenStorage()` | アクセス・更新トークンを取得・保存・削除するネイティブ用アダプター。`@h-ai/capacitor` からインポート。 | `const tokens = createCapacitorTokenStorage()` |
| `safeGetPreference`, `safeSetPreference`, `safeRemovePreference` | 一般設定を扱う独立関数。キーを渡し、書き込み時は値も指定。 | `await safeGetPreference('theme')` |
