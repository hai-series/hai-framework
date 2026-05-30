import { mobileApiClient } from '../api.js'

type UsersPage = Extract<
  Awaited<ReturnType<typeof mobileApiClient.iam.users.list>>,
  { success: true }
>['data']

export type IamUserListItem = UsersPage['items'][number]

const PAGE_SIZE = 20

let users = $state<IamUserListItem[]>([])
let total = $state(0)
let page = $state(0)
let loading = $state(false)
let error = $state<string | null>(null)

const hasMore = $derived(users.length < total || page === 0)

function resolveResultError(result: { error?: { code?: unknown, message?: unknown } }): string {
  if (typeof result.error?.message === 'string' && result.error.message.trim())
    return result.error.message
  if (result.error?.code !== undefined)
    return String(result.error.code)
  return 'unknown'
}

async function fetchUsers(nextPage: number, append: boolean): Promise<void> {
  loading = true
  error = null
  const result = await mobileApiClient.iam.users.list({ page: nextPage, pageSize: PAGE_SIZE })
  if (!result.success) {
    error = resolveResultError(result)
    loading = false
    return
  }

  page = nextPage
  total = result.data.total
  users = append ? [...users, ...result.data.items] : result.data.items
  loading = false
}

export function currentUsers(): IamUserListItem[] {
  return users
}

export function currentUsersTotal(): number {
  return total
}

export function isUsersLoading(): boolean {
  return loading
}

export function currentUsersError(): string | null {
  return error
}

export function hasMoreUsers(): boolean {
  return hasMore
}

export async function refreshUsers(): Promise<void> {
  await fetchUsers(1, false)
}

export async function loadMoreUsers(): Promise<void> {
  if (loading || !hasMore)
    return

  await fetchUsers(page + 1, true)
}
