/// <reference types="@sveltejs/kit" />

/**
 * hai Admin Console - 类型声明
 */

declare global {
    namespace App {
        interface Error {
            code?: string
            message: string
        }

        interface Locals {
            /** 请求 ID */
            requestId: string
            /** 用户会话 */
            session?: {
                userId: string
                username: string
                roles: string[]
                permissions: string[]
            }
        }

        interface PageData {
            /** 用户信息 */
            user?: {
                id: string
                username: string
                roles: string[]
            }
        }

        // interface PageState {}
        // interface Platform {}
    }
}

export { }
