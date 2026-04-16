<script>
  import { onMount } from 'svelte'
  import HLS from 'hls.js'
  import 'vidstack/bundle';
  let { useEmbed, embedUrl, src, poster, title } = $props();
  let player = $state();

  onMount(() => {
  player.addEventListener('provider-change', (event) => {
      const provider = event.detail;
      if (provider?.type === 'hls') {
        provider.library = HLS;
      }
    })
  })
</script>

{#if useEmbed && embedUrl}
  <iframe src={embedUrl} title="player" class="w-full h-full"></iframe>
{:else}
  <media-player
    bind:this={player}
    class="w-full h-full"
    volume={0.2}
    {src}
    crossOrigin={false}
  >
    <media-provider>
      <media-poster
        class="w-full h-full object-cover"
        src={poster}
        alt={title}
      ></media-poster>
    </media-provider>
    <media-plyr-layout></media-plyr-layout>
  </media-player>
{/if}
