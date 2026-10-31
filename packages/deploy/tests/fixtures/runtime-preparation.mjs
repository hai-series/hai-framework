/** 进程/SSH 夹具将引擎准备步骤转交真实 Linux Node；容器隔离另由 CLI 部署门禁验收。 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const arguments_ = process.argv.slice(2)
const containerId = 'f'.repeat(64)
const fixtureDirectory = process.env.HAI_TEST_COMMANDS ? path.dirname(process.env.HAI_TEST_COMMANDS) : '/fixture'
const stateFile = path.join(fixtureDirectory, 'compiler.json')
if (arguments_[0] === 'create') {
  const mounts = {}
  for (let index = 0; index < arguments_.length; index++) {
    if (arguments_[index] !== '--mount')
      continue
    const value = arguments_[++index]
    const source = /source=([^,]+),/.exec(value)[1].replace(/^"|"$/g, '').replaceAll('""', '"')
    const target = /target=([^,]+)/.exec(value)[1]
    mounts[target] = source
  }
  fs.writeFileSync(stateFile, JSON.stringify({ mounts, mode: arguments_.at(-1), owner: arguments_[arguments_.indexOf('--label') + 1].split('=')[1] }))
  fs.writeFileSync(arguments_[arguments_.indexOf('--cidfile') + 1], containerId)
  process.stdout.write(containerId)
}
else if (arguments_[0] === 'inspect') {
  process.stdout.write(arguments_[2].includes('ExitCode') ? '0' : JSON.parse(fs.readFileSync(stateFile)).owner)
}
else if (arguments_[0] === 'start') {
  const { mounts, mode } = JSON.parse(fs.readFileSync(stateFile))
  const directory = fs.mkdtempSync(path.join(fixtureDirectory, 'runtime-input-'))
  try {
    fs.mkdirSync(path.join(directory, 'config'))
    fs.copyFileSync(mounts['/input/manifest.json'], path.join(directory, 'manifest.json'))
    fs.copyFileSync(mounts['/input/config/.env.runtime'], path.join(directory, 'config/.env.runtime'))
    const result = spawnSync(process.execPath, [mounts['/runtime-env.mjs'], 'prepare', `${directory}/`, mounts['/input/previous-manifest.json'] ?? '-', mounts['/input/previous.env'] ?? '-', mounts['/input/credentials.env'] ?? '-', mode], { encoding: 'utf8' })
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
    process.exitCode = result.status ?? 1
  }
  finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
else if (arguments_[0] === 'rm') {
  fs.rmSync(stateFile, { force: true })
}
