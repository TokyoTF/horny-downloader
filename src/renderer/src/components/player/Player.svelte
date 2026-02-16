<script>
  import 'vidstack/bundle';
  let { useEmbed, embedUrl, src, poster, title } = $props();
</script>

{#if useEmbed && embedUrl}
  <iframe src={embedUrl} title="player" class="w-full h-full"></iframe>
{:else}
  <media-player
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
