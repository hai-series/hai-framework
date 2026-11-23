import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai } from '../src/client/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('browser WAV conversion', () => {
  it('bounds input before decoding and clips PCM output only when requested', async () => {
    const decode = vi.fn().mockResolvedValue({ duration: 31 })
    const close = vi.fn().mockResolvedValue(undefined)
    const createOffline = vi.fn()
    vi.stubGlobal('AudioContext', class {
      decodeAudioData = decode
      close = close
    })
    vi.stubGlobal('OfflineAudioContext', class {
      constructor(_channels: number, frames: number) {
        createOffline(frames)
        this.frames = frames
      }

      frames: number
      destination = {}
      createBufferSource = () => ({
        connect: vi.fn(),
        start: vi.fn(),
      })

      startRendering = async () => ({
        getChannelData: () => {
          const samples = new Float32Array(this.frames)
          samples[0] = -2
          samples[1] = 2
          return samples
        },
      })
    })
    const blob = new Blob(['encoded'])
    await expect(ai.blobToWav(blob, { maxInputBytes: 4 })).rejects.toThrow(RangeError)
    expect(decode).not.toHaveBeenCalled()
    await expect(ai.blobToWav(blob, { maxDurationSeconds: 30 })).rejects.toThrow(RangeError)
    expect(createOffline).not.toHaveBeenCalled()
    const wav = await ai.blobToWav(blob, { maxDurationSeconds: 30, overflow: 'truncate' })
    expect(createOffline).toHaveBeenCalledWith(480_000)
    expect(wav.type).toBe('audio/wav')
    expect(wav.size).toBe(960_044)
    const data = new DataView(await wav.arrayBuffer())
    expect(data.getUint32(0)).toBe(0x52494646)
    expect(data.getUint32(24, true)).toBe(16_000)
    expect([44, 46].map(offset => data.getInt16(offset, true))).toEqual([-32768, 32767])
    expect(close).toHaveBeenCalledTimes(2)
    const oldCall = await ai.blobToWav(blob, 8_000)
    expect(new DataView(await oldCall.arrayBuffer()).getUint32(24, true)).toBe(8_000)
  })
})

describe('browser recording session', () => {
  it('emits a final snapshot when reaching its duration limit and releases the microphone', async () => {
    vi.useFakeTimers()
    const stopTrack = vi.fn()
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [
            { stop: stopTrack },
          ],
        }),
      },
    })
    vi.stubGlobal('MediaRecorder', class {
      mimeType = 'audio/webm'
      state = 'inactive'
      ondataavailable?: (event: { data: Blob }) => void
      onstop?: () => void

      start(): void {
        this.state = 'recording'
        this.ondataavailable?.({
          data: new Blob(['start']),
        })
      }

      stop(): void {
        this.state = 'inactive'
        this.ondataavailable?.({
          data: new Blob(['end']),
        })
        this.onstop?.()
      }
    })
    const onStop = vi.fn()
    const recorder = ai.createAudioRecorder({ maxDurationSeconds: 1, onStop })
    await recorder.start()
    await expect(recorder.snapshot().text()).resolves.toBe('start')
    await vi.advanceTimersByTimeAsync(1000)
    expect(onStop).toHaveBeenCalledTimes(1)
    await expect(onStop.mock.calls[0][0].text()).resolves.toBe('startend')
    expect(stopTrack).toHaveBeenCalledTimes(1)
  })

  it('stops tracks granted after the application has closed the session', async () => {
    const grant = Promise.withResolvers<{ getTracks: () => { stop: () => void }[] }>()
    const stopTrack = vi.fn()
    const onStop = vi.fn()
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: () => grant.promise,
      },
    })
    vi.stubGlobal('MediaRecorder', class {})
    const recorder = ai.createAudioRecorder({ onStop })
    const started = recorder.start()
    recorder.close()
    grant.resolve({
      getTracks: () => [
        { stop: stopTrack },
      ],
    })
    await expect(started).rejects.toMatchObject({ name: 'AbortError' })
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(onStop).not.toHaveBeenCalled()
  })
})
