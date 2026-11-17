# @h-ai/deploy Data structures

<!-- translation: partial -->

[Chinese source](deploy.md) · [Configuration](../configuration/deploy.en.md) · [API reference](../function/deploy.en.md)

Deployment state is stored as files and remote release records. The database, cache and object store used by an application retain their own data.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| Build manifest / ビルドマニフェスト | Release metadata, service artifacts and digests. Inspect before choosing a partial deployment. |
| Remote deployment / リモート配置 | Target-specific release contents and current/recovery status. Retain the release files and verified baseline needed for rollback. |
| Credentials / 認証情報 | Provider credentials in a private location, loaded by environment. |

Additional options and workflow examples are available in the [Chinese reference](deploy.md).
