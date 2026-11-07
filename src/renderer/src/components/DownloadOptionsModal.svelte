<script>
  import { XIcon } from 'lucide-svelte'
  import { format_time } from '../lib/format'

  let {
    PlayerComponent = null,
    useEmbed = false,
    embed = '',
    video_test = '',
    thumb_video = '',
    title_video = '',
    proxy_method_video = false,
    subtitle_list = [],
    time_video = '',
    quality_list = [],
    getdata = false,
    format_video = $bindable('mkv'),
    selected_quality = $bindable(''),
    selected_subtitle = $bindable(''),
    onDuration = () => {},
    onClose = () => {},
    onStart = () => {}
  } = $props()
</script>

<div class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
  <div
    class="bg-[#1e1e1e] border border-[#3a3a3a] rounded-xl overflow-hidden w-full max-w-4xl shadow-2xl"
  >
    <div class="flex items-center justify-between p-4 border-b border-[#3a3a3a] bg-[#252525]">
      <h2 class="text-lg font-medium text-white">Download Options</h2>
      <button
        class="p-1.5 rounded-full hover:bg-[#3a3a3a] text-gray-300 hover:text-white transition-colors"
        onclick={onClose}
        aria-label="Close"
      >
        <XIcon size={20} />
      </button>
    </div>

    <div class="flex flex-row">
      <div
        class="w-full md:w-2/3 p-5 border-b md:border-b-0 md:border-r border-[#3a3a3a] bg-[#252525]/50 overflow-hidden"
      >
        <div class="aspect-video bg-black rounded-lg overflow-hidden">
          {#if PlayerComponent}
            <PlayerComponent
              {useEmbed}
              embedUrl={embed}
              src={video_test}
              poster={thumb_video}
              title={title_video}
              {onDuration}
              subtitles={subtitle_list}
            />
          {:else}
            <div class="w-full h-full flex items-center justify-center bg-black">
              <div class="animate-pulse text-gray-500">Loading player...</div>
            </div>
          {/if}
        </div>
        <div class="mt-4">
          <div class="flex items-center gap-2">
            <h3 class="text-white font-medium text-lg truncate">{title_video}</h3>
            {#if proxy_method_video}
              <span
                class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0"
                title="Downloads segments via browser to bypass Cloudflare/CDN protection"
              >
                PROXY
              </span>
            {/if}
          </div>
          <p class="text-gray-400 text-sm mt-1">Video Duration: {format_time(time_video)}</p>
        </div>
      </div>

      <div class="w-2/3 md:w-1/3 p-5">
        <div class="space-y-6">
          <div class="space-y-2">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="block text-sm font-medium text-gray-300 mb-1">Quality</label>
            <div class="relative">
              <select
                class="w-full bg-[#2d2d2d] border border-[#3a3a3a] text-white text-sm rounded-lg focus:border-[#FF9027] block p-2.5 appearance-none cursor-pointer pr-8"
                bind:value={selected_quality}
              >
                {#each quality_list as data}
                  <option value={data.url} class="bg-[#2d2d2d] text-white">
                    {#if data.quality == 'original'}
                      Original
                    {:else}
                      {!data.quality.includes('k') && !data.quality.includes('loading')
                        ? `${data.quality}p`
                        : data.quality}
                    {/if}
                  </option>
                {/each}
              </select>
              <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                <svg
                  class="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <span class="block text-sm font-medium text-gray-300 mb-1">Format</span>
            <div class="relative">
              <select
                class="w-full bg-[#2d2d2d] border border-[#3a3a3a] text-white text-sm rounded-lg focus:border-[#FF9027] block p-2.5 appearance-none cursor-pointer pr-8"
                bind:value={format_video}
              >
                <option value="mkv" class="bg-[#2d2d2d] text-white">MKV - Matroska</option>
                <option value="mp4" class="bg-[#2d2d2d] text-white">MP4 - MPEG-4</option>
                <option value="mov" class="bg-[#2d2d2d] text-white">MOV - QuickTime</option>
              </select>
              <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                <svg
                  class="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          {#if subtitle_list.length > 0}
            <div class="space-y-2">
              <span class="block text-sm font-medium text-gray-300 mb-1">Subtitle</span>
              <div class="relative">
                <select
                  class="w-full bg-[#2d2d2d] border border-[#3a3a3a] text-white text-sm rounded-lg focus:border-[#FF9027] block p-2.5 appearance-none cursor-pointer pr-8"
                  bind:value={selected_subtitle}
                >
                  <option value="" class="bg-[#2d2d2d] text-white">None</option>
                  <option value="all" class="bg-[#2d2d2d] text-white">All</option>
                  {#each subtitle_list as sub}
                    <option value={sub.url} class="bg-[#2d2d2d] text-white">
                      {sub.name} ({sub.language})
                    </option>
                  {/each}
                </select>
                <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                  <svg
                    class="w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          {/if}

          <button
            class="w-full py-3 px-4 rounded-lg font-medium text-white transition-all duration-200 flex items-center justify-center gap-2 {getdata
              ? 'bg-[#c28851] cursor-not-allowed'
              : 'bg-linear-to-r from-[#FF9027] to-[#FF6B00] hover:from-[#FF6B00] hover:to-[#FF9027] hover:shadow-lg hover:shadow-[#FF9027]/20'}"
            disabled={getdata}
            onclick={onStart}
          >
            {#if getdata}
              <div class="flex items-center">
                <svg
                  class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing...
              </div>
            {:else}
              <div class="flex items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download
              </div>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
