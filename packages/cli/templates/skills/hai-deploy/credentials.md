# 旧部署凭据导入

缺状态且已有卷时必须继续拒绝普通部署，不能删除卷或拿新随机密码替代。导入工具在目标 Linux 服务器运行，需要受支持的 Node 及同版本 CLI/deploy；常规离线部署仍无需 Node。

先停止业务写入、排除旧部署进程，备份 DB、对象、数据卷、凭据、current 和成功发布目录。原服务保持运行用于只读认证；S3 还需要同项目且共享网络的 `hai-<projectName>-app` Node 容器。

准备非软链接、0600 的私有 JSON：version=1，projectName 为含环境后缀但不含 hai- 前缀的部署名；credentials 只列 DB_PASSWORD / STORAGE_PASSWORD / LDAP_PASSWORD 中实际需要的组；services 列 service、kind、container、volumes。db/vecdb 对应同一 DB_PASSWORD，kind 支持 postgresql/mysql；storage 对应 s3；ldap 对应 ldap。用户名/数据库默认 hai；S3 accessKeyId/bucket/region 默认 hai-storage/hai/us-east-1；LDAP bindDn 默认 cn=admin,dc=example,dc=org。这些是受管 sidecar 固定身份，自定义账户/库/桶/region/DN 不导入，应继续作为外部中间件配置保留。MySQL app/root 必须使用同一凭据，且分别通过正确密码成功、错误密码认证拒绝的正反验证。PostgreSQL 预检需要支持 require_auth 的 libpq 16+ 客户端，连接非 loopback 容器地址并要求实际密码认证，不能用 trust 成功代替密码有效。所有值和实际旧服务核对，不从不可信旧包猜测密码。

```sh
hai deploy-secrets /opt/hai/apps/shop-test --import /private/shop-import.json --runtime docker
# 预检核验项目标签、服务标签、实际卷和真实凭据，不写状态或锁。
hai deploy-secrets /opt/hai/apps/shop-test --import /private/shop-import.json --runtime docker --apply
```

SDK `importDeploymentSecrets({ directory, inputFile, runtime })` 默认 dryRun:true；只有显式 false 提交。提交在固定部署 flock 内由持锁进程原子写入 v2 状态，权限0600。密码保留特殊字符和 Unicode，但拒绝空值/控制字符；十六进制只是编码，状态和备份仍须作为秘密保护。工具不停止服务、不轮换密码、不推进 current，不接受不同项目/卷或损坏状态。

失败时检查 error.ext.phase/state；unknown 先核对服务器状态，不能据此自动重复部署。相同输入可重复核验。中断 next 文件不作为已提交状态；确认无相关进程后只清理本次文件。状态丢失优先恢复受保护备份，或用可信旧凭据重新验证导入。保留原项目/卷身份重新生成完整包，核对旧 DB/S3 数据后再恢复写入；轮换另行计划。
