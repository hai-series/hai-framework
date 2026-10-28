/** Vitest 全局 teardown 在成功、失败及正常取消后执行；未构建镜像时不访问容器引擎。 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { cleanupTestImagesAsync } from './cleanup-test-images.mjs'

export default function setup(project) {
  const owner = randomUUID()
  const directory = mkdtempSync(join(tmpdir(), 'hai-test-images-'))
  const ledger = join(directory, 'builds.jsonl')
  const env = { HAI_TEST_IMAGE_RUN: owner, HAI_TEST_IMAGE_LEDGER: ledger }
  // 显式设置 worker 环境，CLI 子进程继承；不依赖全局 setup 与 worker 共享内存。
  project.config.env = { ...project.config.env, ...env }
  const restoreSignals = manageCancellation(project)
  let teardownPromise
  return () => {
    teardownPromise ??= (async () => {
      const reports = []
      try {
        if (!existsSync(ledger))
          return
        const builds = readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
        for (const runtime of new Set(builds.map(build => build.runtime))) {
          try {
            reports.push(await cleanupTestImagesAsync({ runtime, owner, imageRefs: builds.filter(build => build.runtime === runtime).map(build => build.imageRef), apply: true }))
          }
          catch (error) {
            reports.push({ runtime, failures: [{ error: error.message }] })
          }
        }
        const output = resolve(project.config.root, 'test-results')
        mkdirSync(output, { recursive: true })
        // 沿用测试证据目录，保留成功与失败的资源账本，便于定位强杀后遗留。
        const report = join(output, `image-cleanup-${owner}.json`)
        // 只有实际构建镜像的测试才会产生报告。
        writeFileSync(report, `${JSON.stringify({ owner, builds, reports }, null, 2)}\n`)
        process.stdout.write(`Test image cleanup report: ${report}\n`)
        if (reports.some(result => result.failures.length))
          throw new Error(`Test image cleanup failed; see ${report}`)
      }
      catch (error) {
        // Vitest 4 只打印 global teardown 错误；显式保留非零门禁状态。
        process.exitCode ||= 1
        throw error
      }
      finally {
        rmSync(directory, { recursive: true, force: true })
        restoreSignals()
      }
    })()
    return teardownPromise
  }
}

/** Vitest 4 的默认信号监听器会直接 exit；暂时接管，等待 worker/hook 退出后再关闭项目。 */
function manageCancellation(project) {
  if (!project.vitest)
    return () => {}
  let cancelling = false
  const handlers = ['SIGINT', 'SIGTERM'].map((signal) => {
    const previous = process.rawListeners(signal)
    for (const handler of previous)
      process.removeListener(signal, handler)
    const cancel = () => {
      if (cancelling)
        return
      cancelling = true
      process.exitCode ||= signal === 'SIGINT' ? 130 : 143
      process.stderr.write('Cancellation requested; waiting for tests and owned image cleanup.\n')
      void (async () => {
        try {
          await project.vitest.cancelCurrentRun('keyboard-input')
          await project.vitest.exit(true)
        }
        catch (error) {
          process.stderr.write(`Test cancellation failed: ${error.message}\n`)
          process.exitCode ||= 1
        }
      })()
    }
    process.on(signal, cancel)
    return { signal, previous, cancel }
  })
  return () => {
    for (const { signal, previous, cancel } of handlers) {
      process.removeListener(signal, cancel)
      for (const handler of previous) {
        if (handler.listener)
          process.once(signal, handler.listener)
        else
          process.on(signal, handler)
      }
    }
  }
}
