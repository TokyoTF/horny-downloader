<script>
  import { onMount } from 'svelte'
  import { SettingsIcon, XIcon, FolderIcon, RefreshCw, Trash2, TerminalIcon } from 'lucide-svelte'
  import { notifications } from './NotificationStore'

  let {
    settings = $bindable({}),
    isDev = false,
    availableUpdates = [],
    extensions_status = {},
    remoteExtensions = $bindable([]),
    isInstalling = false,
    onClose = () => {},
    onSave = () => {},
    onClearStorage = () => {},
    onUpdateExtension = () => {},
    onReloadExtensions = () => {},
    onFetchRemoteExtensions = () => {},
    onInstallExtension = () => {},
    onCheckForUpdates = () => {},
    onSyncExtensions = () => {}
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
      // ignore: the list is only a convenience view
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
        return 'bg-orange-500/15 text-orange-300 border-orange-500/30'
      case 'debug':
        return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
      default:
        return 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    }
  }

  function formatLogTime(time) {
    const date = new Date(time)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  onMount(loadExtensionLogs)
</script>

<div
  class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 top-10"
>
  <div
    class="bg-[#1e1e1e] w-full max-w-2xl rounded-xl border border-[#3a3a3a] shadow-2xl overflow-hidden"
  >
    <div class="border-b border-[#3a3a3a] flex items-center justify-between px-5 py-2">
      <div class="flex items-center gap-3">
        <SettingsIcon size={20} class="text-[#FF9027]" />
        <h2 class="text-lg font-semibold text-white">Settings</h2>
      </div>
      <button
        class="p-1.5 rounded-full hover:bg-[#3a3a3a] text-gray-400 hover:text-white transition-colors"
        onclick={onClose}
        title="Close settings"
      >
        <XIcon size={18} />
      </button>
    </div>

    <div class="p-6 max-h-[70vh] overflow-y-auto scroll">
      <div class="space-y-6">
        <div class="space-y-4">
          <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">
            Download Settings
          </h3>
          <div class="space-y-1.5">
            <label for="setting-ffmpeg" class="block text-sm font-medium text-gray-200">
              FFmpeg Path
              <span class="ml-1 text-xs text-gray-400 font-normal"
                >(Required for video conversion)</span
              >
            </label>
            <div class="flex gap-2">
              <input
                id="setting-ffmpeg"
                type="text"
                readonly
                bind:value={settings.ffmpeg_path}
                class="flex-1 px-3.5 py-2 bg-[#252525] border border-[#3a3a3a] rounded-lg text-sm text-white truncate"
                title={settings.ffmpeg_path}
              />
              <button
                type="button"
                onclick={async () => {
                  const result = await window.electron.ipcRenderer.invoke('open-file-dialog')
                  if (!result.canceled && result.filePaths.length > 0) {
                    settings.ffmpeg_path = result.filePaths[0]
                  }
                }}
                class="px-3 py-2 bg-[#333333] hover:bg-[#3d3d3d] text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-colors duration-200"
                title="Select FFmpeg executable"
              >
                Browse
              </button>
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="setting-download-folder" class="block text-sm font-medium text-gray-200">
              Download Folder
              <span class="ml-1 text-xs text-gray-400 font-normal"
                >(Where videos will be saved)</span
              >
            </label>
            <div class="flex gap-2">
              <input
                id="setting-download-folder"
                type="text"
                readonly
                bind:value={settings.download_folder}
                class="flex-1 px-3.5 py-2 bg-[#252525] border border-[#3a3a3a] rounded-lg text-sm text-white truncate"
                title={settings.download_folder}
              />
              <button
                type="button"
                onclick={async () => {
                  const result = await window.electron.ipcRenderer.invoke('open-directory-dialog', {
                    title: 'Select Download Folder'
                  })
                  if (!result.canceled && result.filePaths.length > 0) {
                    settings.download_folder = result.filePaths[0]
                  }
                }}
                class="px-3 py-2 bg-[#333333] hover:bg-[#3d3d3d] text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-colors duration-200"
                title="Select download folder"
              >
                Browse
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-4">
            <div class="space-y-1.5">
              <label for="setting-default-format" class="block text-sm font-medium text-gray-200">
                Default Format
              </label>
              <div class="relative">
                <select
                  id="setting-default-format"
                  class="w-full px-3.5 py-2 bg-[#252525] border border-[#3a3a3a] hover:border-[#4a4a4a] focus:border-[#FF9027] focus:ring-2 focus:ring-[#FF9027]/30 rounded-lg text-sm text-white transition-all duration-200 appearance-none cursor-pointer"
                  bind:value={settings.default_format}
                >
                  <option value="mkv">MKV (Recommended)</option>
                  <option value="mp4">MP4</option>
                  <option value="mov">MOV</option>
                </select>
                <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg
                    class="h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
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

            <div class="space-y-1.5">
              <label for="setting-name-file" class="block text-sm font-medium text-gray-200">
                Naming Convention
              </label>
              <div class="relative">
                <select
                  id="setting-name-file"
                  class="w-full px-3.5 py-2 bg-[#252525] border border-[#3a3a3a] hover:border-[#4a4a4a] focus:border-[#FF9027] focus:ring-2 focus:ring-[#FF9027]/30 rounded-lg text-sm text-white transition-all duration-200 appearance-none cursor-pointer"
                  bind:value={settings.namefile_type}
                >
                  <option value="video_title">Video Title</option>
                  <option value="site_title">Site - Title</option>
                  <option value="title_site">Title - Site</option>
                  <option value="date_title">Date - Title</option>
                  <option value="random_uuid">Random UUID</option>
                </select>
                <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg
                    class="h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
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

            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label for="setting-organize-by-site" class="text-sm font-medium text-gray-200">
                  Organize by Site
                  <span class="ml-1 text-xs text-gray-400 font-normal"
                    >Create subfolders per site</span
                  >
                </label>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="setting-organize-by-site"
                    bind:checked={settings.organize_by_site}
                    class="sr-only peer"
                  />
                  <div
                    class="w-9 h-5 bg-[#252525] border border-[#3a3a3a] rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FF9027]"
                  ></div>
                </label>
              </div>
            </div>

            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label for="setting-use-embed" class="text-sm font-medium text-gray-200">
                  Use Embedded Player
                  <span class="ml-1 text-xs text-gray-400 font-normal">(Experimental)</span>
                </label>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="setting-use-embed"
                    bind:checked={settings.use_embed}
                    class="sr-only peer"
                  />
                  <div
                    class="w-9 h-5 bg-[#252525] border border-[#3a3a3a] rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FF9027]"
                  ></div>
                </label>
              </div>
            </div>

            <div class="space-y-1.5">
              <label for="setting-threads" class="block text-sm font-medium text-gray-200">
                CPU Threads
                <span class="ml-1 text-xs text-gray-400 font-normal">(Recommended: 1)</span>
              </label>
              <div class="relative">
                <select
                  id="setting-threads"
                  class="w-full px-3.5 py-2 bg-[#252525] border border-[#3a3a3a] hover:border-[#4a4a4a] focus:border-[#FF9027] focus:ring-2 focus:ring-[#FF9027]/30 rounded-lg text-sm text-white transition-all duration-200 appearance-none cursor-pointer"
                  bind:value={settings.threads}
                >
                  <option value="1">1 Core (Balanced)</option>
                  <option value="2">2 Cores</option>
                  <option value="3">3 Cores</option>
                  <option value="4">4 Cores (Max)</option>
                </select>
                <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg
                    class="h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
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

            <div class="space-y-1.5">
              <label for="setting-concurrent" class="block text-sm font-medium text-gray-200">
                Simultaneous Downloads
                <span class="ml-1 text-xs text-gray-400 font-normal">(Recommended: 2)</span>
              </label>
              <div class="relative">
                <input
                  id="setting-concurrent"
                  type="number"
                  min="2"
                  max="5"
                  bind:value={settings.concurrent_downloads}
                  class="w-full px-3.5 py-2 bg-[#252525] border border-[#3a3a3a] hover:border-[#4a4a4a] focus:border-[#FF9027] focus:ring-2 focus:ring-[#FF9027]/30 rounded-lg text-sm text-white transition-all duration-200"
                />
              </div>
            </div>

            <div class="space-y-1.5">
              <label for="setting-custom-ffmpeg" class="block text-sm font-medium text-gray-200">
                Custom FFmpeg Params
                <span class="ml-1 text-xs text-gray-400 font-normal">(Advanced)</span>
              </label>
              <textarea
                id="setting-custom-ffmpeg"
                bind:value={settings.custom_ffmpeg_params}
                rows="2"
                class="w-full px-3.5 py-2 bg-[#252525] border border-[#3a3a3a] hover:border-[#4a4a4a] focus:border-[#FF9027] focus:ring-2 focus:ring-[#FF9027]/30 rounded-lg text-sm text-white transition-all duration-200 resize-none font-mono placeholder-gray-500"
                placeholder="e.g. -preset fast -crf 23"
              ></textarea>
              <p class="text-xs text-gray-500">FFmpeg output flags appended to every download.</p>
            </div>

            <div class="space-y-3 pt-4 border-t border-[#3a3a3a]">
              <div class="flex items-center justify-between">
                <label for="telegram-enabled" class="text-sm font-medium text-gray-200">
                  Telegram Bot
                  <span class="ml-1 text-xs text-gray-400 font-normal">Enable TelegramBot</span>
                </label>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="telegram-enabled"
                    bind:checked={settings.telegram_enabled}
                    class="sr-only peer"
                  />
                  <div
                    class="w-9 h-5 bg-[#252525] border border-[#3a3a3a] rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FF9027]"
                  ></div>
                </label>
              </div>

              {#if settings.telegram_enabled}
                <div class="space-y-1.5">
                  <label for="telegram-token" class="block text-sm font-medium text-gray-200">
                    Bot Token
                    <span class="ml-1 text-xs text-gray-400 font-normal">From @BotFather</span>
                  </label>
                  <input
                    id="telegram-token"
                    type="password"
                    bind:value={settings.telegram_token}
                    class="w-full px-3.5 py-2 bg-[#252525] border border-[#3a3a3a] hover:border-[#4a4a4a] focus:border-[#FF9027] focus:ring-2 focus:ring-[#FF9027]/30 rounded-lg text-sm text-white transition-all duration-200 placeholder-gray-500"
                    placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                  />
                </div>
              {/if}
            </div>

            {#if isDev}
              <div class="space-y-1.5 border-t border-[#3a3a3a] pt-4 mt-2">
                <h4 class="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-3">
                  Developer Settings
                </h4>
                <div class="flex items-center justify-between">
                  <label for="dev-auto-sync" class="text-sm font-medium text-gray-200">
                    Auto-sync extensions
                    <span class="ml-1 text-xs text-gray-400 font-normal block"
                      >Sync project extensions to Documents</span
                    >
                  </label>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      id="dev-auto-sync"
                      checked={settings.dev_auto_sync}
                      onchange={(e) => {
                        settings.dev_auto_sync = e.currentTarget.checked
                        if (settings.dev_auto_sync) onSyncExtensions()
                      }}
                      class="sr-only peer"
                    />
                    <div
                      class="w-9 h-5 bg-[#252525] border border-[#3a3a3a] rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"
                    ></div>
                  </label>
                </div>
              </div>
            {/if}
            <div class="space-y-1.5">
              <label for="setting-branch" class="block text-sm font-medium text-gray-200">
                Extension Branch
                <span class="ml-1 text-xs text-gray-400 font-normal">(For updates)</span>
              </label>
              <div class="relative">
                <select
                  id="setting-branch"
                  class="w-full px-3.5 py-2 bg-[#252525] border border-[#3a3a3a] hover:border-[#4a4a4a] focus:border-[#FF9027] focus:ring-2 focus:ring-[#FF9027]/30 rounded-lg text-sm text-white transition-all duration-200 appearance-none cursor-pointer"
                  bind:value={settings.extension_branch}
                  onchange={() => {
                    onCheckForUpdates()
                    remoteExtensions = []
                  }}
                >
                  <option value="main">Main (Stable)</option>
                  <option value="dev">Dev (Beta)</option>
                </select>
                <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg
                    class="h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
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

            <div class="space-y-3 pt-4 border-t border-[#3a3a3a]">
              <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Export Data
              </h4>
              <div class="flex gap-3">
                <button
                  onclick={async () => {
                    try {
                      const csv = await window.electron.ipcRenderer.invoke('export-list', {
                        format: 'csv'
                      })
                      const blob = new Blob([csv], { type: 'text/csv' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `horny-downloader-export-${new Date().toISOString().split('T')[0]}.csv`
                      a.click()
                      URL.revokeObjectURL(url)
                      notifications.success('Exported to CSV', { duration: 2000 })
                    } catch (e) {
                      notifications.error('Export failed')
                    }
                  }}
                  class="flex-1 px-4 py-2 bg-[#333333] hover:bg-[#3d3d3d] text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Export CSV
                </button>
                <button
                  onclick={async () => {
                    try {
                      const json = await window.electron.ipcRenderer.invoke('export-list', {
                        format: 'json'
                      })
                      const blob = new Blob([json], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `horny-downloader-export-${new Date().toISOString().split('T')[0]}.json`
                      a.click()
                      URL.revokeObjectURL(url)
                      notifications.success('Exported to JSON', { duration: 2000 })
                    } catch (e) {
                      notifications.error('Export failed')
                    }
                  }}
                  class="flex-1 px-4 py-2 bg-[#333333] hover:bg-[#3d3d3d] text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                  Export JSON
                </button>
              </div>
            </div>
          </div>
        </div>

        {#if availableUpdates.length > 0}
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">
                Available Updates ({availableUpdates.length})
              </h3>
            </div>
            <div class="space-y-3">
              {#each availableUpdates as update}
                <div
                  class="flex items-center justify-between p-3 bg-[#252525] rounded-lg border border-orange-500/30"
                >
                  <div class="flex items-center gap-3">
                    <div class="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                    <div>
                      <p class="text-sm font-medium text-white">
                        {update.name.replace('Extension', '')}
                      </p>
                      <p class="text-xs text-gray-400">
                        v{update.currentVersion} →
                        <span class="text-green-400">v{update.newVersion}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onclick={() => onUpdateExtension(update)}
                    class="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded transition-colors"
                  >
                    Update
                  </button>
                </div>
              {/each}
            </div>
          </div>
          <div class="w-full h-px bg-[#3a3a3a] my-4"></div>
        {/if}

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">
              Extensions Status ({Object.keys(extensions_status.loaded || {}).length} loaded, {extensions_status.total ||
                0} total)
            </h3>
            <button
              onclick={() => window.electron.ipcRenderer.send('openExtensionsFolder')}
              class="text-xs text-[#FF9027] hover:text-[#FF6B00] font-medium flex items-center gap-1.5 transition-colors px-2 py-1 rounded hover:bg-[#FF9027]/10"
              title="Open Extensions Folder"
            >
              <FolderIcon size={14} />
              Open Folder
            </button>
            <button
              onclick={onReloadExtensions}
              class="text-xs text-[#FF9027] hover:text-[#FF6B00] font-medium flex items-center gap-1.5 transition-colors px-2 py-1 rounded hover:bg-[#FF9027]/10"
              title="Reload Extensions"
            >
              <RefreshCw size={14} />
              Reload
            </button>
          </div>
          <div class="space-y-3">
            {#each Object.entries(extensions_status.loaded || {}) as [name, info]}
              <div
                class="flex items-center justify-between p-3 bg-[#252525] rounded-lg border border-[#3a3a3a]"
              >
                <div class="flex items-center gap-3">
                  <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div>
                    <p class="text-sm font-medium text-white">
                      {name.replace('Extension', '')}
                      {#if info.config?.proxy_method}
                        <span
                          class="inline-flex items-center px-1.5 py-0.5 ml-1 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          title="Downloads segments via browser to bypass Cloudflare/CDN protection"
                          >PROXY</span
                        >
                      {/if}
                    </p>
                    <p class="text-xs text-gray-400">
                      Domains: {info.domains.join(', ')}
                    </p>
                  </div>
                </div>
                <span class="text-xs text-green-400 font-medium">Loaded</span>
              </div>
            {/each}

            {#each Object.entries(extensions_status.failed || {}) as [name, info]}
              <div
                class="flex items-center justify-between p-3 bg-[#252525] rounded-lg border border-[#3a3a3a] opacity-60"
              >
                <div class="flex items-center gap-3">
                  <div class="w-2 h-2 bg-red-500 rounded-full"></div>
                  <div>
                    <p class="text-sm font-medium text-white">
                      {name.replace('Extension', '')}
                    </p>
                    <p class="text-xs text-gray-400">
                      {info.error || 'Failed to load'}
                    </p>
                  </div>
                </div>
                <span class="text-xs text-red-400 font-medium">Failed</span>
              </div>
            {/each}

            {#if Object.keys(extensions_status.loaded || {}).length === 0 && Object.keys(extensions_status.failed || {}).length === 0}
              <div class="text-center py-8 text-gray-400">
                <p class="text-sm">No extensions found</p>
              </div>
            {/if}
          </div>

          <div class="w-full h-px bg-[#3a3a3a] my-4"></div>

          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">
                Install Extensions
              </h3>
              <button
                onclick={onFetchRemoteExtensions}
                class="text-xs text-[#FF9027] hover:text-[#FF6B00] font-medium flex items-center gap-1.5 transition-colors px-2 py-1 rounded hover:bg-[#FF9027]/10"
              >
                <RefreshCw size={14} />
                Check Available
              </button>
            </div>
            {#if remoteExtensions.length > 0}
              <div class="space-y-3">
                {#each remoteExtensions as ext}
                  <div
                    class="flex items-center justify-between p-3 bg-[#252525] rounded-lg border border-[#3a3a3a]"
                  >
                    <div class="flex items-center gap-3">
                      <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <div>
                        <p class="text-sm font-medium text-white">{ext.displayName}</p>
                        <p class="text-xs text-gray-400">Not installed</p>
                      </div>
                    </div>
                    <button
                      onclick={() => onInstallExtension(ext)}
                      disabled={isInstalling}
                      class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
                    >
                      {isInstalling ? 'Installing...' : 'Install'}
                    </button>
                  </div>
                {/each}
              </div>
            {:else if remoteExtensions.length === 0}
              <div class="text-center py-4 text-gray-400">
                <p class="text-sm">No more extensions found</p>
              </div>
            {/if}
          </div>

          <div class="w-full h-px bg-[#3a3a3a] my-4"></div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium text-gray-300 uppercase tracking-wider">
                Extension Errors
                {#if extensionLogs.length > 0}
                  <span
                    class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold {extensionLogs.some(
                      (entry) => entry.level === 'error'
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
                  aria-label="Refresh extension errors"
                >
                  <RefreshCw size={14} class={loadingLogs ? 'animate-spin' : ''} />
                </button>
                <button
                  onclick={openLogsFolder}
                  class="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#333333] transition-colors"
                  title="Open log files folder"
                  aria-label="Open log files folder"
                >
                  <FolderIcon size={14} />
                </button>
                <button
                  onclick={clearExtensionLogs}
                  disabled={extensionLogs.length === 0}
                  class="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                  title="Clear list"
                  aria-label="Clear extension error list"
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
              <div class="space-y-2 max-h-56 overflow-y-auto scroll pr-1">
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
                          <span class="shrink-0 font-mono text-[10px] text-gray-500">
                            {entry.code}
                          </span>
                        {/if}
                      </div>
                      <span class="shrink-0 text-[10px] text-gray-500">
                        {formatLogTime(entry.time)}
                      </span>
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
          </div>
        </div>
      </div>
    </div>

    <div class="bg-[#252525] px-6 py-4 border-t border-[#3a3a3a] flex justify-between items-center">
      <div class="flex space-x-3">
        <button
          onclick={onClearStorage}
          class="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 bg-[#333333] hover:bg-[#3d3d3d] rounded-lg transition-colors duration-200"
        >
          Clear LocalStorage
        </button>
        <button
          onclick={() => window.electron.ipcRenderer.invoke('open-devtools')}
          class="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-[#333333] hover:bg-[#3d3d3d] rounded-lg transition-colors duration-200 flex items-center gap-2"
          title="Open DevTools"
        >
          <TerminalIcon size={14} />
          DevTools
        </button>
      </div>
      <div class="flex space-x-3">
        <button
          onclick={onClose}
          class="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-[#333333] hover:bg-[#3d3d3d] rounded-lg transition-colors duration-200"
        >
          Cancel
        </button>
        <button
          onclick={onSave}
          class="px-5 py-2 text-sm font-medium text-white bg-linear-to-r from-[#FF9027] to-[#FF6B00] hover:from-[#FF9C3F] hover:to-[#FF7B1C] rounded-lg transition-all duration-200 transform hover:scale-105 focus:ring-offset-2 focus:ring-offset-[#1e1e1e] shadow-lg hover:shadow-[#FF9027]/20"
        >
          Save Changes
        </button>
      </div>
    </div>
  </div>
</div>
