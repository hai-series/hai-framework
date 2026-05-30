import { browser } from '$app/environment'
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'

export function navigateToLogin(): void {
  if (!browser)
    return

  void goto(resolve('/auth/login', {}))
}
