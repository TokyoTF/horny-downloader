<script>
  import { XIcon, Film, ListPlus, RefreshCw } from 'lucide-svelte'
  import { format_time, formatQualityLabel } from '../lib/format'
  import { batchStatusClass, batchStatusLabel } from '../lib/batch'

  let {
    batchItems = [],
    batchPreview = null,
    batchPreviewItem = null,
    batchPreviewUrl = '',
    batchPreviewTitle = '',
    batchPreviewSource = '',
    batchPreviewLoading = false,
    batchResolvedCount = 0,
    batchFailedCount = 0,
    batchResolving = false,
    batchProcessCount = 0,
    batchSubtitleLanguages = [],
    batchQuality = $bindable('max'),
    batchFormat = $bindable('mkv'),
    batchSubtitleMode = $bindable('none'),
    batchSubtitleLanguage = $bindable(''),
    batchDelay = $bindable(0),
    batchSkipCount = $bindable(0),
    PlayerComponent = null,
    useEmbed = false,
    onResolve = () => {},
    onSelect = () => {},
    onRemove = () => {},
    onExpand = () => {},
    onStart = () => {},
    onClose = () => {}
  } = $props()
</script>

<div
  class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-99999 p-4"
>
  <div
    class="bg-[#1e1e1e] border border-[#3a3a3a] rounded-xl overflow-hidden w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl"
  >
    <div
      class="flex items-center justify-between p-4 border-b border-[#3a3a3a] bg-[#252525] shrink-0"
    >
      <div class="flex items-center gap-3 min-w-0">
        <h2 class="text-lg font-medium text-white">Batch Import</h2>
        <span class="text-xs text-gray-400 truncate">
          {batchItems.length} links · {batchProcessCount} to process
        </span>
      </div>
      <button
        class="p-1.5 rounded-full hover:bg-[#3a3a3a] text-gray-300 hover:text-white transition-colors"
        onclick={() => onClose()}
        aria-label="Close batch import"
      >
        <XIcon size={20} />
      </button>
    </div>

    <div class="flex flex-col md:flex-row flex-1 min-h-0">
      <div
        class="w-full md:w-2/3 p-5 border-b md:border-b-0 md:border-r border-[#3a3a3a] bg-[#252525]/50 overflow-y-auto scroll min-h-0 scroll"
      >
        <div class="aspect-video bg-black rounded-lg overflow-hidden">
          {#if batchPreviewLoading && !batchPreview}
            <div class="w-full h-full flex flex-col items-center justify-center gap-3">
              <svg
                class="animate-spin h-7 w-7 text-[#FF9027]"
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                ></path>
              </svg>
              <span class="text-xs text-gray-400">Loading first link preview...</span>
            </div>
          {:else if batchPreview?.is_batch}
            <div
              class="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-6"
            >
              <Film size={26} class="text-violet-300" />
              <p class="text-sm font-medium text-white">Album detected</p>
              <p class="text-xs text-gray-400">
                This link contains {batchPreview.batch_urls?.length || 0} videos. Expand it from the list
                to import each one.
              </p>
            </div>
          {:else if PlayerComponent && (batchPreviewSource || (useEmbed && batchPreview?.embed))}
            <PlayerComponent
              {useEmbed}
              embedUrl={batchPreview?.embed || ''}
              src={batchPreviewSource}
              poster={batchPreview?.thumb || batchPreviewItem?.thumb || ''}
              title={batchPreviewTitle}
              subtitles={batchPreview?.subtitles || []}
            />
          {:else if batchPreview?.thumb || batchPreviewItem?.thumb}
            <img
              src={batchPreview?.thumb || batchPreviewItem?.thumb}
              alt={batchPreviewTitle}
              class="w-full h-full object-cover"
            />
          {:else}
            <div class="w-full h-full flex flex-col items-center justify-center gap-2">
              <Film size={26} class="text-gray-600" />
              <p class="text-xs text-gray-500">No preview available for this link</p>
            </div>
          {/if}
        </div>

        <div class="mt-4">
          <div class="flex items-center gap-2 min-w-0">
            <h3 class="text-white font-medium text-lg truncate" title={batchPreviewTitle}>
              {batchPreviewTitle}
            </h3>
            {#if batchPreview?.proxy_method}
              <span
                class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0"
                title="Uses local proxy to bypass Cloudflare/CDN protection"
              >
                PROXY
              </span>
            {/if}
          </div>

          <div class="flex items-center gap-2 flex-wrap text-xs text-gray-400 mt-1">
            {#if batchPreviewItem?.site || batchPreview?.site}
              <span>{batchPreviewItem?.site || batchPreview?.site}</span>
              <span class="text-gray-600">·</span>
            {/if}
            <span>
              Video Duration: {format_time(batchPreviewItem?.duration || batchPreview?.time)}
            </span>
            {#if batchPreviewItem?.quality}
              <span class="text-gray-600">·</span>
              <span>{formatQualityLabel(batchPreviewItem.quality)}</span>
            {/if}
          </div>

          {#if batchPreviewItem?.isAlbum}
            <div
              class="mt-3 flex items-center justify-between gap-2 p-2 rounded-lg bg-violet-500/10 border border-violet-500/20"
            >
              <p class="text-xs text-violet-200">
                Album with {batchPreviewItem.albumCount} links
              </p>
              <button
                type="button"
                onclick={() => onExpand(batchItems.indexOf(batchPreviewItem))}
                class="shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium bg-violet-500/20 text-violet-100 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
              >
                Expand album
              </button>
            </div>
          {/if}

          {#if batchPreviewItem?.error}
            <p class="mt-2 text-[11px] text-red-400 break-words">{batchPreviewItem.error}</p>
          {/if}
        </div>

        <div class="mt-5 pt-4 border-t border-[#3a3a3a]">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-white">Name · Link list</h4>
              <p class="text-[11px] text-gray-500 truncate">
                {batchResolvedCount}/{batchItems.length} names resolved
                {#if batchResolving}· resolving...{/if}
              </p>
            </div>
            <button
              type="button"
              onclick={() => onResolve()}
              disabled={batchResolving || batchResolvedCount === batchItems.length}
              class="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#3a3a3a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Retry unresolved names"
              aria-label="Retry unresolved names"
            >
              <RefreshCw size={14} class={batchResolving ? 'animate-spin' : ''} />
            </button>
          </div>

          <div
            class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[248px] overflow-y-auto scroll pr-1"
          >
            {#each batchItems as item, index (item.url)}
              <div
                class="group relative rounded-lg border overflow-hidden transition-colors {item.url ===
                batchPreviewUrl
                  ? 'border-orange-500/60 bg-orange-500/5'
                  : 'border-[#3a3a3a] bg-[#232323] hover:border-[#4d4d4d]'}"
              >
                <button
                  type="button"
                  class="block w-full text-left"
                  onclick={() => onSelect(index)}
                  title="Preview this link"
                >
                  <div
                    class="relative aspect-video bg-[#1B1B1B] flex items-center justify-center overflow-hidden"
                  >
                    {#if item.thumb}
                      <img
                        src={item.thumb}
                        alt=""
                        class="w-full h-full object-cover"
                        loading="lazy"
                      />
                    {:else}
                      <Film size={16} class="text-gray-600" />
                    {/if}
                    <span
                      class="absolute left-1 top-1 min-w-[15px] h-[15px] px-1 inline-flex items-center justify-center rounded bg-black/70 backdrop-blur-sm text-[9px] font-semibold text-white leading-none"
                    >
                      {index + 1}
                    </span>
                    {#if item.status !== 'ready' && item.status !== 'pending'}
                      <span
                        class="absolute left-1 bottom-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none {batchStatusClass(
                          item
                        )}"
                      >
                        {batchStatusLabel(item)}
                      </span>
                    {/if}
                  </div>
                  <div class="px-1.5 py-1">
                    <p
                      class="truncate text-[11px] font-medium leading-tight {item.status ===
                      'failed'
                        ? 'text-red-300'
                        : 'text-white'}"
                      title={item.error ? `${item.title}\n${item.error}` : item.title}
                    >
                      {item.title}
                    </p>
                    <p
                      class="truncate text-[9px] leading-tight mt-0.5 {item.status === 'failed' &&
                      item.error
                        ? 'text-red-400/80'
                        : 'text-gray-500'}"
                      title={item.error ? `${item.url}\n${item.error}` : item.url}
                    >
                      {item.status === 'failed' && item.error ? item.error : item.url}
                    </p>
                  </div>
                </button>

                <div class="absolute right-1 top-1 flex items-center gap-0.5">
                  {#if item.isAlbum}
                    <button
                      type="button"
                      onclick={() => onExpand(index)}
                      class="p-1 rounded bg-black/70 backdrop-blur-sm text-violet-300 hover:bg-violet-500/40 transition-colors"
                      title="Expand album into individual links"
                      aria-label="Expand album into individual links"
                    >
                      <ListPlus size={12} />
                    </button>
                  {/if}

                  <button
                    type="button"
                    onclick={() => onRemove(index)}
                    class="p-1 rounded bg-black/70 backdrop-blur-sm text-gray-300 hover:text-red-300 hover:bg-red-500/40 transition-colors"
                    title="Remove link"
                    aria-label="Remove link"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              </div>
            {/each}
          </div>

          {#if batchFailedCount > 0}
            <div class="mt-2 flex items-center justify-between gap-2">
              <p class="text-[11px] text-red-400">
                {batchFailedCount} name(s) could not be resolved. They can still be imported.
              </p>
              <button
                type="button"
                onclick={() => onResolve({ onlyFailed: true })}
                disabled={batchResolving}
                class="shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
              >
                Retry
              </button>
            </div>
          {/if}
        </div>
      </div>

      <div class="w-full md:w-1/3 p-5 overflow-y-auto scroll scroll min-h-0">
        <div class="space-y-5">
          <div class="space-y-2">
            <label for="batch-quality" class="block text-sm font-medium text-gray-300 mb-1"
              >Quality</label
            >
            <div class="relative">
              <select
                id="batch-quality"
                class="w-full bg-[#2d2d2d] border border-[#3a3a3a] text-white text-sm rounded-lg focus:border-[#FF9027] block p-2.5 appearance-none cursor-pointer pr-8"
                bind:value={batchQuality}
              >
                <option value="max" class="bg-[#2d2d2d] text-white">Best available</option>
                <option value="medium" class="bg-[#2d2d2d] text-white">Balanced</option>
                <option value="low" class="bg-[#2d2d2d] text-white">Lowest</option>
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
            <label for="batch-format" class="block text-sm font-medium text-gray-300 mb-1"
              >Format</label
            >
            <div class="relative">
              <select
                id="batch-format"
                class="w-full bg-[#2d2d2d] border border-[#3a3a3a] text-white text-sm rounded-lg focus:border-[#FF9027] block p-2.5 appearance-none cursor-pointer pr-8"
                bind:value={batchFormat}
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

          <div class="space-y-2">
            <label for="batch-subtitles" class="block text-sm font-medium text-gray-300 mb-1"
              >Subtitle</label
            >
            <div class="relative">
              <select
                id="batch-subtitles"
                class="w-full bg-[#2d2d2d] border border-[#3a3a3a] text-white text-sm rounded-lg focus:border-[#FF9027] block p-2.5 appearance-none cursor-pointer pr-8"
                bind:value={batchSubtitleMode}
              >
                <option value="none" class="bg-[#2d2d2d] text-white">None</option>
                <option value="all" class="bg-[#2d2d2d] text-white">All available</option>
                <option value="first" class="bg-[#2d2d2d] text-white">First available</option>
                <option value="language" class="bg-[#2d2d2d] text-white">Specific language</option>
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

          {#if batchSubtitleMode === 'language'}
            <div class="space-y-2">
              <label
                for="batch-subtitle-language"
                class="block text-sm font-medium text-gray-300 mb-1">Subtitle language</label
              >
              <input
                type="text"
                id="batch-subtitle-language"
                bind:value={batchSubtitleLanguage}
                list="batch-subtitle-languages"
                class="w-full bg-[#2d2d2d] border border-[#3a3a3a] text-white text-sm rounded-lg focus:border-[#FF9027] block p-2.5 outline-none placeholder-gray-500"
                placeholder="e.g. en, es, spanish"
              />
              {#if batchSubtitleLanguages.length > 0}
                <datalist id="batch-subtitle-languages">
                  {#each batchSubtitleLanguages as language}
                    <option value={language}></option>
                  {/each}
                </datalist>
              {/if}
            </div>
          {/if}

          <div class="space-y-2">
            <label for="batch-delay" class="block text-sm font-medium text-gray-300 mb-1"
              >Delay between links (ms)</label
            >
            <input
              type="number"
              id="batch-delay"
              bind:value={batchDelay}
              min="0"
              step="100"
              class="w-full bg-[#2d2d2d] border border-[#3a3a3a] text-white text-sm rounded-lg focus:border-[#FF9027] block p-2.5 outline-none placeholder-gray-500"
              placeholder="0"
            />
            <p class="text-xs text-gray-500">Useful to avoid rate limits.</p>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <label for="batch-skip" class="block text-sm font-medium text-gray-300 mb-1"
                >Skip first N links</label
              >
              <span class="text-[10px] text-gray-500">
                {batchProcessCount} of {batchItems.length}
              </span>
            </div>
            <input
              type="number"
              id="batch-skip"
              bind:value={batchSkipCount}
              min="0"
              max={Math.max(0, batchItems.length - 1)}
              class="w-full bg-[#2d2d2d] border border-[#3a3a3a] text-white text-sm rounded-lg focus:border-[#FF9027] block p-2.5 outline-none placeholder-gray-500"
              placeholder="0"
            />
            <p class="text-xs text-gray-500">
              Skip the first {batchSkipCount} links and import {batchProcessCount}.
            </p>
          </div>

          <p class="text-[11px] text-gray-500 leading-relaxed">
            Links are processed in order. The names resolved in the left list are used as file
            names.
          </p>

          <div class="space-y-2">
            <button
              class="w-full py-3 px-4 rounded-lg font-medium text-white transition-all duration-200 flex items-center justify-center gap-2 bg-linear-to-r from-[#FF9027] to-[#FF6B00] hover:from-[#FF6B00] hover:to-[#FF9027] hover:shadow-lg hover:shadow-[#FF9027]/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
              disabled={batchProcessCount === 0}
              onclick={onStart}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
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
              Start Import ({batchProcessCount})
            </button>
            <button
              class="w-full py-2 px-4 rounded-lg font-medium text-gray-300 bg-[#3d3d3d] hover:bg-[#4d4d4d] transition-colors duration-200"
              onclick={() => onClose()}
            >
              Cancel
            </button>
          </div>

          {#if batchResolving}
            <p class="text-[11px] text-sky-400">Resolving link names in the background...</p>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
