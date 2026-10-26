/** 自托管 ALTCHA 挑战；共享 Cache 持有签名秘密与单用状态，不提供通用策略层。 */
import type { HaiResult } from '@h-ai/core'
import type { IamConfig } from '../iam-config.js'
import type { CaptchaOperation, IamCaptchaChallenge } from './iam-authn-types.js'
import { randomBytes, randomInt } from 'node:crypto'
import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'
import { createChallenge, pbkdf2, verifySolution } from 'altcha/lib'
import { z } from 'zod'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'

const logger = core.logger.child({ module: 'iam', scope: 'captcha' })
const prefix = 'hai:iam:captcha:'
const operationSchema = z.enum(['login', 'register', 'sendOtp', 'passwordReset', 'renewPassword'])
const proofSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  solution: z.object({ counter: z.number().int().min(0).max(2000), derivedKey: z.string().regex(/^[a-f0-9]{64}$/i), time: z.number().finite().nonnegative().optional() }),
})

/**
 * 共享缓存的服务端记录；秘密不进入公开挑战或业务审计。
 * @example 模块内部上下文
 * ```ts
 * function purpose(record: StoredCaptcha) { return record.operation }
 * ```
 */
interface StoredCaptcha {
  operation: CaptchaOperation
  challenge: IamCaptchaChallenge['challenge']
  signatureSecret: string
  keySecret: string
}

/**
 * 生成可公开挑战；配置来自 IAM 已校验的初始化输入。
 * @example 模块内部上下文
 * ```ts
 * async function create(config: IamConfig['captcha']) {
 *   return createIamCaptcha(config, { operation: 'login' })
 * }
 * ```
 */
export async function createIamCaptcha(config: IamConfig['captcha'], input: { operation: CaptchaOperation }): Promise<HaiResult<IamCaptchaChallenge>> {
  if (!config.enabled)
    return err(HaiIamError.CAPTCHA_DISABLED, iamM('iam_captchaDisabled'))
  const operation = operationSchema.safeParse(input?.operation)
  if (!operation.success)
    return err(HaiIamError.CAPTCHA_INVALID, iamM('iam_captchaInvalid'))
  try {
    const id = randomBytes(32).toString('hex')
    const signatureSecret = randomBytes(32).toString('hex')
    const keySecret = randomBytes(32).toString('hex')
    const challenge = await createChallenge({
      algorithm: 'PBKDF2/SHA-256',
      cost: config.cost,
      counter: randomInt(1, config.maxCounter + 1),
      deriveKey: pbkdf2.deriveKey,
      hmacSignatureSecret: signatureSecret,
      hmacKeySignatureSecret: keySecret,
      data: { operation: operation.data },
    })
    // Cache 自己的相对 TTL 是到期真值，不用各节点的墙钟延长或重签证明。
    const record: StoredCaptcha = { operation: operation.data, challenge, signatureSecret, keySecret }
    const saved = await cache.kv.set(`${prefix}${id}`, record, { nx: true, ex: config.ttlSeconds })
    if (!saved.success || !saved.data)
      return err(HaiIamError.CAPTCHA_UNAVAILABLE, iamM('iam_captchaUnavailable'))
    return ok({ id, challenge })
  }
  catch (error) {
    logger.error('Captcha challenge generation failed', { operation: operation.data, error })
    return err(HaiIamError.CAPTCHA_UNAVAILABLE, iamM('iam_captchaUnavailable'))
  }
}

/**
 * 在鉴别/通知之前校验并原子消费；只使用服务端缓存的算法、成本、签名与用途。
 * @example 模块内部上下文
 * ```ts
 * async function check(config: IamConfig['captcha'], proof: string) {
 *   const verified = await verifyIamCaptcha(config, 'login', proof)
 *   if (!verified.success) return verified
 *   // 此后才能进行密码鉴别；业务失败也不能重用已消费的证明。
 *   return verified
 * }
 * ```
 */
export async function verifyIamCaptcha(config: IamConfig['captcha'], operation: CaptchaOperation, proof?: string): Promise<HaiResult<void>> {
  if (!config.enabled)
    return ok(undefined)
  if (!proof)
    return err(HaiIamError.CAPTCHA_REQUIRED, iamM('iam_captchaRequired'))
  if (typeof proof !== 'string' || proof.length > 4096)
    return err(HaiIamError.CAPTCHA_INVALID, iamM('iam_captchaInvalid'))
  let payload: z.output<typeof proofSchema>
  try {
    const parsed = proofSchema.safeParse(JSON.parse(proof))
    if (!parsed.success)
      return err(HaiIamError.CAPTCHA_INVALID, iamM('iam_captchaInvalid'))
    payload = parsed.data
  }
  catch {
    return err(HaiIamError.CAPTCHA_INVALID, iamM('iam_captchaInvalid'))
  }
  try {
    const key = `${prefix}${payload.id}`
    const found = await cache.kv.get<StoredCaptcha>(key)
    if (!found.success)
      return err(HaiIamError.CAPTCHA_UNAVAILABLE, iamM('iam_captchaUnavailable'))
    if (!found.data || found.data.operation !== operation)
      return err(HaiIamError.CAPTCHA_INVALID, iamM('iam_captchaInvalid'))
    const record = found.data
    const result = await verifySolution({ challenge: record.challenge, solution: payload.solution, deriveKey: pbkdf2.deriveKey, hmacSignatureSecret: record.signatureSecret, hmacKeySignatureSecret: record.keySecret })
    if (!result.verified)
      return err(HaiIamError.CAPTCHA_INVALID, iamM('iam_captchaInvalid'))
    const removed = await cache.kv.del(key)
    if (!removed.success)
      return err(HaiIamError.CAPTCHA_UNAVAILABLE, iamM('iam_captchaUnavailable'))
    return removed.data === 1 ? ok(undefined) : err(HaiIamError.CAPTCHA_INVALID, iamM('iam_captchaInvalid'))
  }
  catch (error) {
    logger.error('Captcha verification failed', { operation, error })
    return err(HaiIamError.CAPTCHA_UNAVAILABLE, iamM('iam_captchaUnavailable'))
  }
}
