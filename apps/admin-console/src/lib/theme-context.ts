import { createContext } from 'svelte'

interface AdminTheme {
  readonly current: string
  select: (theme: string) => void
}

export const [getAdminTheme, setAdminTheme] = createContext<AdminTheme>()
