import { resolve } from '$app/paths'

interface DemoEnvelope<T> {
  success: boolean
  data?: T
}

async function requestDemo<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(resolve('/api/demos'), init)
  const envelope = await response.json() as DemoEnvelope<T>
  if (!response.ok || !envelope.success || !envelope.data)
    throw new Error('Playground demo request failed')
  return envelope.data
}

export async function loadDemoAvailability(signal: AbortSignal): Promise<Record<string, string>> {
  return (await requestDemo<{ unavailable: Record<string, string> }>({ signal })).unavailable
}

export async function runDemo(id: string, input: string, signal: AbortSignal): Promise<unknown> {
  const data = await requestDemo<{ result: unknown }>({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, input }),
    signal,
  })
  return data.result
}
