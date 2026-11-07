<script>
  import {
    LayoutGrid,
    XIcon,
    FolderIcon,
    RefreshCw,
    Trash2,
    Download,
    CircleCheckBig,
    AlertTriangle,
    ChevronDown
  } from 'lucide-svelte'
  import { notifications } from './NotificationStore'

  let {
    settings = $bindable({}),
    isDev = false,
    availableUpdates = [],
    extensions_status = {},
    remoteExtensions = $bindable([]),
    installingExt = null,
    onClose = () => {},
    onUpdateExtension = () => {},
    onUpdateAll = () => {},
    onReloadExtensions = () => {},
    onFetchRemoteExtensions = () => {},
    onInstallExtension = () => {},
    onCheckForUpdates = () => {}
  } = $props()

  let extensionLogs = $state([])
  let loadingLogs = $state(false)

  async function loadExtensionLogs() {
    if (loadingLogs) return
    loadingLogs = true
    try {
      const logs = await window.electron.ipcRenderer.invoke('get-extension-logs', {
        limit: 40,
        level: 'warn'
      })
      extensionLogs = Array.isArray(logs) ? logs : []
    } catch {
      extensionLogs = []
    } finally {
      loadingLogs = false
    }
  }

  async function clearExtensionLogs() {
    try {
      await window.electron.ipcRenderer.invoke('clear-extension-logs')
      extensionLogs = []
    } catch {
      // ignore
    }
  }

  function openLogsFolder() {
    window.electron.ipcRenderer.send('openExtensionLogs')
  }

  function logLevelClass(level) {
    switch (level) {
      case 'error':
        return 'bg-red-500/15 text-red-300 border-red-500/30'
      case 'warn':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      default:
        return 'bg-[#333333] text-gray-400 border-[#3a3a3a]'
    }
  }

  function formatLogTime(t) {
    try {
      return new Date(t).toLocaleString()
    } catch {
      return String(t || '')
    }
  }

  const loadedCount = $derived(Object.keys(extensions_status.loaded || {}).length)
  const failedCount = $derived(Object.keys(extensions_status.failed || {}).length)

  $effect(() => {
    // Load the error log once when the modal opens
    loadExtensionLogs()
  })
</script>

<div
  class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 top-10"
  onclick={onClose}
>
  <div
    class="bg-[#1e1e1e] w-full max-w-2xl rounded-xl border border-[#3a3a3a] shadow-2xl overflow-hidden"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="border-b border-[#3a3a3a] flex items-center justify-between px-5 py-3">
      <div class="flex items-center gap-3">
        <LayoutGrid size={20} class="text-[#FF9027]" />
        <h2 class="text-lg font-semibold text-white">Extensions</h2>
        <span class="text-xs text-gray-500">
          {loadedCount} loaded{failedCount ? `, ${failedCount} failed` : ''}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <div class="relative">
          <select
            class="appearance-none bg-[#252525] border border-[#3a3a3a] hover:border-[#4a4a4a] focus:border-[#FF9027] rounded-lg pl-3 pr-8 py-1.5 text-xs font-medium text-gray-200 transition-all cursor-pointer outline-none"
            bind:value={settings.extension_branch}
            onchange={() => {
              onCheckForUpdates()
              remoteExtensions = []
              onFetchRemoteExtensions()
            }}
            title="Branch used for extension updates and installs"
          >
            <option value="main">Main (Stable)</option>
            <option value="dev">Dev (Beta)</option>
          </select>
          <div class="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <ChevronDown size={14} class="text-gray-400" />
          </div>
        </div>
        <button
          class="p-1.5 rounded-full hover:bg-[#3a3a3a] text-gray-400 hover:text-white transition-colors"
          onclick={onClose}
          title="Close"
        >
          <XIcon size={18} />
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="p-6 max-h-[70vh] overflow-y-auto scroll space-y-6">
      <!-- Available updates -->
      {#if availableUpdates.length > 0}
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <h3
              class="text-sm font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-2"
            >
              <AlertTriangle size={14} />
              Updates ({availableUpdates.length})
            </h3>
            <button
              onclick={onUpdateAll}
              class="text-xs text-[#FF9027] hover:text-[#FF6B00] font-medium px-2 py-1 rounded hover:bg-[#FF9027]/10 transition-colors"
            >
              Update all
            </button>
          </div>
          <div class="space-y-2">
            {#each availableUpdates as update (update.name)}
              <div
                class="flex items-center justify-between p-3 bg-[#252525] rounded-lg border border-orange-500/30"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-2 h-2 bg-orange-500 rounded-full animate-pulse shrink-0"></div>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-white truncate">
                      {update.name.replace('Extension', '')}
                    </p>
                    <p class="text-xs text-gray-400">
                      v{update.currentVersion} →
                      <span class="text-green-400 font-medium">v{update.newVersion}</span>
                    </p>
                  </div>
                </div>
                <button
                  onclick={() => onUpdateExtension(update)}
                  class="shrink-0 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded transition-colors"
                >
                  Update
                </button>
              </div>
            {/each}
          </div>
        </section>
      {/if}
      <!-- Available to install -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Available to install
          </h3>
          <button
            onclick={onFetchRemoteExtensions}
            class="text-xs text-[#FF9027] hover:text-[#FF6B00] font-medium flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#FF9027]/10 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
        {#if remoteExtensions.length > 0}
          <div class="space-y-2">
            {#each remoteExtensions as ext (ext.name)}
              <div
                class="flex items-center justify-between p-3 bg-[#252525] rounded-lg border border-[#3a3a3a] hover:border-[#4a4a4a] transition-colors"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-2 h-2 bg-blue-500 rounded-full shrink-0"></div>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-white truncate">{ext.displayName}</p>
                    <p class="text-xs text-gray-400">Not installed</p>
                  </div>
                </div>
                <button
                  onclick={() => onInstallExtension(ext)}
                  disabled={!!installingExt}
                  class="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5"
                >
                  {#if installingExt === ext.name}
                    <RefreshCw size={12} class="animate-spin" />
                    Installing...
                  {:else}
                    <Download size={12} />
                    Install
                  {/if}
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-center text-sm text-gray-500 py-4">
            All available extensions are installed 🎉
          </p>
        {/if}
      </section>
      <!-- Installed -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Installed ({loadedCount + failedCount})
          </h3>
          <div class="flex items-center gap-1">
            <button
              onclick={onReloadExtensions}
              class="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#333333] transition-colors"
              title="Reload extensions"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onclick={() => window.electron.ipcRenderer.send('openExtensionsFolder')}
              class="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#333333] transition-colors"
              title="Open extensions folder"
            >
              <FolderIcon size={14} />
            </button>
          </div>
        </div>
        <div class="space-y-2">
          {#each Object.entries(extensions_status.loaded || {}) as [name, info] (name)}
            <div
              class="flex items-center justify-between p-3 bg-[#252525] rounded-lg border border-[#3a3a3a]"
            >
              <div class="flex items-center gap-3 min-w-0">
                <CircleCheckBig size={16} class="text-green-500 shrink-0" />
                <div class="min-w-0">
                  <p class="text-sm font-medium text-white flex items-center">
                    {name.replace('Extension', '')}
                    {#if info.config?.proxy_method}
                      <span
                        class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        title="Downloads via browser to bypass CDN protection">PROXY</span
                      >
                    {/if}
                  </p>
                  <p class="text-xs text-gray-400 truncate">
                    Domains: {info.domains.join(', ')}
                  </p>
                </div>
              </div>
              <span class="text-xs text-green-400 font-medium shrink-0">Loaded</span>
            </div>
          {/each}

          {#each Object.entries(extensions_status.failed || {}) as [name, info] (name)}
            <div
              class="flex items-center justify-between p-3 bg-[#252525] rounded-lg border border-red-500/30 opacity-70"
            >
              <div class="flex items-center gap-3 min-w-0">
                <AlertTriangle size={16} class="text-red-500 shrink-0" />
                <div class="min-w-0">
                  <p class="text-sm font-medium text-white">{name.replace('Extension', '')}</p>
                  <p class="text-xs text-gray-400 truncate">{info.error || 'Failed to load'}</p>
                </div>
              </div>
              <span class="text-xs text-red-400 font-medium shrink-0">Failed</span>
            </div>
          {/each}

          {#if loadedCount + failedCount === 0}
            <p class="text-center text-sm text-gray-500 py-6">No extensions installed</p>
          {/if}
        </div>
      </section>

      

      <!-- Errors -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h3
            class="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2"
          >
            Extension errors
            {#if extensionLogs.length > 0}
              <span
                class="px-1.5 py-0.5 rounded-full text-[10px] font-semibold {extensionLogs.some(
                  (e) => e.level === 'error'
                )
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-[#333333] text-gray-400'}"
              >
                {extensionLogs.length}
              </span>
            {/if}
          </h3>
          <div class="flex items-center gap-1">
            <button
              onclick={loadExtensionLogs}
              disabled={loadingLogs}
              class="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#333333] disabled:opacity-40 transition-colors"
              title="Refresh errors"
            >
              <RefreshCw size={14} class={loadingLogs ? 'animate-spin' : ''} />
            </button>
            <button
              onclick={openLogsFolder}
              class="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#333333] transition-colors"
              title="Open log files folder"
            >
              <FolderIcon size={14} />
            </button>
            <button
              onclick={clearExtensionLogs}
              disabled={extensionLogs.length === 0}
              class="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
              title="Clear list"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {#if extensionLogs.length === 0}
          <p class="text-xs text-gray-500">
            No recent extension warnings or errors. Extensions can report problems with
            <code class="text-gray-400">log('error', 'message')</code>.
          </p>
        {:else}
          <div class="space-y-2 max-h-48 overflow-y-auto scroll pr-1">
            {#each extensionLogs as entry (entry.id)}
              <div class="p-2.5 rounded-lg bg-[#252525] border border-[#3a3a3a]">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase {logLevelClass(
                        entry.level
                      )}"
                    >
                      {entry.level}
                    </span>
                    <span class="truncate text-xs font-medium text-white">
                      {entry.extension || 'Extension'}
                    </span>
                    {#if entry.code}
                      <span class="shrink-0 font-mono text-[10px] text-gray-500">{entry.code}</span>
                    {/if}
                  </div>
                  <span class="shrink-0 text-[10px] text-gray-500">{formatLogTime(entry.time)}</span
                  >
                </div>
                <p class="mt-1 text-xs text-gray-300 break-words">{entry.message}</p>
                {#if entry.url}
                  <p class="mt-0.5 truncate text-[10px] text-gray-500" title={entry.url}>
                    {entry.url}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <!-- Footer -->
    <div class="bg-[#252525] px-6 py-3 border-t border-[#3a3a3a] flex justify-end">
      <button
        onclick={onClose}
        class="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-[#333333] hover:bg-[#3d3d3d] rounded-lg transition-colors"
      >
        Close
      </button>
    </div>
  </div>
</div>
