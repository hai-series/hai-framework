/// <reference types="@sveltejs/kit" />

declare global {
  namespace App {
    interface Locals {
      requestId: string
    }
  }
}

export {}
