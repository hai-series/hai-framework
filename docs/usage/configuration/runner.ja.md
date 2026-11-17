# @h-ai/runner 設定

<!-- translation: partial -->

[原文（中国語）](runner.md) · [データ構造](../data/runner.ja.md) · [API リファレンス](../function/runner.ja.md)

実際のファイルは `config/_runner.yml` で、AI Playground などが `RunnerConfigSchema` を登録して読み込みます。ここではファイル項目を扱い、実行時の依存やコールバックは [API](../function/runner.ja.md) に記載します。

共有 RelDB の初期化後に `_runner.yml` を読み込みます。各プロセスに固有のノード ID を指定し、ジョブの登録前にワーカーノードの実行環境を用意します。

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: api-east
executor: false
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `nodeId`, `executor`, `engine` | Required, `true`, `podman` | ノード識別子、ジョブ実行の有無、コンテナエンジン。 |
| `capacity` | `4` CPU, `4096` MiB, `512` PIDs, `2048` MiB scratch | 通常実行の共有リソース枠。 |
| `toolCapacity`, `toolMaxRunning` | `1` CPU, `1024` MiB, `128` PIDs, `512` MiB scratch, `4` jobs | ツール専用のリソース枠と最大同時実行数。 |
| `leaseMs`, `pollMs`, `closeTimeoutMs` | `10000`, `50`, `20000` | リースの期間、確認間隔、終了期限（ミリ秒）。 |
| `maxRunning`, `maxRunningPerScope`, `maxControlRunning`, `maxQueued` | `8`, `4`, `8`, `5000` | 実行数、スコープごとの上限、制御処理の並行数、待機件数。 |
| `maxEvents`, `retentionMs` | `10000`, `604800000` | イベント数の上限と保持期間（ミリ秒）。 |
| `environments` | `[]` | 各項目に ID・イメージ・リソースを宣言。方式の既定は `container`、機能の既定は空リスト。 |

未翻訳：コンテナ実行環境、ネットワーク、リソースの個別項目。[中国語の該当節](runner.md#configuration-fields)を参照してください。
