<script>
  import { onMount } from 'svelte'
  import '@videojs/html/video/player'
  import '@videojs/html/video/neutral-skin'
  import '@videojs/html/media/hlsjs-video'
  import '@videojs/html/media/dash-video'

  let { useEmbed, embedUrl, src, poster, title, onDuration, subtitles = [] } = $props()

  let player = $state()

  const mediaSrc = $derived(typeof src === 'string' ? src : (src?.src ?? ''))
  const mediaType = $derived(typeof src === 'object' && src ? src.type : undefined)
  const sourceKind = $derived(resolveSourceKind(mediaSrc, mediaType))
  const hlsSource = $derived(mediaType ? { src: mediaSrc, type: mediaType } : { src: mediaSrc })
  const initialVolume = 0.2

  // <track> loads cross-origin .vtt files in CORS mode and many CDNs do not send
  // Access-Control-Allow-Origin, which logs "Unsafe attempt to load URL".
  // Fetching the text through the main process and exposing it as a blob URL
  // (same-origin) avoids the CORS check entirely.
  let resolvedSubtitles = $state([])

  $effect(() => {
    const subs = Array.isArray(subtitles) ? subtitles : []
    let cancelled = false
    const blobUrls = []

    if (subs.length === 0) {
      resolvedSubtitles = []
      return
    }

    Promise.all(
      subs.map(async (sub) => {
        try {
          const text = await window.electron.ipcRenderer.invoke('fetch-proxy-text', sub.url)
          const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }))
          blobUrls.push(blobUrl)
          return { ...sub, url: blobUrl }
        } catch {
          return sub
        }
      })
    ).then((list) => {
      if (!cancelled) resolvedSubtitles = list
    })

    return () => {
      cancelled = true
      for (const blobUrl of blobUrls) URL.revokeObjectURL(blobUrl)
    }
  })

  function resolveSourceKind(url, type) {
    const mime = String(type || '').toLowerCase()
    if (mime.includes('dash')) return 'dash'
    if (mime.includes('mpegurl')) return 'hls'
    if (mime) return 'native'

    const value = String(url || '').toLowerCase()
    const path = value.split(/[?#]/)[0]
    if (path.endsWith('.mpd')) return 'dash'
    if (path.endsWith('.m3u8')) return 'hls'
    if (value.startsWith('data:application/vnd.apple.mpegurl')) return 'hls'

    // Extensions default `force_type` to HLS, so an untyped source is HLS.
    return 'hls'
  }

  onMount(() => {
    if (!player?.store) return

    let lastDuration = -1
    let volumeApplied = false

    const sync = () => {
      if (!volumeApplied && player.store.volumeAvailability === 'available') {
        volumeApplied = true
        player.store.setVolume(initialVolume)
      }

      const duration = player.store.duration
      if (onDuration && Number.isFinite(duration) && duration > 0 && duration !== lastDuration) {
        lastDuration = duration
        onDuration(duration)
      }
    }

    const unsubscribe = player.store.subscribe(sync)
    sync()

    return unsubscribe
  })
</script>

{#snippet textTracks()}
  {#each resolvedSubtitles as sub, index (sub.url ?? index)}
    <track src={sub.url} kind="subtitles" label={sub.name} srclang={sub.language} />
  {/each}
{/snippet}

{#if useEmbed && embedUrl}
  <iframe src={embedUrl} title="player" class="w-full h-full"></iframe>
{:else if mediaSrc}
  <video-player
    bind:this={player}
    class="player"
    content-title={title || undefined}
    poster={poster || undefined}
  >
    <video-neutral-skin class="player-skin">
      {#if sourceKind === 'hls'}
        <hlsjs-video source={hlsSource} playsinline>
          {@render textTracks()}
        </hlsjs-video>
      {:else if sourceKind === 'dash'}
        <dash-video src={mediaSrc} playsinline>
          {@render textTracks()}
        </dash-video>
      {:else}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={mediaSrc} playsinline>
          {@render textTracks()}
        </video>
      {/if}
    </video-neutral-skin>
  </video-player>
{/if}

<style>
  .player {
    display: contents;
  }

  .player-skin {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
