import { base } from '$app/paths'
import { searchIndex } from '$lib/server/docs.js'
import { json } from '@sveltejs/kit'

export const prerender = true
export async function GET() {
  return json(await searchIndex(base))
}
