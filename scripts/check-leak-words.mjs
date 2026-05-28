#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(import.meta.dirname, '..')
const CONFIG_PATH = resolve(ROOT, '.leak-words.json')
const ZERO_OID = '0000000000000000000000000000000000000000'

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

function runGit(args, options = {}) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf-8',
      ...options,
    }).trimEnd()
  }
  catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr || '') : ''
    const message = stderr.trim() || (error instanceof Error ? error.message : String(error))
    throw new Error(message)
  }
}

function getConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return null
  }

  const config = readJson(CONFIG_PATH)
  const blockedTerms = Array.isArray(config)
    ? config.filter(term => typeof term === 'string' && term.trim().length > 0)
    : []

  if (blockedTerms.length === 0) {
    return null
  }

  return { blockedTerms }
}

function findTermsInText(text, blockedTerms) {
  return blockedTerms.filter(term => text.includes(term))
}

function parsePatchMatches(patchText, blockedTerms) {
  const matches = []
  let currentFile = ''
  let newLineNumber = 0

  for (const line of patchText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      currentFile = ''
      newLineNumber = 0
      continue
    }

    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6)
      continue
    }

    if (line.startsWith('@@')) {
      const match = line.match(/\+(\d+)(?:,\d+)?/)
      newLineNumber = match ? Number(match[1]) : 0
      continue
    }

    if (!currentFile || !line.startsWith('+') || line.startsWith('+++')) {
      if (currentFile && line.startsWith(' ') && newLineNumber > 0) {
        newLineNumber += 1
      }
      continue
    }

    const content = line.slice(1)
    const terms = findTermsInText(content, blockedTerms)
    if (terms.length > 0) {
      matches.push({
        file: currentFile,
        line: newLineNumber,
        content,
        terms,
      })
    }

    if (newLineNumber > 0) {
      newLineNumber += 1
    }
  }

  return matches
}

function printPatchMatches(header, matches) {
  if (matches.length === 0) {
    return
  }

  console.error(header)
  for (const match of matches) {
    const location = match.line > 0 ? `${match.file}:${match.line}` : match.file
    console.error(`  - ${location} hit [${match.terms.join(', ')}]`)
    console.error(`    ${match.content}`)
  }
}

function printMessageMatches(header, matches) {
  if (matches.length === 0) {
    return
  }

  console.error(header)
  for (const match of matches) {
    console.error(`  - line ${match.line} hit [${match.terms.join(', ')}]`)
    console.error(`    ${match.content}`)
  }
}

function parseCommitMessageMatches(text, config) {
  return text
    .split('\n')
    .map((line, index) => ({
      line: index + 1,
      content: line,
      terms: findTermsInText(line, config.blockedTerms),
    }))
    .filter(item => item.terms.length > 0)
}

function scanCommitMessageFile(messageFile, config) {
  const content = readFileSync(resolve(ROOT, messageFile), 'utf-8')
  return parseCommitMessageMatches(content, config)
}

function scanStagedPatch(config) {
  const patch = runGit(['diff', '--cached', '--unified=0', '--no-color', '--no-ext-diff', '--diff-filter=AMCR'])
  return parsePatchMatches(patch, config.blockedTerms)
}

function getCommitsForPushUpdate(localOid, remoteOid) {
  if (!localOid || localOid === ZERO_OID) {
    return []
  }

  if (!remoteOid || remoteOid === ZERO_OID) {
    const output = runGit(['rev-list', localOid, '--not', '--remotes'])
    return output ? output.split('\n').filter(Boolean) : []
  }

  const output = runGit(['rev-list', `${remoteOid}..${localOid}`])
  return output ? output.split('\n').filter(Boolean) : []
}

function scanCommitMessage(commitOid, config) {
  const content = runGit(['log', '-1', '--format=%B', commitOid])
  return parseCommitMessageMatches(content, config)
}

function scanCommitPatch(commitOid, config) {
  const patch = runGit(['show', '--format=', '--unified=0', '--no-color', '--no-ext-diff', '--diff-filter=AMCR', commitOid])
  return parsePatchMatches(patch, config.blockedTerms)
}

function failWithSummary(title, detailsPrinter) {
  console.error(`\n${title}`)
  detailsPrinter()
  console.error('\nGit hook blocked this operation. Update .leak-words.json if needed.')
  process.exit(1)
}

function handleStagedMode(config) {
  const matches = scanStagedPatch(config)
  if (matches.length === 0) {
    return
  }

  failWithSummary('Detected leak words in staged changes:', () => {
    printPatchMatches('Please remove the following matches:', matches)
  })
}

function handleCommitMessageMode(messageFile, config) {
  if (!messageFile) {
    throw new Error('Missing commit message file path.')
  }

  const matches = scanCommitMessageFile(messageFile, config)
  if (matches.length === 0) {
    return
  }

  failWithSummary('Detected leak words in the commit message:', () => {
    printMessageMatches('Please remove the following matches:', matches)
  })
}

function handlePushMode(config) {
  const stdin = readFileSync(0, 'utf-8').trim()
  if (!stdin) {
    return
  }

  const updates = stdin
    .split('\n')
    .map((line) => {
      const [localRef, localOid, remoteRef, remoteOid] = line.trim().split(/\s+/)
      return { localRef, localOid, remoteRef, remoteOid }
    })
    .filter(update => update.localRef && update.localOid)

  const seen = new Set()

  for (const update of updates) {
    const commits = getCommitsForPushUpdate(update.localOid, update.remoteOid)
    for (const commitOid of commits) {
      if (seen.has(commitOid)) {
        continue
      }
      seen.add(commitOid)

      const messageMatches = scanCommitMessage(commitOid, config)
      const patchMatches = scanCommitPatch(commitOid, config)

      if (messageMatches.length === 0 && patchMatches.length === 0) {
        continue
      }

      failWithSummary(`Detected leak words in commit ${commitOid.slice(0, 8)}:`, () => {
        if (messageMatches.length > 0) {
          printMessageMatches('Commit message:', messageMatches)
        }
        if (patchMatches.length > 0) {
          printPatchMatches('Staged content:', patchMatches)
        }
        console.error(`\nSource: ${update.localRef} -> ${update.remoteRef}`)
      })
    }
  }
}

function main() {
  const config = getConfig()
  if (!config) {
    console.log('No .leak-words.json found or no terms configured. Skipping leak word check.')
    return
  }

  const args = process.argv.slice(2)

  if (args.includes('--staged')) {
    handleStagedMode(config)
    return
  }

  const commitMsgIndex = args.indexOf('--commit-msg-file')
  if (commitMsgIndex >= 0) {
    handleCommitMessageMode(args[commitMsgIndex + 1], config)
    return
  }

  if (args.includes('--push')) {
    handlePushMode(config)
    return
  }

  throw new Error('Unsupported mode. Use --staged, --commit-msg-file <path>, or --push.')
}

main()
