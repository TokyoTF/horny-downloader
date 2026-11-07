<script>
  import { SettingsIcon, XIcon, TerminalIcon } from 'lucide-svelte'
  import { notifications } from './NotificationStore'

  let {
    settings = $bindable({}),
    isDev = false,
    onClose = () => {},
    onSave = () => {},
    onClearStorage = () => {},
    onSyncExtensions = () => {}
  } = $props()
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
