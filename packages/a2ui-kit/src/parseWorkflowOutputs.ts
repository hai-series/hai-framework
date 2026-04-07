/**
 * Extract A2UI JSONL / JSON from workflow instance outputs (try-run / dialog).
 * @see https://a2ui.org/reference/messages/
 */

import { parseA2UIMessages } from '@vkdevfolio/a2ui-vue'

const PREFERRED_KEYS = ['a2ui', 'a2ui_messages', 'a2ui_spec', 'ui_spec'] as const

function stringifyOutputValue(v: unknown): string | null {
  if (v === null || v === undefined)
    return null
  if (typeof v === 'string')
    return v
  if (typeof v === 'number' || typeof v === 'boolean')
    return String(v)
  try {
    return JSON.stringify(v)
  }
  catch {
    return null
  }
}

function getOutputString(outputs: Record<string, unknown>, key: string): string | null {
  return stringifyOutputValue(outputs[key])
}

function stripJsonCodeFence(raw: string): string {
  const t = raw.trim()
  // Match ```json or ``` followed by content until closing ```
  const fenceMatch = t.match(/```[^\n]*\n([\s\S]*?)```/)
  if (fenceMatch)
    return fenceMatch[1].trim()
  return t
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw)
  }
  catch {
    return null
  }
}

/**
 * Find the end index of the top-level JSON array that starts at `openIdx` (`[`),
 * respecting JSON string literals and escapes (`\"`, `\\`, `\n`, `\uXXXX`, etc.).
 */
function findMatchingJsonArrayEnd(s: string, openIdx: number): number {
  if (s[openIdx] !== '[')
    return -1
  let depth = 0
  let inString = false
  let i = openIdx
  while (i < s.length) {
    const c = s[i]
    if (inString) {
      if (c === '\\') {
        i++
        if (i >= s.length)
          return -1
        if (s[i] === 'u') {
          i += 5
          continue
        }
        i++
        continue
      }
      if (c === '"')
        inString = false
      i++
      continue
    }
    if (c === '"') {
      inString = true
      i++
      continue
    }
    if (c === '[')
      depth++
    else if (c === ']')
      depth--
    if (depth === 0)
      return i
    i++
  }
  return -1
}

/**
 * When backend double-encodes A2UI as a string literal, the value may look like:
 * `"[\n  { \"version\": \"v0.10\", ... }\n]"`
 * i.e. first char is `"` not `[`, and `JSON.parse(entireString)` fails because inner quotes break the outer JSON string.
 * Extract from first `[` to the matching `]` (not last `]` — Markdown/text may contain `]`).
 */
function tryExtractJsonArrayFromQuotedWrapper(s: string): unknown[] | null {
  const t = s.trim()
  const i = t.indexOf('[')
  if (i < 0)
    return null
  const j = findMatchingJsonArrayEnd(t, i)
  if (j < 0 || j <= i)
    return null
  const slice = t.slice(i, j + 1)
  const parsed = tryParseJson(slice)
  if (!Array.isArray(parsed))
    return null
  return parsed.every(isA2UiEnvelope) ? parsed : null
}

/**
 * Coerce an unknown output value into a "raw string" payload that
 * `parseA2UiMessageLines()` can understand:
 * - unwrap outer JSON-string wrappers (possibly repeated)
 * - strip ```json ... ``` fences
 * - recover JSON array from `"[...]"` double-encoding when JSON.parse(whole) fails
 * - keep JSONL array/object as-is
 */
function coerceA2UiRawString(v: unknown): string | null {
  if (v === null || v === undefined)
    return null

  // If already structured, stringify it into a JSON string.
  if (typeof v !== 'string') {
    if (Array.isArray(v) || isA2UiEnvelope(v))
      return JSON.stringify(v)
    return null
  }

  let trimmed = stripJsonCodeFence(v.trim())

  // Repeatedly unwrap JSON string layers: "\"[...]\"" -> inner string -> [...]
  for (let depth = 0; depth < 8; depth++) {
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const extracted = tryExtractJsonArrayFromQuotedWrapper(trimmed)
      if (extracted)
        return JSON.stringify(extracted)
      const parsed = tryParseJson(trimmed)
      if (Array.isArray(parsed) && parsed.every(isA2UiEnvelope))
        return JSON.stringify(parsed)
      if (isA2UiEnvelope(parsed))
        return JSON.stringify(parsed)
      break
    }

    const parsedOuter = tryParseJson(trimmed)
    if (typeof parsedOuter === 'string') {
      trimmed = stripJsonCodeFence(parsedOuter.trim())
      continue
    }
    if (Array.isArray(parsedOuter) && parsedOuter.every(isA2UiEnvelope))
      return JSON.stringify(parsedOuter)
    if (isA2UiEnvelope(parsedOuter))
      return JSON.stringify(parsedOuter)

    // Double-encoded: outer quotes make JSON.parse fail — slice from [ to ]
    const extracted = tryExtractJsonArrayFromQuotedWrapper(trimmed)
    if (extracted)
      return JSON.stringify(extracted)
    break
  }

  return null
}

function unwrapJsonStringLayers(s: string): string {
  let t = stripJsonCodeFence(s.trim())
  for (let i = 0; i < 8; i++) {
    const p = tryParseJson(t)
    if (typeof p === 'string')
      t = stripJsonCodeFence(p.trim())
    else break
  }
  return t
}

/** If the payload is wrapped in junk / outer quotes, slice the first top-level JSON array. */
function extractJsonArraySliceIfNeeded(s: string): string {
  const t = s.trim()
  if (t.startsWith('['))
    return t
  const i = t.indexOf('[')
  if (i < 0)
    return t
  const j = findMatchingJsonArrayEnd(t, i)
  if (j < 0)
    return t
  return t.slice(i, j + 1)
}

/**
 * Resolve outputs field to A2UI message array: use package parser + our fallbacks
 * (handles double-encoded strings, code fences, and bracket slicing).
 */
function tryParseA2UiMessagesFromRaw(raw: unknown): unknown[] | null {
  if (raw === null || raw === undefined)
    return null
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const fromPkg = parseA2UIMessages(raw as object)
    if (fromPkg.length > 0)
      return fromPkg
    if (isA2UiEnvelope(raw))
      return [raw]
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const fromPkg = parseA2UIMessages(raw as object)
    if (fromPkg.length > 0)
      return fromPkg
    if (raw.every(isA2UiEnvelope))
      return raw
  }
  if (typeof raw !== 'string')
    return null
  let layered = unwrapJsonStringLayers(raw)
  layered = extractJsonArraySliceIfNeeded(layered)
  const pkg = parseA2UIMessages(layered)
  if (pkg.length > 0)
    return pkg
  const cand = coerceA2UiRawString(raw)
  if (cand) {
    const a = parseA2UiMessageLines(cand)
    if (a.length > 0)
      return a
  }
  return null
}

function decodeEscapedNewlines(s: string): string {
  // Runtime may deliver doubly-escaped text (e.g. "\\n"), render as real line breaks.
  return s.replace(/\\n/g, '\n')
}

function normalizeA2UiMessageText(messages: unknown[]): unknown[] {
  const cloned = JSON.parse(JSON.stringify(messages)) as Record<string, unknown>[]
  for (const msg of cloned) {
    const comps = msg?.updateComponents?.components
    if (!Array.isArray(comps))
      continue
    for (const comp of comps) {
      if (typeof comp?.text === 'string')
        comp.text = decodeEscapedNewlines(comp.text)
      const inner = comp?.component
      if (inner && typeof inner === 'object') {
        for (const key of Object.keys(inner)) {
          if (typeof inner[key]?.text === 'string')
            inner[key].text = decodeEscapedNewlines(inner[key].text)
        }
      }
    }
  }
  return cloned
}

export function looksLikeStructuredPayload(s: string): boolean {
  const t = s.trim()
  if (!t)
    return false
  if (t.startsWith('{') || t.startsWith('['))
    return true
  const firstLine = t.split(/\r?\n/).find(l => l.trim().length > 0)?.trim() ?? ''
  return firstLine.startsWith('{')
}

export function isA2UiEnvelope(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object')
    return false
  const o = obj as Record<string, unknown>
  if (
    'beginRendering' in o
    || 'surfaceUpdate' in o
    || 'dataModelUpdate' in o
    || 'deleteSurface' in o
  ) {
    return true
  }
  if (o.version === 'v0.9') {
    const keys = Object.keys(o)
    if (keys.some(k => ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'].includes(k)))
      return true
  }
  if (o.version === 'v0.10') {
    const keys = Object.keys(o)
    if (keys.some(k => ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface', 'beginRendering'].includes(k)))
      return true
  }
  if ('updateComponents' in o || ('createSurface' in o && !('beginRendering' in o)))
    return true
  return false
}

export function parseA2UiMessageLines(raw: string): unknown[] {
  const trimmed = raw.trim()
  if (!trimmed)
    return []

  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed) as unknown
      if (!Array.isArray(arr))
        return []
      return arr.every(isA2UiEnvelope) ? arr : []
    }
    catch {
      return []
    }
  }

  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out: unknown[] = []
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as unknown
      if (!isA2UiEnvelope(obj))
        return []
      out.push(obj)
    }
    catch {
      return []
    }
  }
  return out
}

export function extractA2UiPayload(outputs: Record<string, unknown> | null | undefined): string | null {
  if (!outputs || typeof outputs !== 'object')
    return null

  for (const key of [...PREFERRED_KEYS, 'systemResponse', 'systemOutput'] as const) {
    const msgs = tryParseA2UiMessagesFromRaw(outputs[key])
    if (msgs && msgs.length > 0)
      return JSON.stringify(msgs)
  }
  return null
}

export function buildAssistantDisplayFromOutputs(outputs: Record<string, unknown> | null | undefined): {
  chat_content: string
  a2ui_messages?: unknown[]
} {
  if (!outputs || typeof outputs !== 'object')
    return { chat_content: '' }

  for (const key of PREFERRED_KEYS) {
    const msgs = tryParseA2UiMessagesFromRaw(outputs[key])
    if (msgs && msgs.length > 0)
      return { chat_content: '', a2ui_messages: normalizeA2UiMessageText(msgs) }
  }
  const sr = tryParseA2UiMessagesFromRaw(outputs.systemResponse)
  if (sr && sr.length > 0)
    return { chat_content: '', a2ui_messages: normalizeA2UiMessageText(sr) }
  const so = tryParseA2UiMessagesFromRaw(outputs.systemOutput)
  if (so && so.length > 0)
    return { chat_content: '', a2ui_messages: normalizeA2UiMessageText(so) }

  const text
    = getOutputString(outputs, 'systemResponse')
      || getOutputString(outputs, 'systemOutput')
      || ''
  return { chat_content: text }
}
