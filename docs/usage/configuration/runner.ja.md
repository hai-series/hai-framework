# @h-ai/runner 設定

[简体中文](runner.md) · [English](runner.en.md)

[設定マニュアル](README.ja.md) · [API リファレンス](../function/runner.ja.md) · [データ構造](../data/runner.ja.md)

<a id="configuration-entry"></a>

## 設定の読み込み

Runner は、Node.js アプリケーションから `runner.init(config)` に渡されたオブジェクトを読み込みます。先に RelDB を初期化し、Runner の初期化結果を確認します。`await runner.init({ nodeId: 'report-local' })` のように、コードから設定を直接渡すこともできます。ローカルでレポートを作る場合は、`environments` を省略して同じプロセスでジョブを投入、実行できます。

ファイルで設定を管理する場合は、下の YAML 設定例をアプリケーションディレクトリの `config/_runner.yml` に保存します。アプリケーションがファイルと環境変数を読み込み、設定オブジェクトを Runner に渡します。次のコードは SQLite を使用する起動処理です。アプリケーションディレクトリから実行します。依存パッケージは `pnpm add @h-ai/core @h-ai/reldb @h-ai/runner` でインストールします。アプリケーション側でハンドラーを登録し、終了時は Runner を閉じてから RelDB を閉じます。 [クイックスタートと終了処理](../function/runner.ja.md#quick-start)

```ts
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner, RunnerConfigSchema } from '@h-ai/runner'

// アプリの作業ディレクトリから設定を読み込みます。失敗したらパスや項目を修正します。
const config = core.config.load('runner', './config/_runner.yml', RunnerConfigSchema)
if (!config.success)
  throw new Error(config.error.message)

// アプリのディレクトリ内の SQLite ファイルを開きます。接続に失敗したら起動を中止します。
const database = await reldb.init({ type: 'sqlite', database: './runner.sqlite' })
if (!database.success)
  throw new Error(database.error.message)

// 検証済みの設定を渡します。起動できなければ、ここで開いた接続を閉じます。
const started = await runner.init(config.data)
if (!started.success) {
  const closed = await reldb.close()
  if (!closed.success)
    process.stderr.write(closed.error.message + '\n')
  throw new Error(started.error.message)
}
```

設定ディレクトリ全体を読み込むアプリケーションでは、`core.init({ configDir: './config', configSchemas: { runner: RunnerConfigSchema } })` でスキーマを登録できます。`core.config.get('runner')` の戻り値を検証してから Runner に渡します。

Core の環境変数による上書きを使うと、`HAI_RUNNER` で設定オブジェクト全体を指定でき、`HAI_RUNNER_EXECUTOR` などの変数で個別の項目を設定できます。Core は上書きを適用してから YAML に残ったプレースホルダーを展開し、スキーマで検証します。dotenv ファイルを読み込む場合の優先順位は、高い順にプロセス環境、`.env.<mode>.local`、`.env.local`、`.env.<mode>`、`.env` です。ファイルや環境変数を変更したときは、対象サービスを再起動して Runner を初期化し直します。 [環境変数の読み込みと上書き（中国語）](runtime.md#配置从哪里来)

<a id="configuration-fields"></a>

## 設定一覧

### ノードの役割と起動・終了

| パス | 型と指定可能な値 | 既定値または必須条件 | 用途 |
| --- | --- | --- | --- |
| `nodeId` | ASCII 英数字、アンダースコア、ピリオド、ハイフンで 1～100 文字 | 必須 | ノードの識別子。同時稼働するノードには異なる ID を割り当てます。未確定のジョブを照合できるよう、同じ実行ノードでは再起動後も ID を維持します |
| `executor` | 真偽値 | `true` | `true` で登録済みジョブを取得して実行します。`false` ではジョブの投入、状態照会、キャンセル要求が可能です |
| `leaseMs` | 1000～120000 ミリ秒の整数 | `10000` | 実行ノードはリースを定期的に更新します。リースを失ったジョブは照合待ちの `unknown` に移ることがあります |
| `pollMs` | 10～1000 ミリ秒の整数。`pollMs × 3 < leaseMs` を満たすこと | `50` | 実行ノードがバックグラウンドでジョブを確認する間隔 |
| `closeTimeoutMs` | 100～120000 ミリ秒の整数 | `20000` | 終了処理の開始からの期限。データベース待機とリソースの後処理を含みます |

<a id="設定例"></a>
<a id="runner-sqlite"></a>

#### 1 プロセスでローカルレポートを実行する

次の内容をアプリケーションの `config/_runner.yml` に保存し、上の SQLite 用起動コードを使います。同じプロセスで `report.v1` を登録、投入し、受付情報の ID で照会します。`input: { month: '2026-11' }` を指定した場合は、状態が `succeeded` となり、結果に対象月 `2026-11` と `rows: 120` が含まれます。 [ローカルレポートの実行手順](../function/runner.ja.md#quick-start)

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-local
executor: true
```

<a id="runner-deployment"></a>

#### 共有データベースで投入と実行を分ける

両方のプロセスで RelDB を初期化し、同じ PostgreSQL または MySQL データベースに接続します。二つの YAML を各プロセスの `config/_runner.yml` として保存します。既存ファイルの場合はそれぞれの `nodeId` と `executor` を変更します。ノードごとに異なる ID を割り当て、再起動後も同じ値を使います。 [データベースの設定](reldb.ja.md)

API ノードはジョブの投入と結果照会を担当します。起動後の `runner.isExecutor` は `false` です。

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-api
executor: false
```

実行ノードでは `runner.isExecutor` が `true` になります。ここで `report.v1` を登録し、API ノードからレポートを投入します。照会結果の状態が `succeeded`、`owner.nodeId` が `report-worker` であることを確認します。 [2 ノードで実行できる例](../function/runner.ja.md#two-node-example)

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-worker
executor: true
```

### イベント数と記録の保持期間

| パス | 型と指定可能な値 | 既定値または必須条件 | 用途 |
| --- | --- | --- | --- |
| `maxEvents` | 1～100000 の整数 | `10000` | 1 回の実行で書き込めるイベント数。書き込みごとのバイト数と累積バイト数にも上限があります |
| `retentionMs` | 3600000～31536000000 ミリ秒の整数 | `604800000`（7 日） | 実行ノードが確定済みジョブ、イベント、追加の冪等キーを削除するまでの保持期間。未照合の `unknown` は保持します |

#### テストレポートのイベント数と保持期間を制限する

実行ノードの `config/_runner.yml` に `maxEvents` と `retentionMs` を設定し、再起動します。次の設定例は一時的な検証インスタンスに使用できます。

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-local
executor: true
maxEvents: 2
retentionMs: 3600000
```

テストハンドラーで `context.emit()` を 3 回呼び出し、少量のデータを書き込んで各結果を確認します。最初の 2 回は成功し、3 回目は上限に達して失敗します。ハンドラーが正常終了すれば、受付 ID で先の 2 件を読み取れます。子ジョブのない確定済みジョブは、1 時間の保持期間が過ぎて次の削除処理が完了すると、元のキーで `runner.find()` を呼んでも成功結果の `data` は `undefined` になります。未照合の `unknown` は保持されます。 [サイズ制限と保持期間](../data/runner.ja.md#size-and-retention)

### スケジューリングと通常ジョブのリソース

| パス | 型と指定可能な値 | 既定値または必須条件 | 用途 |
| --- | --- | --- | --- |
| `maxQueued` | 1～100000 の整数 | `5000` | 投入時に共有データベースで確認する待機件数の上限。親を持たないジョブで一つの枠を共有し、制御用の子ジョブにも同じ大きさの別枠があります |
| `maxRunning` | 1～1000 の整数 | `8` | 通常ジョブのノードごとの同時実行上限 |
| `maxControlRunning` | 1～1000 の整数 | `8` | 制御用の子ジョブのノードごとの同時実行上限 |
| `maxRunningPerScope` | 1～1000 の整数 | `4` | 同一スコープで共有データベース全体に適用する活動中のジョブ数の上限。通常、ツール、制御用の子ジョブを別々に集計します |
| `capacity` | リソースオブジェクト | 省略すると下記 4 項目の既定値を使用。指定する場合は 4 項目すべて必須 | ノード上の通常ジョブの総枠 |
| `capacity.cpu` | 0 より大きく 1024 以下の CPU コア数。小数可 | `4` | 通常ジョブの CPU 枠 |
| `capacity.memoryMiB` | 16～2097152 MiB の整数 | `4096` | 通常ジョブのメモリ枠 |
| `capacity.pids` | 1～1048576 の整数 | `512` | 通常ジョブのプロセス数の枠 |
| `capacity.scratchMiB` | 3～2097152 MiB の整数 | `2048` | 通常ジョブの一時領域の枠 |

#### 共有データベース全体で待機ジョブ数を制限する

投入ノードで次の `maxQueued` を使います。複数のプロセスから投入する場合は、それぞれに同じ値を設定します。空のテスト用データベースで、親ジョブと登録済みハンドラーがないジョブを 3 件投入します。最初の 2 件は `queued`、3 件目は `CAPACITY` になります。検証後、最初の 2 件を受付 ID でキャンセルします。

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-api
executor: false
maxQueued: 2
```

<a id="実行ノードのリソースと待機数を制限する"></a>

#### 実行ノードのリソースと同時実行数を制限する

実行ノードの設定に `capacity`、`maxRunning`、`maxRunningPerScope` を追加し、ノードの役割と ID を維持します。この例は、他のジョブが動いていない単一実行ノードを前提とします。

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-worker
executor: true
capacity:
  cpu: 2
  memoryMiB: 2048
  pids: 256
  scratchMiB: 1024
maxRunning: 4
maxRunningPerScope: 2
```

一時的に処理を続けるテストハンドラーで、異なるスコープから `resources: { cpu: 1 }` の通常ジョブを 2 件起動します。両方が実行中になってから、別のスコープで同じリソースを要求する 3 件目を投入します。CPU 1 コアに空きが出るまで待機します。次に同じスコープから `resources: { cpu: 0.5 }` のジョブを 3 件投入して試します。この場合、3 件目は `maxRunningPerScope: 2` により待機します。 [投入項目とジョブの状態](../function/runner.ja.md#tasks)

### コンテナーエンジンと実行環境

| パス | 型と指定可能な値 | 既定値または必須条件 | 用途 |
| --- | --- | --- | --- |
| `engine` | `"podman"` または `"docker"` | `"podman"` | 実行ノードがコンテナージョブを起動するためのローカルエンジン |
| `environments` | オブジェクトの配列、最大 1000 項目 | `[]` | ジョブが利用できるコンテナー環境。各環境に一意の `id` を割り当てます |
| `environments[].id` | ASCII 英数字、アンダースコア、ピリオド、ハイフンで 1～100 文字 | 各項目で必須 | ジョブの投入時に `environmentId` に指定する値 |
| `environments[].image` | 固定されたイメージ参照、最大 255 文字 | 各項目で必須 | ローカルイメージ ID `sha256:<64 桁の 16 進数>`、または準備済みの `イメージ名@sha256:<64 桁の 16 進数>`。ダイジェスト内の英字は小文字 |
| `environments[].backend` | `"container"` のみ | `"container"` | コンテナーでの実行を指定 |
| `environments[].architecture` | `"x64"` または `"arm64"` | 省略可 | 指定したアーキテクチャの実行ノードに限定 |
| `environments[].capabilities` | 文字列の配列、最大 64 項目。要素は `id` と同じ形式 | `[]` | 呼び出し側が環境を選択したり機能を確認したりするためのラベル |
| `environments[].resources` | リソースオブジェクト | 各項目で必須 | 1 回のコンテナー実行に適用する 4 種類のリソース上限 |
| `environments[].resources.cpu` | 0 より大きく 1024 以下の CPU コア数。小数可 | 必須 | コンテナーの CPU 上限 |
| `environments[].resources.memoryMiB` | 16～2097152 MiB の整数 | 必須 | コンテナーのメモリ上限 |
| `environments[].resources.pids` | 2～1048576 の整数 | 必須 | コンテナーのプロセス数の上限 |
| `environments[].resources.scratchMiB` | 3～2097152 MiB の整数 | 必須 | コンテナーの一時領域の上限 |
| `environments[].networkPolicy` | `"offline"` または `"internal"` | `"offline"` | `offline` はネットワーク接続を無効化し、`internal` は名前で指定した内部ネットワークに接続します |
| `environments[].network` | ASCII 英数字、アンダースコア、ピリオド、ハイフンで 1～100 文字 | `internal` の場合に必須。`offline` の場合は省略 | エンジンで事前に作成し、内部ネットワークであることが確認できる名前。`host`、`bridge`、`none`、`default`、`podman` は予約済み |

ジョブの投入時に環境のリソース上限を引き下げることができます。コンテナーの `pids` は 2 以上が必要です。`inputs` を指定しない通常起動は `scratchMiB: 3` で動かせます。`inputs` を指定する場合は空のオブジェクトでも最低 4 MiB が必要で、ウォームプールも同じ条件です。一時領域の枠は、作業領域、状態保存用ディレクトリ、一時ディレクトリに分けて使用します。入力がある場合は出力ディレクトリにも割り当てます。

<a id="runner-container"></a>
<a id="container-example"></a>

#### オフラインのコンテナー環境を追加する

コンテナージョブには、Linux cgroup v2、CPU・メモリ・プロセス数の制限に対応したローカルエンジン、固定されたイメージが必要です。Runner は UID/GID 1000 で実行します。イメージには `/bin/sh` が必要で、追加のイメージボリュームは宣言しません。使うエンジンでイメージを準備し、ローカル ID を確認します。Docker を使う場合は、次の両コマンドと YAML の `engine` にある `podman` を `docker` に変更します。

```sh
podman pull docker.io/library/alpine:3.22
podman image inspect --format '{{.Id}}' docker.io/library/alpine:3.22
```

イメージの仮の値を前の手順で得た ID に置き換えます。`sha256:` は一度だけ付けます。既存の実行ノードを使う場合は、`engine` と `environments` を設定に追加します。API ノードが別の場合は、同じイメージ ID とリソース設定の `alpine-offline` を API ノードの `environments` にも追加します。

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-worker
executor: true
engine: podman
environments:
  - id: alpine-offline
    image: sha256:0000000000000000000000000000000000000000000000000000000000000000
    resources:
      cpu: 0.5
      memoryMiB: 128
      pids: 32
      scratchMiB: 64
    networkPolicy: offline
```

実行ノードで `report.banner.v1` を登録し、投入側で `environmentId: 'alpine-offline'` を指定してジョブを投入します。受付 ID で照会し、状態が `succeeded`、出力が `{"text":"report-ready"}` であることを確認します。内部ネットワークを使う場合は、先にエンジンでネットワークを作成し、両ノードの該当環境で `networkPolicy: internal` と同じ `network` 名を指定します。 [固定コマンドと出力の例](../function/runner.ja.md#container-command-example)

応用例では同じ構成で次の 2 環境を追加し、各イメージの固定 ID を指定します。

- `python-offline` は成果物の取り出しとウォームプールに使います。イメージには `/usr/bin/python3`、`/bin/sh`、`cat` が必要です。上の Alpine ベースイメージを使う場合は、ビルド時に `RUN apk add --no-cache python3` を実行できます。
- `node-offline` は作業領域のスナップショットに使います。`docker.io/library/node:24.22.1-bookworm-slim` など、`/bin/sh` と Node.js があるイメージを用意します。 [コンテナー API の例](../function/runner.ja.md#containers)

### ツールジョブのリソース

| パス | 型と指定可能な値 | 既定値または必須条件 | 用途 |
| --- | --- | --- | --- |
| `toolMaxRunning` | 1～1000 の整数 | `4` | ツールジョブのノードごとの上限。事前起動で予約済みのもの、後処理中のもの、照合待ちのものを含みます |
| `toolCapacity` | リソースオブジェクト | 省略すると下記 4 項目の既定値を使用。指定する場合は 4 項目すべて必須 | ツールジョブ専用の総枠 |
| `toolCapacity.cpu` | 0 より大きく 1024 以下の CPU コア数。小数可 | `1` | ツールジョブの CPU 枠 |
| `toolCapacity.memoryMiB` | 16～2097152 MiB の整数 | `1024` | ツールジョブのメモリ枠 |
| `toolCapacity.pids` | 1～1048576 の整数 | `128` | ツールジョブのプロセス数の枠 |
| `toolCapacity.scratchMiB` | 3～2097152 MiB の整数 | `512` | ツールジョブの一時領域の枠 |

<a id="tool-capacity-example"></a>

#### ツール用タスクのリソースを別に確保する

前の例のコンテナー環境を使い、実行ノードの設定に `toolCapacity` と `toolMaxRunning` を追加します。下の設定例にも同じオフライン環境が含まれます。単独で使う場合はイメージの仮の値を置き換えます。ホストには、通常ジョブとツールジョブの両方の総枠を賄えるリソースを用意します。

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-worker
executor: true
engine: podman
toolCapacity:
  cpu: 1
  memoryMiB: 1024
  pids: 128
  scratchMiB: 512
toolMaxRunning: 2
environments:
  - id: alpine-offline
    image: sha256:0000000000000000000000000000000000000000000000000000000000000000
    resources:
      cpu: 0.5
      memoryMiB: 128
      pids: 32
      scratchMiB: 64
    networkPolicy: offline
```

この枠を使うには、投入時に `capacityClass: 'tool'` を指定します。処理を継続できるテストハンドラーを使い、異なるスコープから `alpine-offline` のツールジョブを 1 件ずつ、計 2 件実行したままにします。各コンテナーは最大 0.5 CPU コアを使います。3 件目は空き枠とリソースができるまで待機し、通常ジョブは自身の枠で実行できます。ウォームプールを使う場合は、オフラインのツール環境とプールも登録します。 [ジョブの種類](../function/runner.ja.md#task-kinds) · [ウォームプールとジョブの投入](../function/runner.ja.md#warm-pool)

### 反映と確認

通常の起動手順でサービスを再起動します。`runner.init()` の成功と、`runner.isExecutor` が各プロセスの役割に合っていることを確認してから、登録済みのテストジョブを投入します。待機状態が続く場合は、共有データベースへの接続、ハンドラーの登録、指定したノード・コンテナー環境・リソース枠がジョブに合っているかを確認します。終了時は `runner.close()` を待ち、後処理を確認できない場合は照合に備えてデータベース接続を維持します。 [ジョブ状態と照合](../function/runner.ja.md#reconciliation)
