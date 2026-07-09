<script>
  import { onMount, tick } from 'svelte'

  let PlayerComponent = $state(null)
  import('./components/player/Player.svelte').then((m) => (PlayerComponent = m.default))

  import NotificationToast from './components/NotificationToast.svelte'
  import UpdateNotification from './components/UpdateNotification.svelte'
  import { updateBanner, showUpdateBanner } from './components/store'
  import { notifications } from './components/NotificationStore'

  // --- Icons & Assets ---
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

  // --- App State ---
  let appVersion = $state('')
  let isDev = $state(false)
  let isInitialLoad = true

  // --- Settings State ---
  let settings_open = $state(false)
  let showSettingsPrompt = $state(false)
  let missingSettings = $state([])
  let settings = $state({
    default_format: 'mkv',
    concurrent_downloads: 3,
    namefile_type: 'video_title',
    threads: '1',
    ffmpeg_path: '',
    download_folder: '',
    use_embed: false,
    extension_branch: 'main',
    dev_auto_sync: false,
    custom_ffmpeg_params: '',
    organize_by_site: false,
    telegram_enabled: false,
    telegram_token: ''
  })

  // --- Extensions State ---
  let extensions_status = $state({})
  let sites = $state([])
  let availableUpdates = $state([])
  let isCheckingUpdates = $state(false)

  // --- Video & Download State ---
  let url = $state('')
  let locallist = $state([])
  let getdata = $state(true)
  let video_test = $state('')
  let embed = $state('')
  let referer = $state('')
  let sel_site = $state('')
  let quality_list = $state([{ url: '', quality: 'loading', size: '' }])
  let format_video = $state('mkv')
  let time_video = $state('')
  let thumb_video = $state('')
  let title_video = $state('')
  let selected_quality = $state('')
  let site_video = ''
  let url_video = $state('')
  let window_video = $state(false)
  let telegram_download = $state(false)
  let subtitle_list = $state([])
  let selected_subtitle = $state('')
  let proxy_method_video = $state(false)

  // --- UI State ---
  let searchQuery = $state('')
  let debouncedSearch = $state('')
  let searchTimer = null
  let searchType = $state('title')
  let siteFilter = $state('all')
  let viewMode = $state('list')
  let sortType = $state('date')
  let sortDirection = $state('desc')
  let activeTab = $state('all')
  let revealingMap = $state({})

  // --- Virtual Scrolling State ---
  let visibleCount = $state(20)
  let listContainer = $state(null)
  let loadMore = $state(false)

  // --- Batch Import State ---
  let batchModalOpen = $state(false)
  let batchUrls = $state([])
  let batchQuality = $state('max')
  let batchDelay = $state(12000)
  let batchSkipCount = $state(0)
  let batchProgress = $state({ total: 0, processed: 0, remaining: 0 })
  let isDraggingOver = $state(false)

  // --- Derived State ---
  let currentDownloading = $derived(
    locallist
      .filter((it) => it.status === 1)
      .sort((a, b) => parseCreatedAt(b.created_at) - parseCreatedAt(a.created_at))[0] || null
  )

  let filteredList = $derived(
    locallist
      .filter((item) => {
        let ok = true
        if (siteFilter && siteFilter !== 'all') {
          ok = ok && item.site && item.site.toLowerCase() === siteFilter.toLowerCase()
        }
        if (debouncedSearch) {
          const query = debouncedSearch.toLowerCase()
          if (searchType === 'title') {
            ok = ok && item.title && item.title.toLowerCase().includes(query)
          } else if (searchType === 'url') {
            ok = ok && item.url && item.url.toLowerCase().includes(query)
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

  let filteredListDisplay = $derived(filteredList)

  let paginatedList = $derived(filteredListDisplay.slice(0, visibleCount))
  let paginatedListWithoutCurrent = $derived(
    currentDownloading
      ? paginatedList.filter((it) => !sameItem(it, currentDownloading))
      : paginatedList
  )
  let hasMoreItems = $derived(
    currentDownloading
      ? visibleCount - 1 < filteredListDisplay.length
      : visibleCount < filteredListDisplay.length
  )

  $effect(() => {
    visibleCount = 20
  })

  $effect(() => {
    activeTab
    visibleCount = 20
  })

  $effect(() => {
    const query = searchQuery
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      debouncedSearch = query
    }, 250)
    return () => {
      if (searchTimer) clearTimeout(searchTimer)
    }
  })

  $effect(() => {
    sites
    siteColorCache.clear()
  })

  function loadMoreItems() {
    if (visibleCount < filteredListDisplay.length) {
      visibleCount = Math.min(visibleCount + 40, filteredListDisplay.length)
      loadMore = true
      setTimeout(() => (loadMore = false), 100)
    }
  }

  function handleScroll(e) {
    const target = e.target
    const scrollTop = target.scrollTop
    const scrollHeight = target.scrollHeight
    const clientHeight = target.clientHeight

    if (scrollHeight - scrollTop - clientHeight < 300) {
      loadMoreItems()
    }
  }

  // --- Initialization ---

  onMount(async () => {
    // Load settings from localStorage
    try {
      const saved = localStorage.getItem('app_settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        settings = { ...settings, ...parsed }
        if (parsed.default_format) format_video = parsed.default_format
      }
    } catch (e) {
      console.error('Error parsing settings:', e)
    }

    // Check settings prompt immediately
    checkRequiredSettings()

    // Send initial settings to main process
    window.electron.ipcRenderer.send('updateSettings', JSON.stringify(settings))

    // Setup Listeners
    setupIpcListeners()

    try {
      // Parallel loading of app info
      const [version, dev, extStatus] = await Promise.all([
        window.electron.ipcRenderer.invoke('get-app-version'),
        window.electron.ipcRenderer.invoke('is-dev'),
        window.electron.ipcRenderer.invoke('get-extensions-status')
      ])

      appVersion = version
      isDev = dev
      extensions_status = extStatus
      updateSitesList()

      // Auto sync for dev
      if (isDev && settings.dev_auto_sync) {
        syncExtensions()
      }
    } catch (error) {
      console.error('Initialization error:', error)
    }

    // Load List
    window.electron.ipcRenderer.send('getList')

    return () => {
      removeIpcListeners()
    }
  })

  // --- IPC Handlers ---

  function setupIpcListeners() {
    removeIpcListeners()
    window.electron.ipcRenderer.on('getList', handleGetList)
    window.electron.ipcRenderer.on('getCheck', handleGetCheck)
    window.electron.ipcRenderer.on('getProgress', handleGetProgress)
    window.electron.ipcRenderer.on('getVideo', handleGetVideo)
    window.electron.ipcRenderer.on('deletedItem', handleDeletedItem)
    window.electron.ipcRenderer.on('batch-progress', (e, data) => {
      batchProgress = data
    })
    window.electron.ipcRenderer.on('telegram-url-received', (e, url) => {
      if (url && !telegram_download) {
        window.electron.ipcRenderer.send('getVideo', { url: url })
        telegram_download = true
        notifications.info('URL received from Telegram - select quality', { duration: 3000 })
      }
    })
    window.electron.ipcRenderer.on('telegram-download-start', (e, { url, quality, videoInfo }) => {
      if (url) {
        const bestQuality = videoInfo.list_quality.find((q) => q.quality === quality)
        const videoSrc = bestQuality?.url || videoInfo.video_test?.[0]?.url || videoInfo.video_src

        if (videoSrc) {
          window.electron.ipcRenderer.send('addToDownload', {
            title: videoInfo.title || 'Unknown',
            url: url,
            site: videoInfo.site || 'unknown',
            format: settings.default_format || 'mkv',
            quality: quality,
            thumb: videoInfo.thumb || '',
            time: videoInfo.time || '0:0:0',
            video_src: videoSrc,
            referer: videoInfo.referer || '',
            fromTelegram: true
          })
          telegram_download = false
          notifications.info(`Download started: ${quality}p`, { duration: 3000 })
        }
      }
    })
  }

  function removeIpcListeners() {
    window.electron.ipcRenderer.removeAllListeners('getList')
    window.electron.ipcRenderer.removeAllListeners('getCheck')
    window.electron.ipcRenderer.removeAllListeners('getProgress')
    window.electron.ipcRenderer.removeAllListeners('getVideo')
    window.electron.ipcRenderer.removeAllListeners('deletedItem')
    window.electron.ipcRenderer.removeAllListeners('telegram-url-received')
    window.electron.ipcRenderer.removeAllListeners('telegram-download-start')
  }

  const handleGetList = (e, v) => {
    const newList = v.sort((a, b) => parseCreatedAt(b.created_at) - parseCreatedAt(a.created_at))

    locallist = newList.map((item) => {
      const existing = locallist.find(
        (it) =>
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
          load: item.status === 1 ? (existing.load ?? 0) : item.status === 2 ? 100 : 0
        }
      }
      return { ...item, thumb, load: item.status === 2 ? 100 : 0 }
    })

    if (isInitialLoad) {
      notifications.success('The list loaded successfully', { duration: 1500 })
      isInitialLoad = false
      checkForUpdates()
    }

    updateSitesList()
  }

  const handleGetCheck = (e, { status, id, pathfile, filesize }) => {
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
    }
  }

  const handleGetProgress = (e, { id, load, filesize }) => {
    const idx = locallist.findIndex((it) => it.id === id || it.tempid === id)
    if (idx !== -1) {
      locallist[idx].load = load
      if (filesize) locallist[idx].filesize = filesize
    }
  }

  const handleGetVideo = (e, v) => {
    getdata = true

    if (v.error) {
      notifications.error('Failed to get video data', { duration: 2000 })
      window_video = false
      return
    }

    if (v.is_batch && v.batch_urls && v.batch_urls.length > 0) {
      window_video = false
      getdata = false
      batchUrls = v.batch_urls
      batchModalOpen = true
      batchQuality = 'max'
      batchDelay = 4000
      notifications.info(`Found ${v.batch_urls.length} videos in album`, { duration: 3000 })
      return
    }

    window_video = true
    updateList(v)
  }

  const handleDeletedItem = (e, { id }) => {
    notifications.success('Item removed', { duration: 2000 })
  }

  // --- Helper Functions ---
  const parseCreatedAtCache = new Map()
  const formatTimeCache = new Map()
  const bytesToSizeCache = new Map()
  const siteColorCache = new Map()

  function sameItem(a, b) {
    if (!a || !b) return false
    if (a.tempid != null && b.tempid != null) return a.tempid === b.tempid
    if (a.id != null && b.id != null) return a.id === b.id
    if (a.url && b.url) return a.url === b.url
    return false
  }

  function parseCreatedAt(val) {
    if (parseCreatedAtCache.has(val)) return parseCreatedAtCache.get(val)
    let result = 0
    if (!val) result = 0
    else if (val instanceof Date) result = val.getTime()
    else if (typeof val === 'number') result = val
    else if (typeof val === 'string') {
      const iso = val.includes('T') ? val : val.replace(' ', 'T')
      const t = new Date(iso).getTime()
      if (!isNaN(t)) result = t
      else {
        const t2 = new Date(val).getTime()
        result = isNaN(t2) ? 0 : t2
      }
    } else {
      try {
        const t = new Date(val).getTime()
        result = isNaN(t) ? 0 : t
      } catch {
        result = 0
      }
    }
    parseCreatedAtCache.set(val, result)
    return result
  }

  function format_time(time, secondTime) {
    const cacheKey = `${time}|${secondTime}`
    if (formatTimeCache.has(cacheKey)) return formatTimeCache.get(cacheKey)
    const secondsTimeTrack = secondTime ? time : toSeconds(time)
    const hours = Math.floor(secondsTimeTrack / 3600)
    const minutes = Math.floor((secondsTimeTrack % 3600) / 60)
    const seconds = Math.floor(secondsTimeTrack % 60)
    const result = `${hours > 0 ? hours + 'h ' : ''}${minutes > 0 ? minutes + 'm ' : ''}${seconds > 0 ? seconds + 's' : ''}`
    formatTimeCache.set(cacheKey, result)
    return result
  }

  function bytesToSize(bytes) {
    if (bytesToSizeCache.has(bytes)) return bytesToSizeCache.get(bytes)
    var sizes = ['B', 'K', 'M', 'G', 'T', 'P']
    var b = bytes
    for (var i = 0; i < sizes.length; i++) {
      if (b <= 1024) {
        const result = Math.round(b) + ' ' + sizes[i]
        bytesToSizeCache.set(bytes, result)
        return result
      }
      b = parseFloat(b / 1024).toFixed(2)
    }
    const result = b + ' P'
    bytesToSizeCache.set(bytes, result)
    return result
  }

  function toSeconds(timemark) {
    if (!timemark) return 0
    const parts = timemark.split(':')
    if (parts.length < 3) return 0
    const [hh, mm, ss] = parts
    const seconds = parseFloat(ss) + (parseInt(mm, 10) || 0) * 60 + (parseInt(hh, 10) || 0) * 3600
    return isNaN(seconds) ? 0 : seconds
  }

  function copytext(text) {
    navigator.clipboard.writeText(text)
    notifications.success('copied url', { duration: 2500 })
  }

  function siteColor(site) {
    if (siteColorCache.has(site)) return siteColorCache.get(site)
    const color =
      sites.find((it) => it.value.toLowerCase() === site.toLowerCase())?.color || '#242424b0'
    siteColorCache.set(site, color)
    return color
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
      referer = v.referer
      proxy_method_video = v.proxy_method || false
      quality_list =
        v.list_quality && v.list_quality.length > 0
          ? v.list_quality.sort((a, b) => b.quality - a.quality)
          : [{ url: '', quality: 'original', size: '' }]
      selected_quality = quality_list[0]?.url || ''
      subtitle_list = v.subtitles || []
      selected_subtitle = ''

      setTimeout(() => {
        getdata = false
      }, 1500)
    }
  }

  function handleDuration(seconds) {
    if (seconds > 0 && (!time_video || time_video === '0:0:0' || time_video === '')) {
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      const s = Math.floor(seconds % 60)
      time_video = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
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

  // --- Settings Functions ---

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

  function closeSettings() {
    settings_open = false
  }

  function saveSettings() {
    localStorage.setItem('app_settings', JSON.stringify(settings))
    window.electron.ipcRenderer.send('updateSettings', JSON.stringify(settings))
    notifications.success('Settings saved', { duration: 2000 })
    settings_open = false
  }

  function clearLocalStorage() {
    localStorage.clear()
    settings = {
      default_format: 'mkv',
      concurrent_downloads: 3,
      namefile_type: 'video_title',
      threads: '1',
      ffmpeg_path: '',
      download_folder: '',
      use_embed: false,
      extension_branch: 'main',
      dev_auto_sync: false,
      custom_ffmpeg_params: '',
      organize_by_site: false,
      telegram_enabled: false,
      telegram_token: ''
    }
    notifications.success('LocalStorage cleared and settings reset', { duration: 2000 })
  }

  function UpdateStateApp(s) {
    window.electron.ipcRenderer.send('setState', s)
  }

  const window_close = () => (window_video = false)

  // --- Extension Functions ---

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
            proxy_method: ext.config.proxy_method || false,
            requiresExtension: true
          })
        }
      })
    }

    loadedSites.sort((a, b) => a.label.localeCompare(b.label))

    const historySites = [...new Set(locallist.map((item) => item.site).filter(Boolean))]
    historySites.sort((a, b) => a.localeCompare(b))

    const loadedSiteValues = new Set(loadedSites.map((s) => s.value.toLowerCase()))
    const historySiteOptions = historySites
      .filter((site) => !loadedSiteValues.has(site.toLowerCase()))
      .map((site) => ({
        value: site,
        label: site,
        color: '#666666',
        requiresExtension: false
      }))

    sites = [...loadedSites, ...historySiteOptions]
  }

  async function reloadExtensions() {
    notifications.info('Reloading extensions...', { duration: 1500 })
    try {
      extensions_status = await window.electron.ipcRenderer.invoke('reload-extensions')
      updateSitesList()
      notifications.success('Extensions reloaded', { duration: 2000 })
    } catch (e) {
      notifications.error('Failed to reload extensions')
    }
  }

  function isExtensionLoaded(siteName) {
    return extensions_status.loaded && extensions_status.loaded[siteName]
  }

  async function checkForUpdates() {
    isCheckingUpdates = true
    try {
      availableUpdates = await window.electron.ipcRenderer.invoke(
        'check-for-extension-updates',
        settings.extension_branch || 'main'
      )
      if (availableUpdates.length > 0) {
        notifications.info(`${availableUpdates.length} extension updates available`, {
          duration: 3000
        })
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
      const success = await window.electron.ipcRenderer.invoke('update-extension', {
        name: extension.name,
        branch: settings.extension_branch || 'main'
      })
      if (success) {
        notifications.success(`Updated ${extension.name} successfully`, { duration: 2000 })

        availableUpdates = availableUpdates.filter((u) => u.name !== extension.name)

        await reloadExtensions()
      } else {
        notifications.error(`Failed to update ${extension.name}`)
      }
    } catch (error) {
      notifications.error(`Error updating ${extension.name}`)
    }
  }

  async function syncExtensions() {
    try {
      const result = await window.electron.ipcRenderer.invoke('copy-extensions-to-documents')
      if (result.success) {
        notifications.success(`Synced ${result.count || 0} extensions to Documents`, {
          duration: 2000
        })
        await reloadExtensions()
      } else {
        notifications.error(result.error || 'Failed to sync extensions')
      }
    } catch (err) {
      console.error(err)
      notifications.error('Error syncing extensions')
    }
  }

  // --- Download & Batch ---

  function getVideo() {
    window_video = false
    video_test = ''
    time_video = ''
    thumb_video = ''
    title_video = ''
    embed = ''
    referer = ''
    proxy_method_video = false
    subtitle_list = []
    selected_subtitle = ''
    getdata = true
    window.electron.ipcRenderer.send('getVideo', { url: url })
    notifications.info('Obtaining data', { duration: 2000 })
  }

  function startDownload() {
    if (getdata == false && quality_list.length > 0 && quality_list[0].url) {
      const qualityItem = quality_list.find((item) => item.url == selected_quality)
      if (!qualityItem) return

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
        referer: referer,
        quality: qualityItem.quality,
        created_at: new Date().toISOString(),
        status: 0
      }

      activeTab = 'downloading'
      locallist = [newItem, ...locallist]

      window_close()
      let subtitleUrl = ''
      let subtitleLanguage = ''
      let subtitlesAll = []
      if (selected_subtitle === 'all') {
        subtitlesAll = subtitle_list
      } else if (selected_subtitle) {
        const subItem = subtitle_list.find((s) => s.url === selected_subtitle)
        if (subItem) {
          subtitleUrl = subItem.url
          subtitleLanguage = subItem.language
        }
      }
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
        referer: referer,
        quality: qualityItem ? qualityItem.quality : 'original',
        subtitle_url: subtitleUrl,
        subtitle_language: subtitleLanguage,
        subtitles_all: subtitlesAll,
        proxy_method: proxy_method_video
      })
      url = ''
      window.document.querySelector('.scroll').scrollTo({ top: 0 })
      notifications.success('Starting Download', { duration: 3000 })
    }
  }

  function removeItem(item) {
    const key = item.id ?? item.tempid
    if (item.status === 1) {
      try {
        notifications.success('Download cancelled', { duration: 2000 })
        window.electron.ipcRenderer.send('cancelDownload', { id: item.id ?? item.tempid })
      } catch {}
    }
    locallist = locallist.filter((i) => (i.id ?? i.tempid) !== key)
    if (item.id) {
      window.electron.ipcRenderer.send('deleteItem', { id: item.id })
    }
  }

  function cancelDownloadItem(id) {
    try {
      notifications.info('Cancelling download...', { duration: 2000 })
      window.electron.ipcRenderer.send('cancelDownload', { id })
    } catch (err) {
      console.error(err)
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
        notifications.error('Error reading file')
      }
    } catch {
      notifications.error('Failed to open file')
    }
  }

  async function startBatchProcessing() {
    batchModalOpen = false
    batchProgress = { total: batchUrls.length, processed: 0, remaining: batchUrls.length }
    try {
      const urlsToProcess = batchSkipCount > 0 ? batchUrls.slice(batchSkipCount) : batchUrls

      const args = JSON.parse(
        JSON.stringify({
          urls: urlsToProcess,
          quality: batchQuality,
          delay: batchDelay
        })
      )

      await window.electron.ipcRenderer.invoke('start-batch-download', args)

      notifications.success(
        `Processing ${urlsToProcess.length} links (skipped ${batchSkipCount})...`,
        {
          duration: 3000
        }
      )
    } catch (err) {
      console.error(err)
      notifications.error('Failed to start batch')
    }
  }

  function handleDragOver(e) {
    e.preventDefault()
    isDraggingOver = true
  }

  function handleDragLeave(e) {
    e.preventDefault()
    isDraggingOver = false
  }

  function handleDrop(e) {
    e.preventDefault()
    isDraggingOver = false

    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      const file = files[0]
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        const reader = new FileReader()
        reader.onload = (event) => {
          const content = event.target?.result
          if (typeof content === 'string') {
            const urls = content
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter((line) => line.startsWith('http'))

            if (urls.length === 1) {
              url = urls[0]
              getVideo()
              notifications.info('Starting download...', { duration: 2000 })
            } else if (urls.length > 1) {
              batchUrls = urls
              batchModalOpen = true
              batchQuality = 'max'
              batchDelay = 4000
              notifications.info(`Found ${urls.length} URLs to import`, { duration: 2000 })
            } else {
              notifications.error('No valid URLs found in file')
            }
          }
        }
        reader.readAsText(file)
      } else {
        const text = e.dataTransfer?.getData('text')
        if (text) {
          const urls = text.split(/\s+/).filter((line) => line.startsWith('http'))

          if (urls.length === 1) {
            url = urls[0]
            getVideo()
            notifications.info('Starting download...', { duration: 2000 })
          } else if (urls.length > 1) {
            batchUrls = urls
            batchModalOpen = true
            batchQuality = 'max'
            batchDelay = 4000
            notifications.info(`Found ${urls.length} URLs to import`, { duration: 2000 })
          }
        }
      }
    }
  }
</script>

<NotificationToast />
<UpdateNotification />

{#if isDraggingOver}
  <div
    class="fixed inset-0 z-50 bg-orange-500/20 border-4 border-dashed border-orange-500 flex items-center justify-center pointer-events-none"
  >
    <div class="text-center">
      <svg
        class="w-16 h-16 mx-auto text-orange-500 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <p class="text-2xl font-bold text-orange-500">Drop URLs here to batch download</p>
    </div>
  </div>
{/if}

{#if showSettingsPrompt}
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
    <div class="bg-[#252525] rounded-lg shadow-xl max-w-md w-full p-6 border border-orange-500/50">
      <div class="flex items-start gap-3 mb-4">
        <TriangleAlertIcon class="h-6 w-6 text-orange-400 mt-0.5 shrink-0" />
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
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-99999 p-4">
    <div class="bg-[#252525] rounded-lg shadow-xl max-w-sm w-full p-6 border border-[#3d3d3d]">
      <h3 class="text-lg font-semibold text-white mb-1">Batch Import</h3>
      <p class="text-gray-400 text-sm mb-4">Found {batchUrls.length} links to process.</p>

      <div class="space-y-4">
        <div>
          <label for="quality" class="text-xs font-medium text-gray-300 block mb-1.5"
            >Video Quality</label
          >
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
          <label for="delay" class="text-xs font-medium text-gray-300 block mb-1.5"
            >Delay between downloads (ms)</label
          >
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

        <div>
          <label for="skip" class="text-xs font-medium text-gray-300 block mb-1.5"
            >Skip first N links</label
          >
          <input
            type="number"
            id="skip"
            bind:value={batchSkipCount}
            min="0"
            max={batchUrls.length - 1}
            class="w-full bg-[#1B1B1B] border border-[#3d3d3d] text-white text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block p-2.5 outline-none placeholder-gray-500"
            placeholder="0"
          />
          <p class="text-xs text-gray-500 mt-1">
            Skip first {batchSkipCount} links, will process {batchUrls.length - batchSkipCount} links.
          </p>
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
          class="px-4 py-2 bg-linear-to-r from-[#FF9027] to-[#FF6B00] hover:from-[#FF9C3F] hover:to-[#FF7B1C] text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-orange-900/20"
        >
          Start Import
        </button>
      </div>
    </div>
  </div>
{/if}

<div
  class="w-full h-10 bg-[#202020] flex items-center justify-between top-0 left-0 right-0 absolute move z-99 pl-3"
>
  <div class="flex items-center gap-4">
    <div class="flex items-center gap-2">
      <img src={LogoIcon} alt="" class="w-5 h-5" />
      <div class="flex items-baseline gap-1.5">
        <h1 class="text-white text-sm font-medium">Horny Downloaders</h1>
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
        <option value="" disabled>Auto Detect</option>
        <option value="" disabled>---</option>
        {#each sites as site}
          <option
            value={site.value}
            class="bg-[#1B1B1B]"
            disabled={site.requiresExtension && !isExtensionLoaded(site.value)}
            title={site.proxy_method ? 'Uses local proxy to bypass Cloudflare/CDN protection' : ''}
          >
            {site.label}{site.proxy_method ? ' [PROXY]' : ''}
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
        class="px-5 py-2.5 bg-linear-to-r from-[#FF9027] to-[#FF6B00] disabled:from-[#FF9027] disabled:to-[#FF6B00] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#FF9C3F] hover:to-[#FF7B1C] text-white font-medium rounded-lg flex items-center gap-2 transition-all duration-200 transform hover:scale-105 active:scale-95 focus:outline-none shadow-lg hover:shadow-[#FF9027]/20"
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
        bind:value={siteFilter}
        class="appearance-none bg-[#1B1B1B] border-2 border-[#2d2d2d] hover:border-[#3d3d3d] focus:border-[#FF9027] focus:ring-1 focus:ring-[#FF9027]/50 rounded-lg pl-8 pr-7 py-1.5 text-xs font-medium text-gray-300 transition-all cursor-pointer outline-none min-w-[110px]"
      >
        <option value="all">All Sites</option>
        <option value="" disabled>---</option>
        {#each sites as site}
          <option value={site.value}>{site.label}</option>
        {/each}
      </select>
      <div class="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
        <svg
          class="h-3.5 w-3.5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      </div>
      <div class="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <svg class="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>

    <div class="relative">
      <select
        bind:value={searchType}
        class="appearance-none bg-[#1B1B1B] border-2 border-[#2d2d2d] hover:border-[#3d3d3d] focus:border-[#FF9027] focus:ring-1 focus:ring-[#FF9027]/50 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium text-gray-300 transition-all cursor-pointer outline-none"
      >
        <option value="title">Title</option>
        <option value="url">URL</option>
      </select>
      <div class="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <svg class="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <svg class="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      class="p-1.5 rounded-lg bg-[#1B1B1B] border-2 border-[#2d2d2d] hover:border-[#3d3d3d] text-gray-400 hover:text-white transition-all duration-200"
      title={sortDirection === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
    >
      {#if sortDirection === 'asc'}
        <ArrowUpNarrowWide class="w-4 h-4" />
      {:else}
        <ArrowDownWideNarrow class="w-4 h-4" />
      {/if}
    </button>

    <div class="flex bg-[#1B1B1B] rounded-lg border-2 border-[#2d2d2d] p-0.5 shrink-0">
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

    <div class="flex bg-[#1B1B1B] rounded-lg border-2 border-[#2d2d2d] p-0.5 shrink-0">
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

<main
  class="w-full h-full flex flex-col justify-center items-center text-sm"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
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
              <div class="flex flex-col gap-4">
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
                      <option value="site_title">Site - Title</option>
                      <option value="title_site">Title - Site</option>
                      <option value="date_title">Date - Title</option>
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

                <div class="space-y-1.5">
                  <label
                    for="setting-custom-ffmpeg"
                    class="block text-sm font-medium text-gray-200"
                  >
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
                  <p class="text-xs text-gray-500">
                    FFmpeg output flags appended to every download.
                  </p>
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
                            if (settings.dev_auto_sync) syncExtensions()
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
                    >
                      <option value="main">Main (Stable)</option>
                      <option value="dev">Dev (Beta)</option>
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
                          {#if info.config?.proxy_method}
                            <span class="inline-flex items-center px-1.5 py-0.5 ml-1 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30" title="Downloads segments via browser to bypass Cloudflare/CDN protection">PROXY</span>
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
              class="px-5 py-2 text-sm font-medium text-white bg-linear-to-r from-[#FF9027] to-[#FF6B00] hover:from-[#FF9C3F] hover:to-[#FF7B1C] rounded-lg transition-all duration-200 transform hover:scale-105 focus:ring-offset-2 focus:ring-offset-[#1e1e1e] shadow-lg hover:shadow-[#FF9027]/20"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <div
    bind:this={listContainer}
    class="w-full flex-1 mt-[12em] px-6 pb-8 overflow-y-auto custom-scrollbar scroll relative"
    onscroll={handleScroll}
  >
    <span
      class="fixed left-0 bottom-0 m-6 z-20 px-3 py-1.5 bg-[#1B1B1B]/60 border-[#2d2d2d] text-sm font-medium rounded-full backdrop-blur-sm border shadow-lg"
    >
      {locallist.length} videos
    </span>
    {#if batchProgress.total > 0}
      <span
        class="fixed left-0 bottom-0 m-6 mb-16 z-20 px-3 py-1.5 bg-[#1B1B1B]/60 border-[#2d2d2d] text-sm font-medium rounded-full backdrop-blur-sm border shadow-lg"
      >
        batch: {batchProgress.processed}/{batchProgress.total}
      </span>
    {/if}
    <div
      class="grid {viewMode === 'grid'
        ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4'
        : 'grid-cols-1 gap-3'} max-w-6xl mx-auto"
    >
      {#if currentDownloading}
        <div
          class="group bg-[#1e1e1e] border border-[#2d2d2d] hover:border-[#3d3d3d] rounded-xl p-3 transition-all duration-200 col-span-1"
        >
          <div class="flex {viewMode === 'grid' ? 'flex-col gap-3' : 'gap-4'} items-start">
            <div
              class="relative shrink-0 {viewMode === 'grid'
                ? 'w-full aspect-video'
                : 'w-32 h-20'} rounded-lg overflow-hidden bg-[#252525] border border-[#3a3a3a] group-hover:border-[#4a4a4a] transition-colors"
            >
              <img
                src={currentDownloading.thumb.includes('http')
                  ? currentDownloading.thumb
                  : 'hornydl://' + currentDownloading.thumb.replace(/\\/g, '/')}
                alt={currentDownloading.title}
                loading="lazy"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              {#if currentDownloading.status == 1}
                <div class="absolute bottom-0 left-0 right-0 h-1.5 bg-[#2d2d2d] overflow-hidden">
                  <div
                    class="h-full bg-linear-to-r from-[#FF9027] to-[#FF6B00] transition-all duration-300"
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
                        <span>
                          {#if currentDownloading.quality == 'original'}
                            Original
                          {:else}
                            {!currentDownloading.quality.includes('k')
                              ? `${currentDownloading.quality}p`
                              : currentDownloading.quality}
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
                <div class="flex items-center gap-2">
                  <button
                    onclick={() =>
                      cancelDownloadItem(currentDownloading.id || currentDownloading.tempid)}
                    class="shrink-0 p-1 bg-red-500/20 text-red-400 rounded-md border border-red-500/30 hover:bg-red-500/40 transition-colors self-start"
                    title="Cancel download"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect x="6" y="6" width="12" height="12" rx="1.5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}
      {#each paginatedListWithoutCurrent as item (item.id ?? item.tempid)}
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
                    style={`background-color: ${siteColor(item.site)}10; color: ${siteColor(item.site)}; border-color: ${siteColor(item.site)}`}
                  >
                    {item.site}
                  </span>
                  <div class="flex items-center gap-1 shrink-0">
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
      {#if loadMore}
        <div class="col-span-full text-center py-4">
          <span class="text-gray-500 text-sm">Loading more...</span>
        </div>
      {/if}
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
              {#if PlayerComponent}
                <svelte:component
                  this={PlayerComponent}
                  useEmbed={settings.use_embed}
                  embedUrl={embed}
                  src={video_test}
                  poster={thumb_video}
                  title={title_video}
                  onDuration={handleDuration}
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
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0" title="Downloads segments via browser to bypass Cloudflare/CDN protection">
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
