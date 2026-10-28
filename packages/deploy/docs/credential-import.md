# 旧部署凭据导入与恢复

已有卷却缺少 `managed-secrets.env` 时，普通部署继续停止。不要删除卷、重新生成密码、截断旧密码或手工复制新包的随机候选。

## 前置条件

在目标 Linux 服务器以部署目录所有者或管理员运行已安装且版本一致的 CLI/deploy，使用框架支持的 Node。普通离线部署仍不需要服务器 Node。确认没有旧部署进程，停止业务写入，备份数据库、对象、卷、原凭据和 current/成功发布目录，记录恢复点。导入不停止服务、不轮换密码、不运行数据库迁移，也不会推进 current。

原中间件必须仍在运行。工具核验 Compose 项目/服务标签和实际挂载卷，并用原凭据执行只读检查：PostgreSQL/MySQL `SELECT 1`、LDAP bind、S3 bucket HEAD。S3 验证使用同项目且共享网络的 `hai-<projectName>-app` Node 容器，不安装额外服务、不写客户端配置；此时应用可处于停写维护状态。缺验证工具、错误密码、错误项目/卷均拒绝，不降级成“信任旧包”。

PostgreSQL 使用非回环连接并显式要求 libpq 的 require_auth=scram-sha-256,md5,password，拒绝 trust 或未完成认证；因此需要 psql/libpq 16+，不支持时停止。MySQL 对应用和 root 同时执行正向认证和随机错误密码的反向认证；正确密码须成功，错误密码须收到认证拒绝，因此跳过授权校验也不能通过。参考 [libpq 认证要求](https://www.postgresql.org/docs/16/libpq-connect.html#LIBPQ-CONNECT-REQUIRE-AUTH)。

## 私有输入

从操作者确认的秘密来源建立权限 0600、非软链接的 JSON 文件，不提交 Git。下例密码文字仅为占位，须替换为原服务的真实密码；容器、用户名、数据库、bucket 和卷名必须与旧部署实际值一致。`projectName` 包含环境后缀，但不包含自动添加的 `hai-` 前缀。

```json
{
  "version": 1,
  "projectName": "shop-test",
  "credentials": {
    "DB_PASSWORD": "从受保护来源取得的原数据库密码",
    "STORAGE_PASSWORD": "从受保护来源取得的原对象存储密码"
  },
  "services": [
    {
      "service": "db",
      "kind": "postgresql",
      "container": "hai-shop-test-db",
      "volumes": ["hai-shop-test_shop-test-db-data"],
      "username": "hai",
      "database": "hai"
    },
    {
      "service": "storage",
      "kind": "s3",
      "container": "hai-shop-test-storage",
      "volumes": ["hai-shop-test_shop-test-storage-data"],
      "accessKeyId": "hai-storage",
      "bucket": "hai",
      "region": "us-east-1"
    }
  ]
}
```

只列实际托管的服务与凭据组：db/vecdb 使用 DB_PASSWORD（两者存在时密码必须一致），storage 使用 STORAGE_PASSWORD，ldap 使用 LDAP_PASSWORD。kind 支持 postgresql/mysql/s3/ldap；LDAP 可填写 bindDn，默认 `cn=admin,dc=example,dc=org`。所有指定卷均须挂载到已验证服务。密码支持空格、引号、反斜杠、美元符号及 Unicode，不允许空值、换行、NUL 或其他控制字符；不会转换、截断或替换密码。

当前受管 sidecar 固定 PostgreSQL/MySQL 的 hai 账户与 hai 数据库、S3 的 hai-storage/桶 hai/us-east-1、LDAP 的默认 bindDn。MySQL 还会核验 root 与应用密码一致。自定义身份不能仅凭密码导入：工具明确拒绝，应保留外部中间件模式的原连接，或先制定独立的身份迁移方案。

## 预检与提交

```sh
chmod 600 /private/shop-import.json
hai deploy-secrets /opt/hai/apps/shop-test --import /private/shop-import.json --runtime docker
# 核对只含项目、凭据组和卷名的回执；此步骤不创建锁或状态文件。
hai deploy-secrets /opt/hai/apps/shop-test --import /private/shop-import.json --runtime docker --apply
```

SDK 对应 `importDeploymentSecrets({ directory, inputFile, runtime, dryRun: true })`；只有 dryRun:false 提交。apply 复用固定 `.deploy.lock`，不删除/替换锁文件。持锁进程创建私有临时文件、fsync 后原子发布 v2 状态并同步目录；锁或验证失败不启动服务。相同输入可重复导入，既有不同/损坏状态不被覆盖。返回失败且 error.ext.state 为 unknown 时，先核对状态文件；不要将未收到提交回执解释为未写入。

v2 的密码使用 UTF-8 十六进制编码，**编码不提供加密**，状态与备份仍是秘密，必须保持 0600。状态绑定项目及已验证卷，后续部署正确派生 dotenv、JSON 与 URL 编码，不把特殊字符当脚本执行。普通新项目仍可沿用已有随机凭据状态；无需强制迁移。

## 后续交付与恢复

保持原项目名、卷名与部署目录，使用当前 CLI 生成新部署 ID 的完整包。导入不创建成功基线；没有 `current` 时，首次接管必须完整全量，不能带 `--services` 或使用部分构建。只有完整部署成功后，才可按成功基线增量更新。先核对原 DB 记录、S3 对象及摘要，再恢复写入；导入与容器接管不执行数据库数据恢复或格式迁移。

对 `db`、`storage`、`vecdb` 的未认领旧卷，后续部署同时核对合法 v2 中的项目、凭据组和精确卷绑定，以及同项目/服务的唯一运行原容器：Docker/Podman 标签不得冲突，实际命名卷与 Config.Image 家族必须匹配候选。db 与 vecdb 虽共用 DB_PASSWORD，仍分别核验服务角色。FORMAT1、停止的原容器、缺失或不一致的标签/挂载/镜像均不能替代证据。已知 `persistent-backends` 绑定冲突或 daemon/store 身份变化不会因导入放行；先恢复原运行环境，或另行制定数据迁移方案，不编辑/删除账本强行接管。

状态丢失时，优先恢复与该项目/卷对应的受保护备份；没有备份但拥有可信原凭据时，原服务运行期间重新预检并导入。损坏或软链接状态必须先隔离并核对来源，不能让工具盲目覆盖。中断留下的 `.managed-secrets-*.next` 不是已提交状态，普通部署不会采用它；只在确认没有部署/导入进程后核对并清理本次文件。导入失败不修改 current、不删除数据卷。回退部署沿用成功发布与相同服务器凭据，数据恢复遵循备份方案；凭据轮换属于独立的受控操作。
