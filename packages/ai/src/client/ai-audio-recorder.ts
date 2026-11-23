/**
 * 麦克风会话选项。应用通过回调决定何时转写和保存录音。
 * @example
 * ```ts
 * import type { AudioRecorderOptions } from '@h-ai/ai/client'
 * const options: AudioRecorderOptions = { maxDurationSeconds: 30, onStop: blob => void blob.size }
 * ```
 */
export interface AudioRecorderOptions {
  /** 请求麦克风时使用的音轨约束，默认 true。 */
  audio?: MediaTrackConstraints | true
  /** MediaRecorder 的编码选项。 */
  encoding?: MediaRecorderOptions
  /** 分段间隔，毫秒，默认 250。 */
  timesliceMs?: number
  /** 达到录音时长上限后停止并发布最后一段数据。 */
  maxDurationSeconds?: number
  /** 超过编码字节上限时中止并调用 onError。 */
  maxInputBytes?: number
  /** 正常停止后的完整录音。 */
  onStop: (recording: Blob) => void
  /** 录音开始后发生的编码或容量错误。 */
  onError?: (error: Error) => void
}

/**
 * 浏览器麦克风会话。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai/client'
 * const recorder = ai.createAudioRecorder({ onStop: blob => void blob.size })
 * recorder.close()
 * ```
 */
export interface AudioRecorder {
  /** 请求麦克风并开始录音，权限、设备和配置失败时 reject。 */
  start: () => Promise<void>
  /** 正常停止，最终数据随后由 onStop 发布。 */
  stop: () => void
  /** 返回已经收到的录音分段，不改变录音状态。 */
  snapshot: () => Blob
  /** 放弃本次录音及未完成的麦克风申请，释放已有轨道。 */
  close: () => void
}

/**
 * 创建独立的浏览器麦克风会话，故读取权限及编码状态不依赖 AI 服务。
 * @param options - 录音约束、会话上限和结果回调
 * @returns 可开始、快照、停止或释放的会话实例
 * @throws 上限或分段间隔无效时抛出 RangeError
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai/client'
 * async function record() {
 *   const recorder = ai.createAudioRecorder({ onStop: blob => void blob.size })
 *   await recorder.start()
 *   return recorder
 * }
 * ```
 */
export function createAudioRecorder(options: AudioRecorderOptions): AudioRecorder {
  const { audio = true, encoding, timesliceMs = 250, maxDurationSeconds, maxInputBytes, onStop, onError } = options
  if (!Number.isSafeInteger(timesliceMs) || timesliceMs < 1
    || (maxDurationSeconds !== undefined && (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0 || maxDurationSeconds * 1000 > 0x7FFFFFFF))
    || (maxInputBytes !== undefined && (!Number.isSafeInteger(maxInputBytes) || maxInputBytes < 1))) {
    throw new RangeError('Invalid audio recording limits')
  }

  let generation = 0
  let starting = false
  let stream: MediaStream | undefined
  let recorder: MediaRecorder | undefined
  let chunks: Blob[] = []
  let bytes = 0
  let mimeType = ''
  let timer: ReturnType<typeof setTimeout> | undefined

  function release(): void {
    clearTimeout(timer)
    timer = undefined
    stream?.getTracks().forEach(track => track.stop())
    stream = undefined
    recorder = undefined
  }

  function stop(): void {
    if (recorder?.state === 'recording' || recorder?.state === 'paused')
      recorder.stop()
  }

  function snapshot(): Blob {
    return new Blob(chunks, { type: chunks[0]?.type || mimeType || 'audio/webm' })
  }

  function close(): void {
    generation++
    starting = false
    stop()
    release()
    chunks = []
    bytes = 0
    mimeType = ''
  }

  return {
    async start() {
      if (starting || recorder)
        throw new Error('Audio recording already active')
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('Audio recording unavailable')
      const current = ++generation
      starting = true
      chunks = []
      bytes = 0
      mimeType = ''
      try {
        const microphone = await navigator.mediaDevices.getUserMedia({ audio })
        if (current !== generation) {
          microphone.getTracks().forEach(track => track.stop())
          throw new DOMException('Audio recording canceled', 'AbortError')
        }
        stream = microphone
        const session = new MediaRecorder(microphone, encoding)
        recorder = session
        mimeType = session.mimeType
        session.ondataavailable = ({ data }) => {
          if (current !== generation || !data.size)
            return
          bytes += data.size
          if (maxInputBytes !== undefined && bytes > maxInputBytes) {
            close()
            onError?.(new RangeError('Audio recording exceeds its input size limit'))
            return
          }
          chunks.push(data)
        }
        session.onstop = () => {
          if (current !== generation)
            return
          release()
          onStop(snapshot())
        }
        session.onerror = () => {
          if (current !== generation)
            return
          close()
          onError?.(new Error('Audio recording failed'))
        }
        session.start(timesliceMs)
        if (maxDurationSeconds !== undefined)
          timer = setTimeout(stop, maxDurationSeconds * 1000)
      }
      catch (error) {
        if (current === generation)
          release()
        throw error
      }
      finally {
        if (current === generation)
          starting = false
      }
    },
    stop,
    snapshot,
    close,
  }
}
