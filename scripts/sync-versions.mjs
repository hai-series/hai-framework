#!/usr/bin/env node

/**
 * 版本同步脚本
 *
 * 读取根 package.json 的 version，同步到：
 *   1. 所有 packages/* 和 apps/* 的 package.json
 *   2. packages/cli/templates/base/package.json.hbs 中的版本号和所有 @h-ai/* 依赖
 *
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
 * 读取文本文件
 */
function readText(filePath) {
  return readFileSync(filePath, 'utf-8')
}

/**
 * 写入文本文件
 */
function writeText(filePath, content) {
  writeFileSync(filePath, content, 'utf-8')
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

/**
 * 同步版本号到 package.json.hbs 模板文件
 * 更新主版本号和所有 @h-ai/* 依赖的版本号
 *
 * @param {string} hbsPath - package.json.hbs 的完整路径
 * @param {string} version - 目标版本号
 * @returns {boolean} 是否有变更
 */
function syncVersionInHbs(hbsPath, version) {
  let content = readText(hbsPath)
  const originalContent = content

  // 1. 更新主版本号: "version": "0.0.1" -> "version": "X.Y.Z"
  content = content.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${version}"`)

  // 2. 更新所有 @h-ai/* 依赖版本号: "@h-ai/xxx": "^..." -> "@h-ai/xxx": "^X.Y.Z"
  // 支持带条件的 Handlebars 语法，如 "@h-ai/core": "^0.1.0-alpha1"{{#if hasUi}},
  content = content.replace(/"@h-ai\/[^"]*"\s*:\s*"\^[^"]*"/g, (match) => {
    // 替换版本号部分，保留 @ 和包名
    return match.replace(/"\^[^"]*"/, `"^${version}"`)
  })

  if (content === originalContent) {
    return false
  }

  writeText(hbsPath, content)
  return true
}

function main() {
  const rootPkg = readJson(join(ROOT, 'package.json'))
  const version = rootPkg.version

  console.log(`Syncing version: ${version}`)

  const dirs = ['packages', 'apps']
  const updated = []
  const skipped = []

  // 同步 packages/* 和 apps/* 中的 package.json
  for (const dir of dirs) {
    const base = join(ROOT, dir)
    const subs = getSubDirs(base)

    for (const sub of subs) {
      const pkgPath = join(base, sub, 'package.json')
      try {
        if (syncVersion(pkgPath, version)) {
          updated.push(`${dir}/${sub}/package.json`)
        }
        else {
          skipped.push(`${dir}/${sub}/package.json`)
        }
      }
      catch {
        console.warn(`Warning: Could not process ${dir}/${sub}/package.json`)
      }
    }
  }

  // 同步 package.json.hbs 模板文件中的版本号和依赖版本
  const hbsPath = join(ROOT, 'packages/cli/templates/base/package.json.hbs')
  try {
    if (syncVersionInHbs(hbsPath, version)) {
      updated.push('packages/cli/templates/base/package.json.hbs')
    }
    else {
      skipped.push('packages/cli/templates/base/package.json.hbs')
    }
  }
  catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.warn(`Warning: Could not process packages/cli/templates/base/package.json.hbs: ${errorMsg}`)
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

  console.log(`\nDone. Version ${version} synced to ${updated.length} files.`)
}

main()
