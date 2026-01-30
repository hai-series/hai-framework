/**
 * =============================================================================
 * @hai/ui - IAM 密码工具
 * =============================================================================
 * 密码规范化与一致性比较工具
 * =============================================================================
 */

/**
 * 规范化密码字符串
 * - 使用 NFKC 统一兼容字符
 */
export function normalizePassword(value: string): string {
  return value.normalize('NFKC')
}

/**
 * 比较两次密码是否一致
 */
export function arePasswordsEqual(password: string, confirmPassword: string): boolean {
  return normalizePassword(password) === normalizePassword(confirmPassword)
}
