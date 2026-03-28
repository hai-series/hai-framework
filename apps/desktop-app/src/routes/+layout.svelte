<script lang='ts'>
  import '../app.css'

  const { children } = $props()
</script>

<div class='min-h-screen'>
  {@render children()}
</div>
