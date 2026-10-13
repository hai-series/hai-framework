<script lang='ts'>
  import { page } from '$app/state'
  import AuthView from '$lib/components/AuthView.svelte'
</script>

<AuthView initialMode='forgot' resetToken={page.url.searchParams.get('token') ?? ''} />
