/**
 * =============================================================================
 * @hai/auth - 主入口
 * =============================================================================
 * 认证模块，提供:
 * - 会话管理
 * - E2EE 登录
 * - JWT 令牌
 * - 密码服务
 * =============================================================================
 */

// 会话管理
export {
    createSessionManager,
    MemorySessionStore,
    SessionManager,
    type CreateSessionOptions,
    type SessionData,
    type SessionError,
    type SessionErrorType,
    type SessionStore,
} from './session.js'

// E2EE 登录
export {
    createE2EELoginManager,
    createPasswordService,
    E2EELoginManager,
    PasswordService,
    type E2EEError,
    type E2EEErrorType,
    type PasswordPolicy,
} from './e2ee.js'

// JWT 令牌
export {
    createJWTManager,
    JWTManager,
    type AccessTokenPayload,
    type JWTError,
    type JWTErrorType,
    type RefreshTokenPayload,
    type TokenPair,
} from './jwt.js'
