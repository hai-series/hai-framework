import type { AgentPreferences, AgentResource, AgentTask, AgentTurn, WorkspaceAction, WorkspaceEntry } from './workspace.js'
import { resolve } from '$app/paths'
import { blobToWav } from '@h-ai/ai/client'

export interface HomeView {
  preferences: AgentPreferences
  tasks: AgentTask[]
  agents: { id: string, name: string, adapter: string, models: string[], modes: string[] }[]
  projects: { id: string, title: string }[]
  tools: { id: string, description: string }[]
  skills: { id: string, title: string }[]
  speech: { asr: boolean, tts: boolean }
  workbench?: { artifacts: boolean, tools: boolean }
}

export interface TaskView {
  task: AgentTask
  turns: AgentTurn[]
  events: { sequence: number, data: WorkspaceEntry, createdAt: number }[]
}

export interface KnowledgeView extends AgentResource {
  documents: { documentId: string, title?: string }[]
}

export interface MemoryView {
  entries: { id: string, content: string }[]
  proposals: AgentResource[]
}

export class AgentClientError extends Error {
  constructor(readonly status: number, readonly code: string, readonly currentVersion?: number) {
    super(code)
  }
}

async function checked(response: Response) {
  if (response.ok)
    return response
  const body = await response.json().catch(() => null)
  throw new AgentClientError(response.status, typeof body?.code === 'string'
    ? body.code
    : 'operation-failed', Number.isSafeInteger(body?.currentVersion) && body.currentVersion > 0
    ? body.currentVersion
    : undefined)
}

export function url(params?: Record<string, string>) {
  return resolve('/api/workspace') + (params
    ? `?${new URLSearchParams(params).toString()}`
    : '')
}

export async function read<T>(params?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  return (await checked(await fetch(url(params), { signal }))).json()
}

export async function mutate<T>(command: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await checked(await fetch(url(), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  }))
  return response.json()
}

export function send<T>(command: WorkspaceAction): Promise<T> {
  return mutate(command)
}

export async function upload(file: File): Promise<AgentResource> {
  const body = new FormData()
  body.set('file', file)
  return (await checked(await fetch(url(), { method: 'POST', body }))).json()
}

export async function transcribe(file: Blob) {
  const body = new FormData()
  body.set('audio', ['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(file.type)
    ? file
    : await blobToWav(file), 'speech')
  return (await checked(await fetch(resolve('/api/media'), { method: 'POST', body }))).json() as Promise<{ text: string }>
}

export async function speak(text: string, voice: string, signal: AbortSignal) {
  const response = await checked(await fetch(resolve('/api/media'), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  }))
  return response.blob()
}

export async function record(complete: (audio: Blob) => void) {
  const media = await navigator.mediaDevices.getUserMedia({ audio: true })
  try {
    const recorder = new MediaRecorder(media)
    const pieces: Blob[] = []
    recorder.addEventListener('dataavailable', event => pieces.push(event.data))
    const stop = () => {
      if (recorder.state === 'recording') {
        recorder.stop()
      }
    }
    let deadline: ReturnType<typeof setTimeout> | undefined
    recorder.addEventListener('stop', () => {
      clearTimeout(deadline)
      for (const track of media.getTracks()) {
        track.stop()
      }
      complete(new Blob(pieces, { type: recorder.mimeType }))
    }, { once: true })
    recorder.start()
    deadline = setTimeout(stop, 60_000)
    return stop
  }
  catch (error) {
    for (const track of media.getTracks()) {
      track.stop()
    }
    throw error
  }
}
