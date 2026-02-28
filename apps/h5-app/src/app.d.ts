/// <reference types="@sveltejs/kit" />

declare global {
  namespace App {
    interface Locals {
      requestId: string
      session?: {
        userId: string
        username: string
        displayName?: string
        avatarUrl?: string
        roles: string[]
        permissions: string[]
      } | null
    }
  }
}

export {}
