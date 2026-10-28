/** 安装前置的错误输出只产生固定诊断，不回显代理、URL 和私有字面量。 */
import { expect, it } from 'vitest'
import { classifyDeployFixturePreparation } from './helpers/deploy-container-fixture.js'

it.each([
  ['407 Proxy Authentication Required https://operator:private-password@proxy.test/path', 'proxy'],
  ['Certificate verification failed: https://user:private-password@mirror.test', 'tls'],
  ['Temporary failure resolving private-password.example', 'dns'],
  ['404 Not Found https://mirror.test/private-password', 'repository'],
  ['Could not get lock /private-password/lock', 'package-lock'],
  ['Failed to fetch https://user:private-password@mirror.test', 'network'],
  ['Setting up openssh-server (private-password)', 'package-configure'],
  ['Fetched 9397 kB in 59s (158 kB/s)\nReading package lists...', 'package-index'],
  ['Get:4 https://mirror.test/private-password bookworm/main Packages', 'download'],
  ['unclassified private-password failure', 'unknown'],
].map(([output, expected]) => ({ output: output!, expected: expected! })))('安装输出只报告固定类别 $expected', ({ output, expected }) => {
  const diagnostic = classifyDeployFixturePreparation(output)
  expect(diagnostic).toBe(expected)
  expect(diagnostic).not.toMatch(/private-password|https?:|operator/)
})
