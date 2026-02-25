#!/usr/bin/env node

/**
 * 版本同步脚本
 *
 * 读取根 package.json 的 version，同步到所有 packages/* 和 apps/* 的 package.json。
 * 用于 CI 发布流程中，确保所有模块版本号一致。
 *
 * 用法：node scripts/sync-versions.mjs
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * 读取并解析 JSON 文件
 */
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

/**
 * 写入 JSON 文件（保留 2 空格缩进 + 尾换行）
 */
function writeJson(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

/**
 * 获取目录下所有子目录名
 */
function getSubDirs(dir) {
  try {
    return readdirSync(dir).filter((name) => {
      const fullPath = join(dir, name)
      return statSync(fullPath).isDirectory()
    })
  }
  catch {
    return []
  }
}

/**
 * 同步版本号到单个 package.json
 *
 * @param {string} pkgPath - package.json 的完整路径
 * @param {string} version - 目标版本号
 * @returns {boolean} 是否有变更
 */
function syncVersion(pkgPath, version) {
  const pkg = readJson(pkgPath)
  if (pkg.version === version) {
    return false
  }
  pkg.version = version
  writeJson(pkgPath, pkg)
  return true
}

function main() {
  const rootPkg = readJson(join(ROOT, 'package.json'))
  const version = rootPkg.version

  console.log(`Syncing version: ${version}`)

  const dirs = ['packages', 'apps']
  const updated = []
  const skipped = []

  for (const dir of dirs) {
    const base = join(ROOT, dir)
    const subs = getSubDirs(base)

    for (const sub of subs) {
      const pkgPath = join(base, sub, 'package.json')
      try {
        if (syncVersion(pkgPath, version)) {
          updated.push(`${dir}/${sub}`)
        }
        else {
          skipped.push(`${dir}/${sub}`)
        }
      }
      catch {
        console.warn(`Warning: Could not process ${dir}/${sub}/package.json`)
      }
    }
  }

  if (updated.length > 0) {
    console.log(`\nUpdated (${updated.length}):`)
    for (const name of updated) {
      console.log(`  ✓ ${name}`)
    }
  }

  if (skipped.length > 0) {
    console.log(`\nAlready up to date (${skipped.length}):`)
    for (const name of skipped) {
      console.log(`  - ${name}`)
    }
  }

  console.log(`\nDone. Version ${version} synced to ${updated.length} packages.`)
}

main()
