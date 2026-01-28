/**
 * =============================================================================
 * @hai/crypto - 主入口
 * =============================================================================
 * 提供国密算法和密码哈希功能
 * 
 * 模块:
 * - sm2: 非对称加密（密钥交换、数字签名）
 * - sm3: 哈希算法
 * - sm4: 对称加密
 * - password: 密码哈希（Argon2id）
 * =============================================================================
 */

// SM2 非对称加密
export {
    decrypt as sm2Decrypt,
    encrypt as sm2Encrypt,
    generateKeyPair as sm2GenerateKeyPair,
    isValidPrivateKey as sm2IsValidPrivateKey,
    isValidPublicKey as sm2IsValidPublicKey,
    sign as sm2Sign,
    verify as sm2Verify,
    type SM2EncryptOptions,
    type SM2Error,
    type SM2ErrorType,
    type SM2KeyPair,
    type SM2SignOptions,
} from './sm2.js'

// SM3 哈希
export {
    createHasher as sm3CreateHasher,
    hash as sm3Hash,
    hmac as sm3Hmac,
    SM3Hasher,
    verify as sm3Verify,
    type SM3Error,
    type SM3ErrorType,
    type SM3HmacOptions,
    type SM3Options,
} from './sm3.js'

// SM4 对称加密
export {
    decrypt as sm4Decrypt,
    decryptWithIV as sm4DecryptWithIV,
    deriveKey as sm4DeriveKey,
    encrypt as sm4Encrypt,
    encryptWithIV as sm4EncryptWithIV,
    generateIV as sm4GenerateIV,
    generateKey as sm4GenerateKey,
    isValidIV as sm4IsValidIV,
    isValidKey as sm4IsValidKey,
    type SM4Error,
    type SM4ErrorType,
    type SM4Mode,
    type SM4Options,
} from './sm4.js'

// 密码哈希
export {
    hashPassword,
    needsRehash,
    validatePasswordStrength,
    verifyPassword,
    type Argon2Options,
    type PasswordError,
    type PasswordErrorType,
} from './password.js'
