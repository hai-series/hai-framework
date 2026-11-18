// 离线维护入口。由已核验清单导入身份绑定，默认仅预检。
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { reldb, ReldbConfigSchema } from '@h-ai/reldb'
import { migrateLdapIdentities } from './iam-authn-ldap-repository.js'

function failed(code: string | number, message?: string, traceId?: string) {
  process.stderr.write(`${JSON.stringify({
    success: false,
    code,
    message,
    traceId,
  })}\n`)
  process.exitCode = 1
}

async function main() {
  try {
    const { values } = parseArgs({
      options: {
        database: { type: 'string' },
        manifest: { type: 'string' },
        apply: { type: 'boolean', default: false },
      },
    })
    if (!values.database || !values.manifest)
      return failed('invalid-arguments')
    const config = ReldbConfigSchema.safeParse(JSON.parse(await readFile(values.database, 'utf8')))
    if (!config.success)
      return failed('invalid-database-config')
    const manifest: unknown = JSON.parse(await readFile(values.manifest, 'utf8'))
    const connected = await reldb.init(config.data)
    if (!connected.success)
      return failed(connected.error.code, undefined, connected.error.traceId)

    try {
      const result = await migrateLdapIdentities(manifest, values.apply)
      if (!result.success) {
        const { code, message, traceId } = result.error
        return failed(code, typeof code === 'string' && code.startsWith('hai:iam:')
          ? message
          : undefined, traceId)
      }
      process.stdout.write(`${JSON.stringify(result)}\n`)
    }
    finally {
      const closed = await reldb.close()
      if (!closed.success)
        failed(closed.error.code, undefined, closed.error.traceId)
    }
  }
  catch {
    failed('ldap-bindings-import-failed')
  }
}

void main()
