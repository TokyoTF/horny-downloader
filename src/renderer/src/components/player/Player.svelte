<script>
  import { onMount } from 'svelte'
  import HLS from 'hls.js'
  import 'vidstack/bundle';
  let { useEmbed, embedUrl, src, poster, title, onDuration, subtitles = [] } = $props();
  let player = $state();

  onMount(() => {
    if (!player) return

    player.addEventListener('provider-change', (event) => {
      const provider = event.detail;
      if (provider?.type === 'hls') {
        provider.library = HLS;
      }
    })

    const handleDuration = () => {
      if (onDuration && player.duration && player.duration > 0) {
        onDuration(player.duration)
      }
    }

    player.addEventListener('loaded-metadata', handleDuration)
    player.addEventListener('duration-change', handleDuration)

    return () => {
      player.removeEventListener('loaded-metadata', handleDuration)
      player.removeEventListener('duration-change', handleDuration)
    }
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
      {#each subtitles as sub}
        <track
          src={sub.url}
          kind="subtitles"
          label={sub.name}
          srclang={sub.language}
          data-type="vtt"
        />
      {/each}
      <media-poster
        class="w-full h-full object-cover"
        src={poster}
        alt={title}
      ></media-poster>
    </media-provider>
    <media-plyr-layout></media-plyr-layout>
  </media-player>
{/if}
