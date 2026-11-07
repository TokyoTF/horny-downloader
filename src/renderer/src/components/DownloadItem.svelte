<script>
  import { FolderIcon, ClipboardIcon, XIcon } from 'lucide-svelte'
  import { format_time, bytesToSize } from '../lib/format'

  let {
    item,
    viewMode = 'list',
    siteColorValue = '#242424',
    onReveal = () => {},
    onCopy = () => {},
    onRemove = () => {}
  } = $props()
</script>

<div
  class="group bg-[#1e1e1e] border border-[#2d2d2d] hover:border-[#3d3d3d] rounded-xl p-3 transition-all duration-200"
>
  <div class="flex {viewMode === 'grid' ? 'flex-col gap-3' : 'gap-4'} items-start">
    <div
      class="relative shrink-0 {viewMode === 'grid'
        ? 'w-full aspect-video'
        : 'w-32 h-20'} rounded-lg overflow-hidden bg-[#252525] border border-[#3a3a3a] group-hover:border-[#4a4a4a] transition-colors"
    >
      <img
        src={item.thumb.includes('http')
          ? item.thumb
          : 'hornydl://' + item.thumb.replace(/\\/g, '/')}
        alt={item.title}
        loading="lazy"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />

      {#if item.status == 1}
        <div class="absolute bottom-0 left-0 right-0 h-1.5 bg-[#2d2d2d] overflow-hidden">
          <div
            class="h-full bg-linear-to-r from-[#FF9027] to-[#FF6B00] transition-all duration-300"
            style={`width: ${item.load || 0}%`}
          ></div>
        </div>
      {/if}

      <div class="absolute top-2 left-2">
        {#if item.status == 0}
          <span
            class="px-2 py-0.5 bg-[#2a2a1a] text-[#ecc94b] text-[10px] font-medium rounded-full flex items-center gap-1.5"
          >
            <span class="w-1.5 h-1.5 bg-[#ecc94b] rounded-full"></span>
            Queued
          </span>
        {:else if item.status == 1}
          <span
            class="px-2 py-0.5 bg-[#1a2a2a] text-[#4fd1c5] text-[10px] font-medium rounded-full flex items-center gap-1.5"
          >
            <span class="w-1.5 h-1.5 bg-[#4fd1c5] rounded-full animate-pulse"></span>
            {item.load}%
          </span>
        {:else if item.status == 2}
          <span
            class="px-2 py-0.5 bg-[#1a2a1a] text-[#68d391] text-[10px] font-medium rounded-full flex items-center gap-1.5"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-2.5 w-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="3"
                d="M5 13l4 4L19 7"
              />
            </svg>
            Done
          </span>
        {:else if item.status == 3}
          <span
            class="px-2 py-0.5 bg-[#2a1a1a] text-[#fc8181] text-[10px] font-medium rounded-full flex items-center gap-1.5"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-2.5 w-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Failed
          </span>
        {/if}
      </div>
    </div>

    <div class="flex-1 min-w-0 w-full">
      {#if viewMode === 'grid'}
        <div class="flex items-center justify-between gap-2 mb-2">
          <span
            class="px-2 py-0.5 text-[10px] font-medium rounded-lg border border-opacity-20 shrink-0"
            style={`background-color: ${siteColorValue}10; color: ${siteColorValue}; border-color: ${siteColorValue}`}
          >
            {item.site}
          </span>
          <div class="flex items-center gap-1 shrink-0">
            {#if (item.status == 1 && item.load == null) || item.status == 2 || item.status == 3}
              <button
                class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
                title="Open file location"
                onclick={() => onReveal(item)}
              >
                <FolderIcon color="white" size="16" />
              </button>
              <button
                class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
                title="Copy URL"
                onclick={() => onCopy(item.url)}
              >
                <ClipboardIcon color="white" size="16" />
              </button>
            {/if}

            <button
              class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
              onclick={() => onRemove(item)}
              title="Remove from list"
            >
              <XIcon color="white" size={16} />
            </button>
          </div>
        </div>

        <h3
          class="text-sm font-medium text-white group-hover:text-[#FF9027] transition-colors line-clamp-2 mb-1.5"
          title={item.title}
        >
          {item.title}
        </h3>

        <div class="flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
          {#if item.duration}
            <span class="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3 opacity-70"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {format_time(item.duration, true)}
            </span>
          {/if}

          {#if item.quality}
            <span class="text-gray-500">•</span>
            <span class="px-1.5 py-0.5 bg-[#252525] rounded text-[10px] font-mono text-gray-300">
              {#if item.quality == 'original'}
                Original
              {:else}
                {!item.quality.includes('k') ? `${item.quality}p` : item.quality}
              {/if}
            </span>
          {/if}

          {#if item.format}
            <span class="text-gray-500">•</span>
            <span>{item.format}</span>
          {/if}

          {#if item.filesize}
            <span class="text-gray-500">•</span>
            <span>{bytesToSize(item.filesize)}</span>
          {/if}
        </div>
      {:else}
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <h3
              class="text-sm font-medium text-white group-hover:text-[#FF9027] transition-colors line-clamp-2"
              title={item.title}
            >
              {item.title}
            </h3>

            <div class="flex flex-wrap items-center gap-2 mt-1.5">
              <span
                class="px-2 py-0.5 text-[10px] font-medium rounded-full border border-opacity-20"
                style={`background-color: ${siteColorValue}10; color: ${siteColorValue}; border-color: ${siteColorValue}`}
              >
                {item.site}
              </span>

              <div class="flex items-center gap-1.5 text-xs text-gray-400">
                {#if item.duration}
                  <span class="flex items-center gap-1">
                    duration:
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3 w-3 opacity-70"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {format_time(item.duration, true)}
                  </span>
                {/if}

                {#if item.quality}
                  <span class="text-gray-500">•</span>
                  quality:
                  <span
                    class="px-1.5 py-0.5 bg-[#252525] rounded text-[10px] font-mono text-gray-300"
                  >
                    {#if item.quality == 'original'}
                      Original
                    {:else}
                      {!item.quality.includes('k') ? `${item.quality}p` : item.quality}
                    {/if}
                  </span>
                {/if}

                {#if item.format}
                  <span class="text-gray-500">•</span>
                  <span class="text-gray-400">format: {item.format}</span>
                {/if}

                {#if item.filesize}
                  <span class="text-gray-500">•</span>
                  <span class="text-gray-400">size: {bytesToSize(item.filesize)}</span>
                {/if}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1">
            {#if (item.status == 1 && item.load == null) || item.status == 2 || item.status == 3}
              <button
                class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
                title="Open file location"
                onclick={() => onReveal(item)}
              >
                <FolderIcon color="white" size="18" />
              </button>
              <button
                class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
                title="Open file location"
                onclick={() => onCopy(item.url)}
              >
                <ClipboardIcon color="white" size="18" />
              </button>
            {/if}

            <button
              class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
              onclick={() => onRemove(item)}
              title="Remove from list"
            >
              <XIcon color="white" size={18} />
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
