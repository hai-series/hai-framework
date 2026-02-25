/// <reference types="@sveltejs/kit" />

declare namespace App {
  interface Locals {
    requestId: string
    userId?: string
  }
}
