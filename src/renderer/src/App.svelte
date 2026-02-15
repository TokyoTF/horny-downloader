<script>
  import UpdateNotification from './components/UpdateNotification.svelte'
  import { updateBanner, showUpdateBanner } from './components/store'
  import Player from './components/player/Player.svelte'
  import { onMount } from 'svelte'
  import NotificationToast from './components/NotificationToast.svelte'
  import { notifications } from './components/NotificationStore'
  import {
    ClipboardIcon,
    FolderIcon,
    XIcon,
    MinusIcon,
    SquareIcon,
    SettingsIcon,
    TriangleAlertIcon,
    SearchIcon,
    LayoutGrid,
    List,
    ArrowDownWideNarrow,
    ArrowUpNarrowWide,
    FileText,
    RefreshCw
  } from 'lucide-svelte'

  import LogoIcon from './assets/logo.png'

  let url = $state('')
  let appVersion = $state('')
  let locallist = $state([])
  let getdata = $state(true)
  let video_test = $state('')
  let embed = $state('')
  let sel_site = $state('auto')
  let quality_list = $state([{ url: '', quality: 'loading', size: '' }])
  let format_video = $state('mkv')
  let time_video = $state('')
  let thumb_video = $state('')
  let title_video = $state('')
  let selected_quality = $state('')
  let site_video = ''
  let url_video = $state('')
  let window_video = $state(false)
  let extensions_status = $state({})
  let searchQuery = $state('')
  let searchType = $state('title')
  let viewMode = $state('list')
  let sortType = $state('date')
  let sortDirection = $state('desc')
  let activeTab = $state('all')
  let currentDownloading = $derived(
    (locallist
      .filter((it) => it.status === 1)
      .sort((a, b) => parseCreatedAt(b.created_at) - parseCreatedAt(a.created_at)))[0] || null
  )
  function sameItem(a, b) {
    if (!a || !b) return false
    if (a.tempid != null && b.tempid != null) return a.tempid === b.tempid
    if (a.id != null && b.id != null) return a.id === b.id
    if (a.url && b.url) return a.url === b.url
    return false
  }

  function parseCreatedAt(val) {
    if (!val) return 0
    if (val instanceof Date) return val.getTime()
    if (typeof val === 'number') return val
    if (typeof val === 'string') {
      const iso = val.includes('T') ? val : val.replace(' ', 'T')
      const t = new Date(iso).getTime()
      if (!isNaN(t)) return t
      const t2 = new Date(val).getTime()
      return isNaN(t2) ? 0 : t2
    }
    try {
      const t = new Date(val).getTime()
      return isNaN(t) ? 0 : t
    } catch {
      return 0
    }
  }

  let filteredList = $derived(
    locallist
      .filter((item) => {
        let ok = true
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          if (searchType === 'title') {
            ok = item.title && item.title.toLowerCase().includes(query)
          } else if (searchType === 'url') {
            ok = item.url && item.url.toLowerCase().includes(query)
          } else {
            ok = true
          }
        }
        if (activeTab === 'downloading') {
          ok = ok && (item.status === 1 || item.status === 0)
        }
        return ok
      })
      .sort((a, b) => {
        let diff = 0
        if (sortType === 'date') {
          diff = parseCreatedAt(b.created_at) - parseCreatedAt(a.created_at)
        } else if (sortType === 'size') {
          diff = (b.filesize || 0) - (a.filesize || 0)
        } else if (sortType === 'time') {
          diff = (b.duration || 0) - (a.duration || 0)
        } else if (sortType === 'quality') {
          const qA = parseInt(a.quality || '0')
          const qB = parseInt(b.quality || '0')
          diff = qB - qA
        }
        return sortDirection === 'asc' ? -diff : diff
      })
  )
  let filteredListDisplay = $derived(
    currentDownloading
      ? filteredList.filter((it) => !sameItem(it, currentDownloading))
      : filteredList
  )
  onMount(async () => {
    appVersion = await window.electron.ipcRenderer.invoke('get-app-version')
    loadExtensionsStatus()
  })

  let sites = $state([
    { value: 'auto', label: 'Auto Detect', requiresExtension: false }
  ])

  async function loadExtensionsStatus() {
    try {
      extensions_status = await window.electron.ipcRenderer.invoke('get-extensions-status')
      updateSitesList()
    } catch (error) {
      console.error('Error loading extensions status:', error)
    }
  }

  function updateSitesList() {
      const loadedSites = []
      if (extensions_status && extensions_status.loaded) {
        Object.values(extensions_status.loaded).forEach((ext) => {
          if (ext && ext.config && ext.config.name) {
            loadedSites.push({
              value: ext.config.name,
              label: ext.config.name,
              color: ext.config.color,
              requiresExtension: true
            })
          }
        })
      }

      loadedSites.sort((a, b) => a.label.localeCompare(b.label))

      sites = [
        { value: 'auto', label: 'Auto Detect', requiresExtension: false },
        ...loadedSites
      ]
  }

  async function reloadExtensions() {
    notifications.info('Reloading extensions...', { duration: 1500 });
    try {
        extensions_status = await window.electron.ipcRenderer.invoke('reload-extensions')
        updateSitesList() 
        notifications.success('Extensions reloaded', { duration: 2000 });
    } catch (e) {
        notifications.error('Failed to reload extensions');
    }
  }

  function isExtensionLoaded(siteName) {
    return extensions_status.loaded && extensions_status.loaded[siteName]
  }

  let revealingMap = $state({})

  let settings_open = $state(false)
  let settings = $state({
    default_format: 'mkv',
    concurrent_downloads: 3,
    namefile_type: 'video_title',
    threads: '1',
    ffmpeg_path: '',
    download_folder: '',
    use_embed: false
  })

  let showSettingsPrompt = $state(false)
  let missingSettings = $state([])

  let batchModalOpen = $state(false)
  let batchUrls = $state([])
  let batchQuality = $state('max')
  let batchDelay = $state(4000)

  onMount(async () => {
    const saved = localStorage.getItem('app_settings')
    if (saved) {
      settings = JSON.parse(saved)
    }
    setTimeout(checkRequiredSettings, 500)
  })

  function checkRequiredSettings() {
    missingSettings = []
    if (!settings.ffmpeg_path) missingSettings.push('FFmpeg Path')
    if (!settings.download_folder) missingSettings.push('Download Folder')
    showSettingsPrompt = missingSettings.length > 0
  }

  function openSettings() {
    settings_open = true
    showSettingsPrompt = false
  }

  const saved = localStorage.getItem('app_settings')
  if (saved) {
    const parsed = JSON.parse(saved)
    settings = { ...settings, ...parsed }
    format_video = parsed.default_format ?? settings.default_format
  }

  window.electron.ipcRenderer.send('updateSettings', JSON.stringify(settings))
  window.electron.ipcRenderer.send('getList')

  let isInitialLoad = true
  console.time('LoadingList')
  window.electron.ipcRenderer.on('getList', (e, v) => {
    const newList = v.sort((a, b) => parseCreatedAt(b.created_at) - parseCreatedAt(a.created_at))
    
    locallist = newList.map(item => {
      const existing = locallist.find(it => 
        (item.id && it.id === item.id) || 
        (item.tempid && it.tempid === item.tempid) ||
        (item.url === it.url && item.status === it.status)
      )

      const thumb = item.thumb

      if (existing) {
        return {
          ...existing,
          ...item,
          thumb,
          load: item.status === 1 ? (existing.load ?? 0) : (item.status === 2 ? 100 : 0)
        }
      }
      return { ...item, thumb, load: item.status === 2 ? 100 : 0 }
    })

    if (isInitialLoad) {
      notifications.success('The list loaded successfully', { duration: 1500 });
      console.timeEnd('LoadingList')
      isInitialLoad = false
      checkForUpdates()
    }
  })

  let availableUpdates = $state([])
  let isCheckingUpdates = $state(false)

  async function checkForUpdates() {
    isCheckingUpdates = true
    try {
      availableUpdates = await window.electron.ipcRenderer.invoke('check-for-extension-updates')
      if (availableUpdates.length > 0) {
        notifications.info(`${availableUpdates.length} extension updates available`, { duration: 3000 })
      }
    } catch (error) {
      console.error('Error checking for updates:', error)
    } finally {
      isCheckingUpdates = false
    }
  }

  async function updateExtension(extension) {
    try {
      notifications.info(`Updating ${extension.name}...`, { duration: 2000 })
      const success = await window.electron.ipcRenderer.invoke('update-extension', extension.name)
      if (success) {
        notifications.success(`Updated ${extension.name} successfully`, { duration: 2000 })
        // Remove from list
        availableUpdates = availableUpdates.filter(u => u.name !== extension.name)
        // Reload extensions
        await reloadExtensions()
      } else {
        notifications.error(`Failed to update ${extension.name}`)
      }
    } catch (error) {
      notifications.error(`Error updating ${extension.name}`)
    }
  }

  window.electron.ipcRenderer.on('getCheck', (e, { status, id, pathfile, filesize }) => {
    const idx = locallist.findIndex((it) => it.id === id || it.tempid === id)
    if (idx !== -1) {
      locallist[idx].status = status
      if (id && !locallist[idx].id) {
        locallist[idx].id = id
      }
      if (pathfile) {
        locallist[idx].pathfile = pathfile
      }
      if (status === 2) {
        locallist[idx].load = 100
        locallist[idx].filesize = filesize
      } else if (status === 3) {
        locallist[idx].load = 0
      }
      locallist = locallist
    }
  })

  window.electron.ipcRenderer.on('getProgress', (e, { id, load, filesize }) => {
    const idx = locallist.findIndex((it) => it.id === id || it.tempid === id)

    if (idx !== -1) {
      locallist[idx].load = load
      if (filesize) locallist[idx].filesize = filesize
      locallist = locallist
    }
  })

  const window_close = () => (window_video = false)

  function siteColor(site) {
    const color = sites.find((it) => it.value.toLowerCase() === site.toLowerCase())?.color
 
    if (color) {
      return color
    }
    return '#242424b0'
  }

  function getVideo() {
    window_video = true
    video_test = ''
    time_video = ''
    thumb_video = ''
    title_video = ''
    embed = ''
    getdata = true
    window.electron.ipcRenderer.send('getVideo', { site: 'auto', url: url })
    notifications.info('Obtaining data', { duration: 2000 });
  }

  function updateList(v) {
    if (v.status == 200) {
      video_test = !v.force_type ? { src: v.video_test } : { src: v.video_test, type: v.force_type }
      title_video = decodeURI(v.title)
      time_video = v.time
      thumb_video = v.thumb
      site_video = v.site
      url_video = v.url
      embed = v.embed
      quality_list = v.list_quality.sort((a, b) => b.quality - a.quality)
      selected_quality = quality_list[0].url
      notifications.success('Data obtained', { duration: 2000 });
      setTimeout(() => {
        getdata = false
      }, 1500)
    }
  }

  function startDownload() {
    if (getdata == false) {
      
      const tempid = crypto.randomUUID()
      const newItem = {
        title: title_video,
        thumb: thumb_video,
        site: site_video,
        url: url_video,
        format: format_video,
        video_test: selected_quality,
        load: 0,
        tempid: tempid,
        duration: toSeconds(time_video),
        quality: quality_list.find((item) => item.url == selected_quality).quality,
        created_at: new Date().toISOString(),
        status: 0
      }

      activeTab = 'downloading'
      locallist = [newItem, ...locallist]

      window_close()
      window.electron.ipcRenderer.send('getCheck', {
        title: title_video,
        thumb: thumb_video,
        url: url_video,
        site: site_video,
        video_src:
          typeof selected_quality === 'string'
            ? selected_quality
            : selected_quality && selected_quality.src
              ? selected_quality.src
              : '',
        format: format_video,
        tempid: tempid,
        duration: time_video,
        quality: quality_list.find((item) => item.url == selected_quality).quality
      })
      url = ''
      window.document.querySelector('.scroll').scrollTo({ top: 0 })
      notifications.success('Starting Download', { duration: 3000 });
    }
  }

  function copytext(text) {
    navigator.clipboard.writeText(text)
    notifications.success('copied url', { duration: 2500 });
  }

  function UpdateStateApp(s) {
    window.electron.ipcRenderer.send('setState', s)
  }

  function closeSettings() {
    settings_open = false
  }

  function format_time(time, secondTime) {
    const secondsTimeTrack = secondTime ? time : toSeconds(time)
    const hours = Math.floor(secondsTimeTrack / 3600)
    const minutes = Math.floor((secondsTimeTrack % 3600) / 60)
    const seconds = Math.floor(secondsTimeTrack % 60)

    return `${hours > 0 ? hours + 'h ' : ''}${minutes > 0 ? minutes + 'm ' : ''}${seconds > 0 ? seconds + 's' : ''}`
  }

  function bytesToSize(bytes) {
    var sizes = ['B', 'K', 'M', 'G', 'T', 'P']
    for (var i = 0; i < sizes.length; i++) {
      if (bytes <= 1024) {
        return Math.round(bytes) + ' ' + sizes[i]
      } else {
        bytes = parseFloat(bytes / 1024).toFixed(2)
      }
    }
    return bytes + ' P'
  }

  function saveSettings() {
    localStorage.setItem('app_settings', JSON.stringify(settings))
    window.electron.ipcRenderer.send('updateSettings', JSON.stringify(settings))
    notifications.success('Settings saved', { duration: 2000 });

    window.electron.ipcRenderer.send('updateSettings', JSON.stringify(settings))
    settings_open = false
  }

  function clearLocalStorage() {
    localStorage.clear()
    settings = {
      default_format: 'mkv',
      concurrent_downloads: 3,
      namefile_type: 'video_title',
      threads: '1',
      download_folder: '',
      ffmpeg_path: '',
      use_embed: false
    }
    notifications.success('LocalStorage cleared and settings reset', { duration: 2000 });
  }

  function toSeconds(timemark) {
    if (!timemark) return 0
    const parts = timemark.split(':')
    if (parts.length < 3) return 0
    const [hh, mm, ss] = parts
    const seconds = parseFloat(ss) + (parseInt(mm, 10) || 0) * 60 + (parseInt(hh, 10) || 0) * 3600
    return isNaN(seconds) ? 0 : seconds
  }

  function reveal(item) {
    const path = item && item.pathfile ? item.pathfile : ''
    if (!path) return
    if (revealingMap[path]) return
    revealingMap = { ...revealingMap, [path]: true }
    window.electron.ipcRenderer.send('revealFile', { path })
    setTimeout(() => {
      delete revealingMap[path]
      revealingMap = revealingMap
    }, 1500)
  }

  window.electron.ipcRenderer.on('getVideo', (e, v) => {
    getdata = true
    if (v.error) {
      notifications.error('Failed to get video data', { duration: 2000 });
      return
    }
    updateList(v)
  })

  function removeItem(item) {
    const key = item.id ?? item.tempid
    if (item.status === 1) {
      try {
        notifications.success('Download cancelled', { duration: 2000 });
        window.electron.ipcRenderer.send('cancelDownload', { id: item.id ?? item.tempid })
      } catch {}
    }
    locallist = locallist.filter((i) => (i.id ?? i.tempid) !== key)
    if (item.id) {
      window.electron.ipcRenderer.send('deleteItem', { id: item.id })
    }
  }

  async function openBatchImport() {
    try {
      const result = await window.electron.ipcRenderer.invoke('pick-batch-file')
      if (result.count > 0) {
        batchUrls = result.urls
        batchModalOpen = true
        batchQuality = 'max'
        batchDelay = 4000
      } else if (result.error) {
        notifications.error('Error reading file');
      }
    } catch {
      notifications.error('Failed to open file');
    }
  }

  async function startBatchProcessing() {
    batchModalOpen = false
    try {
      const args = JSON.parse(JSON.stringify({
        urls: batchUrls,
        quality: batchQuality,
        delay: batchDelay
      }))

      await window.electron.ipcRenderer.invoke('start-batch-download', args)
      
      notifications.success(`Processing ${batchUrls.length} links in background...`, { duration: 3000 });
    } catch (err) {
       console.error(err)
        notifications.error('Failed to start batch');
    }
  }

  window.electron.ipcRenderer.on('deletedItem', (e, { id }) => {
    notifications.success('Item removed', { duration: 2000 });
  })
</script>

<NotificationToast />
<UpdateNotification />

{#if showSettingsPrompt}
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
    <div class="bg-[#252525] rounded-lg shadow-xl max-w-md w-full p-6 border border-orange-500/50">
      <div class="flex items-start gap-3 mb-4">
        <TriangleAlertIcon class="h-6 w-6 text-orange-400 mt-0.5 flex-shrink-0" />
        <div>
          <h3 class="text-lg font-semibold text-white mb-1">Configuration Required</h3>
          <p class="text-gray-300 text-sm">The following required settings are not configured:</p>
          <ul class="list-disc pl-5 mt-2 text-sm text-gray-300 space-y-1">
            {#each missingSettings as setting}
              <li>{setting}</li>
            {/each}
          </ul>
        </div>
      </div>
      <div class="mt-6 flex justify-end gap-3">
        <button
          onclick={openSettings}
          class="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Configure Settings
        </button>
      </div>
    </div>
  </div>
{/if}

{#if batchModalOpen}
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
    <div class="bg-[#252525] rounded-lg shadow-xl max-w-sm w-full p-6 border border-[#3d3d3d]">
      <h3 class="text-lg font-semibold text-white mb-1">Batch Import</h3>
      <p class="text-gray-400 text-sm mb-4">Found {batchUrls.length} links to process.</p>
      
      <div class="space-y-4">
        <div>
          <label for="quality" class="text-xs font-medium text-gray-300 block mb-1.5">Video Quality</label>
          <select
            id="quality"
            bind:value={batchQuality}
            class="w-full bg-[#1B1B1B] border border-[#3d3d3d] text-white text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block p-2.5 outline-none"
          >
            <option value="max">Max Quality</option>
            <option value="medium">Medium Quality</option>
            <option value="low">Low Quality</option>
          </select>
        </div>

        <div>
          <label for="delay" class="text-xs font-medium text-gray-300 block mb-1.5">Delay between downloads (ms)</label>
          <input
            type="number"
            id="delay"
            bind:value={batchDelay}
            min="0"
            step="100"
            class="w-full bg-[#1B1B1B] border border-[#3d3d3d] text-white text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block p-2.5 outline-none placeholder-gray-500"
            placeholder="0"
          />
          <p class="text-xs text-gray-500 mt-1">Useful to avoid rate limits.</p>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <button
          onclick={() => (batchModalOpen = false)}
          class="px-4 py-2 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white rounded-lg text-sm font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={startBatchProcessing}
          class="px-4 py-2 bg-gradient-to-r from-[#FF9027] to-[#FF6B00] hover:from-[#FF9C3F] hover:to-[#FF7B1C] text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-orange-900/20"
        >
          Start Import
        </button>
      </div>
    </div>
  </div>
{/if}

<div
  class="w-full h-10 bg-[#202020] flex items-center justify-between top-0 left-0 right-0 absolute move z-[99] pl-3"
>
  <div class="flex items-center gap-4">
    <div class="flex items-center gap-2">
      <img src={LogoIcon} alt="" class="w-5 h-5" />
      <div class="flex items-baseline gap-1.5">
        <h1 class="text-white text-sm font-medium">Horny Downloader</h1>
        <span class="text-xs text-gray-400">v{appVersion}</span>
        {#if $updateBanner}
          <button
            onclick={() => ($showUpdateBanner = !$showUpdateBanner)}
            class="ml-1.5 px-2 py-0.5 no_move text-xs font-medium rounded-full bg-blue-600 text-white flex items-center gap-1.5 hover:bg-blue-700 transition-colors"
          >
            <span>Update Available</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
  <div class="w-fit h-full no_move flex items-center justify-center">
    <button class="h-full p-2 px-4 no_move hover:bg-[#313131]" onclick={() => UpdateStateApp('min')}
      ><MinusIcon color="white" size="17" /></button
    >
    <button class="h-full p-2 px-4 no_move hover:bg-[#313131]" onclick={() => UpdateStateApp('max')}
      ><SquareIcon color="#d3d3d3" size="18" /></button
    >
    <button
      class="h-full p-2 px-4 no_move hover:bg-[#dc3b3b]"
      onclick={() => UpdateStateApp('close')}><XIcon color="white" size="20" /></button
    >
  </div>
</div>

<div
  class="w-fit flex flex-col justify-center mx-auto gap-3 fixed top-10 py-5 z-10 text-sm px-4 bg-[#141414]/80 backdrop-blur-sm pb-1 pt-6"
>
  <div class="flex items-center gap-4">
    <div class="relative group w-48">
      <div
        class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
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
      <select
        class="w-full appearance-none bg-[#1B1B1B] border-2 border-[#2d2d2d] hover:border-[#3d3d3d] focus:border-[#FF9027] focus:ring-1 focus:ring-[#FF9027]/50 rounded-lg pl-10 pr-8 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer"
        bind:value={sel_site}
      >
        {#each sites as site}
          <option
            value={site.value}
            class="bg-[#1B1B1B]"
            disabled={site.requiresExtension && !isExtensionLoaded(site.value)}
          >
            {site.label}
          </option>
        {/each}
      </select>
    </div>

    <div class="relative flex-1 max-w-2xl">
      <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      </div>
      <input
        class="w-full bg-[#1B1B1B] px-10 py-2.5 border-2 border-[#2d2d2d] hover:border-[#3d3d3d] focus:border-[#FF9027] focus:ring-1 focus:ring-[#FF9027]/50 rounded-lg outline-none transition-all duration-200 text-sm font-medium"
        type="text"
        placeholder="Paste video URL here..."
        bind:value={url}
        onkeydown={(e) => e.key === 'Enter' && getVideo()}
      />
      {#if url}
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button
          onclick={() => (url = '')}
          class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
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
        </button>
      {/if}
    </div>

    <div class="flex items-center gap-2">


      <button
        class="px-5 py-2.5 bg-gradient-to-r from-[#FF9027] to-[#FF6B00] disabled:from-[#FF9027] disabled:to-[#FF6B00] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#FF9C3F] hover:to-[#FF7B1C] text-white font-medium rounded-lg flex items-center gap-2 transition-all duration-200 transform hover:scale-105 active:scale-95 focus:outline-none shadow-lg hover:shadow-[#FF9027]/20"
        onclick={getVideo}
        disabled={settings.ffmpeg_path === '' || settings.download_folder === ''}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
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
        <span>Download</span>
      </button>

      <button
        class="p-2.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] border-2 border-[#3d3d3d] hover:border-[#4d4d4d] rounded-lg text-white transition-all duration-200 focus:outline-none focus:ring-offset-2 focus:ring-offset-[#1B1B1B]"
        onclick={openBatchImport}
        title="Import Links from TXT"
      >
        <FileText size="20" class="text-gray-300 hover:text-white transition-colors" />
      </button>

      <button
        class="p-2.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] border-2 border-[#3d3d3d] hover:border-[#4d4d4d] rounded-lg text-white transition-all duration-200 focus:outline-none focus:ring-offset-2 focus:ring-offset-[#1B1B1B]"
        onclick={openSettings}
        title="Settings"
      >
        <SettingsIcon size="20" class="text-gray-300 hover:text-white transition-colors" />
      </button>
    </div>
    
  </div>

      <div class="relative w-full max-w-4xl flex items-center gap-2">
        <div class="relative">
          <select
            bind:value={searchType}
            class="appearance-none bg-[#1B1B1B] border-2 border-[#2d2d2d] hover:border-[#3d3d3d] focus:border-[#FF9027] focus:ring-1 focus:ring-[#FF9027]/50 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium text-gray-300 transition-all cursor-pointer outline-none"
          >
            <option value="title">Title</option>
            <option value="url">URL</option>
          </select>
          <div class="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg
              class="h-3 w-3 text-gray-400"
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

        <div class="relative flex-1">
          <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <SearchIcon class="h-3.5 w-3.5 text-gray-400" />
          </div>
          <input
            class="w-full bg-[#1B1B1B] pl-9 pr-8 py-1.5 border-2 border-[#2d2d2d] hover:border-[#3d3d3d] focus:border-[#FF9027] focus:ring-1 focus:ring-[#FF9027]/50 rounded-lg outline-none transition-all duration-200 text-xs font-medium placeholder-gray-500"
            type="text"
            placeholder={searchType === 'url' ? 'Search by URL...' : 'Search by Title...'}
            bind:value={searchQuery}
          />
          {#if searchQuery}
            <!-- svelte-ignore a11y_consider_explicit_label -->
            <button
              onclick={() => (searchQuery = '')}
              class="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 hover:text-white transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3.5 w-3.5"
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
            </button>
          {/if}
        </div>

        <div class="relative ml-1">
          <select
            bind:value={sortType}
            class="appearance-none bg-[#1B1B1B] border-2 border-[#2d2d2d] hover:border-[#3d3d3d] focus:border-[#FF9027] focus:ring-1 focus:ring-[#FF9027]/50 rounded-lg pl-8 pr-6 py-1.5 text-xs font-medium text-gray-300 transition-all cursor-pointer outline-none"
          >
            <option value="date">Date</option>
            <option value="size">Size</option>
            <option value="time">Time</option>
            <option value="quality">Quality</option>
          </select>
          <div class="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
            {#if sortDirection === 'asc'}
              <ArrowUpNarrowWide class="h-3.5 w-3.5 text-gray-400" />
            {:else}
              <ArrowDownWideNarrow class="h-3.5 w-3.5 text-gray-400" />
            {/if}
          </div>
          <div class="absolute inset-y-0 right-0 flex items-center pr-1.5 pointer-events-none">
            <svg
              class="h-3 w-3 text-gray-400"
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

        <button
          onclick={() => (sortDirection = sortDirection === 'asc' ? 'desc' : 'asc')}
          class="p-1.5 ml-1 rounded-lg bg-[#1B1B1B] border-2 border-[#2d2d2d] hover:border-[#3d3d3d] text-gray-400 hover:text-white transition-all duration-200"
          title={sortDirection === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
        >
          {#if sortDirection === 'asc'}
            <ArrowUpNarrowWide class="w-4 h-4" />
          {:else}
            <ArrowDownWideNarrow class="w-4 h-4" />
          {/if}
        </button>

        <div class="flex bg-[#1B1B1B] rounded-lg border-2 border-[#2d2d2d] p-0.5 shrink-0 ml-1">
          <button
            onclick={() => (activeTab = 'all')}
            class="p-1.5 rounded-md transition-all text-xs duration-200 {activeTab === 'all'
              ? 'bg-[#2d2d2d] text-white shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]/50'}"
            title="Show all"
          >
            All
          </button>
          <button
            onclick={() => (activeTab = 'downloading')}
            class="p-1.5 rounded-md transition-all text-xs duration-200 {activeTab === 'downloading'
              ? 'bg-[#2d2d2d] text-white shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]/50'}"
            title="Show downloading"
          >
            Downloading
          </button>
        </div>

        <div class="flex bg-[#1B1B1B] rounded-lg border-2 border-[#2d2d2d] p-0.5 shrink-0 ml-1">
          <button
            onclick={() => (viewMode = 'list')}
            class="p-1.5 rounded-md transition-all duration-200 {viewMode === 'list'
              ? 'bg-[#2d2d2d] text-white shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]/50'}"
            title="List View"
          >
            <List class="w-3.5 h-3.5" />
          </button>
          <button
            onclick={() => (viewMode = 'grid')}
            class="p-1.5 rounded-md transition-all duration-200 {viewMode === 'grid'
              ? 'bg-[#2d2d2d] text-white shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]/50'}"
            title="Grid View"
          >
            <LayoutGrid class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    
</div>

<main class="h-full flex flex-col justify-center items-center text-sm">
  {#if settings_open}
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
            onclick={closeSettings}
            title="Close settings"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div class="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
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
                <label
                  for="setting-download-folder"
                  class="block text-sm font-medium text-gray-200"
                >
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
                      const result = await window.electron.ipcRenderer.invoke(
                        'open-directory-dialog',
                        {
                          title: 'Select Download Folder'
                        }
                      )
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
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label
                    for="setting-default-format"
                    class="block text-sm font-medium text-gray-200"
                  >
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
                    <div
                      class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"
                    >
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
                      <option value="random_uuid">Random UUID</option>
                    </select>
                    <div
                      class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"
                    >
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
                        class="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FF9027]"
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
                    <div
                      class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"
                    >
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
                      <div class="flex items-center justify-between p-3 bg-[#252525] rounded-lg border border-orange-500/30">
                        <div class="flex items-center gap-3">
                          <div class="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                          <div>
                            <p class="text-sm font-medium text-white">
                              {update.name.replace('Extension', '')}
                            </p>
                            <p class="text-xs text-gray-400">
                              v{update.currentVersion} → <span class="text-green-400">v{update.newVersion}</span>
                            </p>
                          </div>
                        </div>
                         <button
                            onclick={() => updateExtension(update)}
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
                   onclick={reloadExtensions}
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
            </div>
          </div>
        </div>

        <div
          class="bg-[#252525] px-6 py-4 border-t border-[#3a3a3a] flex justify-between items-center"
        >
          <button
            onclick={clearLocalStorage}
            class="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 bg-[#333333] hover:bg-[#3d3d3d] rounded-lg transition-colors duration-200"
          >
            Clear LocalStorage
          </button>
          <div class="flex space-x-3">
            <button
              onclick={closeSettings}
              class="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-[#333333] hover:bg-[#3d3d3d] rounded-lg transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              onclick={saveSettings}
              class="px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-[#FF9027] to-[#FF6B00] hover:from-[#FF9C3F] hover:to-[#FF7B1C] rounded-lg transition-all duration-200 transform hover:scale-105 focus:ring-offset-2 focus:ring-offset-[#1e1e1e] shadow-lg hover:shadow-[#FF9027]/20"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <div class="w-full flex-1 mt-[12em] px-6 pb-8 overflow-y-auto custom-scrollbar scroll">
  
    <div
      class="grid {viewMode === 'grid'
        ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4'
        : 'grid-cols-1 gap-3'} max-w-6xl mx-auto"
    >
      {#if currentDownloading}
        <div
          class="group bg-[#1e1e1e] border border-[#2d2d2d] hover:border-[#3d3d3d] rounded-xl p-3 transition-all duration-200 hover:shadow-lg hover:shadow-[#FF9027]/5 col-span-1"
        >
          <div class="flex {viewMode === 'grid' ? 'flex-col gap-3' : 'gap-4'} items-start">
            <div
              class="relative flex-shrink-0 {viewMode === 'grid'
                ? 'w-full aspect-video'
                : 'w-32 h-20'} rounded-lg overflow-hidden bg-[#252525] border border-[#3a3a3a] group-hover:border-[#4a4a4a] transition-colors"
            >
              <img
                src={currentDownloading.thumb}
                alt={currentDownloading.title}
                loading="lazy"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              {#if currentDownloading.status == 1}
                <div class="absolute bottom-0 left-0 right-0 h-1.5 bg-[#2d2d2d] overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-[#FF9027] to-[#FF6B00] transition-all duration-300"
                    style={`width: ${currentDownloading.load || 0}%`}
                  ></div>
                </div>
              {/if}
              <div class="absolute top-2 left-2">
                <span
                  class="px-2 py-0.5 bg-[#1a2a2a] text-[#4fd1c5] text-[10px] font-medium rounded-full flex items-center gap-1.5"
                >
                  <span class="w-1.5 h-1.5 bg-[#4fd1c5] rounded-full animate-pulse"></span>
                  {currentDownloading.load || 0}%
                </span>
              </div>
            </div>
            <div class="flex-1 min-w-0 w-full">
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <h3
                    class="text-sm font-medium text-white group-hover:text-[#FF9027] transition-colors line-clamp-2"
                    title={currentDownloading.title}
                  >
                    {currentDownloading.title}
                  </h3>
                  <div class="flex flex-wrap items-center gap-2 mt-1.5">
                    <span
                      class="px-2 py-0.5 text-[10px] font-medium rounded-full border border-opacity-20"
                      style={`background-color: ${siteColor(currentDownloading.site)}10; color: ${siteColor(currentDownloading.site)}; border-color: ${siteColor(currentDownloading.site)}`}
                    >
                      {currentDownloading.site}
                    </span>
                    <div class="flex items-center gap-1.5 text-xs text-gray-400">
                      {#if currentDownloading.duration}
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
                          {format_time(currentDownloading.duration, true)}
                        </span>
                      {/if}
                      {#if currentDownloading.quality}
                        <span class="text-gray-500">•</span>
                        quality:
                        <span
                          class="px-1.5 py-0.5 bg-[#252525] rounded text-[10px] font-mono text-gray-300"
                        >
                        {#if currentDownloading.quality == 'original'}
                          Original
                        {:else}
                          {!currentDownloading.quality.includes('k') ? `${currentDownloading.quality}p` : currentDownloading.quality}
                        {/if}
                        </span>
                      {/if}
                      {#if currentDownloading.format}
                        <span class="text-gray-500">•</span>
                        <span class="text-gray-400">format: {currentDownloading.format}</span>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}
      {#each filteredListDisplay as item}
        <div
          class="group bg-[#1e1e1e] border border-[#2d2d2d] hover:border-[#3d3d3d] rounded-xl p-3 transition-all duration-200 hover:shadow-lg hover:shadow-[#FF9027]/5"
        >
          <div class="flex {viewMode === 'grid' ? 'flex-col gap-3' : 'gap-4'} items-start">
            <div
              class="relative flex-shrink-0 {viewMode === 'grid'
                ? 'w-full aspect-video'
                : 'w-32 h-20'} rounded-lg overflow-hidden bg-[#252525] border border-[#3a3a3a] group-hover:border-[#4a4a4a] transition-colors"
            >
              <img
                src={item.thumb}
                alt=""
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />

              {#if item.status == 1}
                <div class="absolute bottom-0 left-0 right-0 h-1.5 bg-[#2d2d2d] overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-[#FF9027] to-[#FF6B00] transition-all duration-300"
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
                    class="px-2 py-0.5 text-[10px] font-medium rounded-lg border border-opacity-20 flex-shrink-0"
                    style={`background-color: ${siteColor(item.site)}10; color: ${siteColor(item.site)}; border-color: ${siteColor(item.site)}`}
                  >
                    {item.site}
                  </span>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    {#if (item.status == 1 && item.load == null) || item.status == 2 || item.status == 3}
                      <button
                        class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
                        title="Open file location"
                        onclick={() => reveal(item)}
                      >
                        <FolderIcon color="white" size="16" />
                      </button>
                      <button
                        class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
                        title="Copy URL"
                        onclick={() => copytext(item.url)}
                      >
                        <ClipboardIcon color="white" size="16" />
                      </button>
                    {/if}

                    <button
                      class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
                      onclick={() => removeItem(item)}
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
                        style={`background-color: ${siteColor(item.site)}10; color: ${siteColor(item.site)}; border-color: ${siteColor(item.site)}`}
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
                        onclick={() => reveal(item)}
                      >
                        <FolderIcon color="white" size="18" />
                      </button>
                      <button
                        class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
                        title="Open file location"
                        onclick={() => copytext(item.url)}
                      >
                        <ClipboardIcon color="white" size="18" />
                      </button>
                    {/if}

                    <button
                      class="p-1.5 rounded-lg hover:bg-[#2d2d2d] text-gray-400 hover:text-white transition-colors"
                      onclick={() => removeItem(item)}
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
      {/each}
    </div>
  </div>
  {#if window_video}
    <div
      class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <div
        class="bg-[#1e1e1e] border border-[#3a3a3a] rounded-xl overflow-hidden w-full max-w-4xl shadow-2xl"
      >
        <div class="flex items-center justify-between p-4 border-b border-[#3a3a3a] bg-[#252525]">
          <h2 class="text-lg font-medium text-white">Download Options</h2>
          <button
            class="p-1.5 rounded-full hover:bg-[#3a3a3a] text-gray-300 hover:text-white transition-colors"
            onclick={window_close}
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
              <Player 
                useEmbed={settings.use_embed} 
                embedUrl={embed} 
                src={video_test} 
                poster={thumb_video} 
                title={title_video} 
              />
            </div>
            <div class="mt-4">
              <h3 class="text-white font-medium text-lg truncate">{title_video}</h3>
              <p class="text-gray-400 text-sm mt-1">Video Duration: {format_time(time_video)}</p>
            </div>
          </div>

          <div class="w-2/3 md:w-1/3 p-5">
            <div class="space-y-6">
              <div class="space-y-2">
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

              <button
                class="w-full py-3 px-4 rounded-lg font-medium text-white transition-all duration-200 flex items-center justify-center gap-2 {getdata
                  ? 'bg-[#c28851] cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#FF9027] to-[#FF6B00] hover:from-[#FF6B00] hover:to-[#FF9027] hover:shadow-lg hover:shadow-[#FF9027]/20'}"
                disabled={getdata}
                onclick={startDownload}
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
  {/if}
</main>
