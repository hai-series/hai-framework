import type { HandleFetch } from '@sveltejs/kit'

export const handleFetch: HandleFetch = async ({ fetch, request }) => fetch(request)
