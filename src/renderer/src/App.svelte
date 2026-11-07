<script>
  import { onMount, tick } from 'svelte'

  let PlayerComponent = $state(null)
  import('./components/player/Player.svelte').then((m) => (PlayerComponent = m.default))

  import NotificationToast from './components/NotificationToast.svelte'
  import UpdateNotification from './components/UpdateNotification.svelte'
  import { updateBanner, showUpdateBanner } from './components/store'
  import { notifications } from './components/NotificationStore'
  import BatchImportModal from './components/BatchImportModal.svelte'
  import SettingsModal from './components/SettingsModal.svelte'
  import DownloadItem from './components/DownloadItem.svelte'
  import DownloadOptionsModal from './components/DownloadOptionsModal.svelte'
  import { parseCreatedAt, toSeconds, sameItem, format_time } from './lib/format'
  import { createBatchItem } from './lib/batch'

  // --- Icons & Assets ---
  import {
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
    FileText
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
  let remoteExtensions = $state([])
  let isInstalling = $state(false)

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
  let fetching_video = $state(false)

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
  let batchItems = $state([])
  let batchUrls = $derived(batchItems.map((item) => item.url))
  let batchQuality = $state('max')
  let batchFormat = $state('mkv')
  let batchDelay = $state(12000)
  let batchSkipCount = $state(0)
  let batchSubtitleMode = $state('none')
  let batchSubtitleLanguage = $state('')
  let batchProgress = $state({
    total: 0,
    processed: 0,
    remaining: 0,
    status: '',
    currentUrl: ''
  })
  let batchResolving = $state(false)
  let batchPreview = $state(null)
  let batchPreviewUrl = $state('')
  let batchPreviewLoading = $state(false)
  let batchResolveToken = 0
  let isDraggingOver = $state(false)

  let batchResolvedCount = $derived(batchItems.filter((item) => item.resolved).length)
  let batchFailedCount = $derived(batchItems.filter((item) => item.status === 'failed').length)
  let batchPreviewItem = $derived(
    batchItems.find((item) => item.url === batchPreviewUrl) || batchItems[0] || null
  )
  let batchPreviewTitle = $derived(
    batchPreviewItem?.title || batchPreview?.title || 'No preview available'
  )
  let batchPreviewSource = $derived(
    batchPreview?.video_test
      ? batchPreview.force_type
        ? { src: batchPreview.video_test, type: batchPreview.force_type }
        : { src: batchPreview.video_test }
      : ''
  )
  let batchSubtitleLanguages = $derived([
    ...new Set(
      (batchPreview?.subtitles || [])
        .map((subtitle) => subtitle.language)
        .filter((language) => !!language)
    )
  ])
  let batchProcessCount = $derived(Math.max(0, batchUrls.length - (Number(batchSkipCount) || 0)))
  let batchProgressLabel = $derived.by(() => {
    if (!batchProgress.total) return ''
    const currentItem = batchItems.find((item) => item.url === batchProgress.currentUrl)
    const name = currentItem?.title || batchProgress.lastTitle || ''
    const progress = `batch: ${batchProgress.processed}/${batchProgress.total}`
    return name ? `${progress} · ${name}` : progress
  })

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
      if (data.currentUrl) {
        const item = batchItems.find((entry) => entry.url === data.currentUrl)
        if (item) item.status = 'processing'
      }
      if (data.lastUrl && data.lastStatus) {
        const item = batchItems.find((entry) => entry.url === data.lastUrl)
        if (item) {
          item.status = data.lastStatus
          if (data.lastTitle) item.title = data.lastTitle
          if (data.error) item.error = data.error
        }
      }
      if (data.status === 'finished') {
        notifications.success(`Batch finished: ${data.processed} links processed`, {
          duration: 3000
        })
      }
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
    window.electron.ipcRenderer.removeAllListeners('batch-progress')
    window.electron.ipcRenderer.removeAllListeners('telegram-url-received')
    window.electron.ipcRenderer.removeAllListeners('telegram-download-start')
  }

  const handleGetList = (e, v) => {
    const newList = v.sort((a, b) => parseCreatedAt(b.created_at) - parseCreatedAt(a.created_at))

    // Index the current list once instead of scanning it for every incoming row (was O(n²)).
    const byId = new Map()
    const byTempid = new Map()
    const byUrlStatus = new Map()
    for (const it of locallist) {
      if (it.id != null && !byId.has(it.id)) byId.set(it.id, it)
      if (it.tempid != null && !byTempid.has(it.tempid)) byTempid.set(it.tempid, it)
      if (it.url != null) {
        const key = `${it.url}::${it.status}`
        if (!byUrlStatus.has(key)) byUrlStatus.set(key, it)
      }
    }

    locallist = newList.map((item) => {
      const existing =
        (item.id != null && byId.get(item.id)) ||
        (item.tempid != null && byTempid.get(item.tempid)) ||
        (item.url != null && byUrlStatus.get(`${item.url}::${item.status}`)) ||
        undefined

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
    fetching_video = false

    if (v.error) {
      const message = typeof v.error === 'string' ? v.error : v.error?.message
      notifications.error(message || 'Failed to get video data', { duration: 4500 })
      window_video = false
      getdata = false
      return
    }

    if (v.is_batch && v.batch_urls && v.batch_urls.length > 0) {
      window_video = false
      getdata = false
      if (openBatchModal(v.batch_urls, { albumTitle: v.title })) {
        notifications.info(`Found ${v.batch_urls.length} videos in album`, { duration: 3000 })
      }
      return
    }

    window_video = true

    if (!updateList(v)) {
      window_video = false
      getdata = false
      notifications.error(v.error_message || `This video is not available (status ${v.status})`, {
        duration: 4500
      })
    }
  }

  const handleDeletedItem = (e, { id }) => {
    notifications.success('Item removed', { duration: 2000 })
  }

  // --- Helper Functions ---
  const siteColorCache = new Map()

  function copytext(text) {
    navigator.clipboard.writeText(text)
    notifications.success('copied url', { duration: 2500 })
  }

  function siteColor(site) {
    if (siteColorCache.has(site)) return siteColorCache.get(site)
    let color =
      sites.find((it) => it.value.toLowerCase() === site.toLowerCase())?.color || '#242424b0'
    if (color.length === 9) color = color.slice(0, 7)
    siteColorCache.set(site, color)
    return color
  }

  function updateList(v) {
    if (v.status != 200) return false

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

    return true
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

  async function updateAllExtensions() {
    const updates = [...availableUpdates]
    if (updates.length === 0) return
    notifications.info(`Updating ${updates.length} extensions...`, { duration: 2000 })
    for (const ext of updates) {
      try {
        await window.electron.ipcRenderer.invoke('update-extension', {
          name: ext.name,
          branch: settings.extension_branch || 'main'
        })
        availableUpdates = availableUpdates.filter((u) => u.name !== ext.name)
      } catch {}
    }
    notifications.success(`All extensions updated`, { duration: 2000 })
    await reloadExtensions()
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

  async function fetchRemoteExtensions() {
    try {
      const allRemote = await window.electron.ipcRenderer.invoke(
        'list-remote-extensions',
        settings.extension_branch || 'main'
      )

      const localFiles = await window.electron.ipcRenderer.invoke('list-local-extensions')
      const localNames = new Set(localFiles)

      remoteExtensions = allRemote.filter((r) => !localNames.has(r.name))
    } catch (error) {
      console.error('Error fetching remote extensions:', error)
    }
  }

  async function installExtension(ext) {
    isInstalling = true
    try {
      notifications.info(`Installing ${ext.displayName}...`, { duration: 2000 })
      const success = await window.electron.ipcRenderer.invoke('install-extension', {
        name: ext.name,
        branch: settings.extension_branch || 'main',
        fileName: ext.fileName
      })
      if (success) {
        notifications.success(`Installed ${ext.displayName}`, { duration: 2000 })
        remoteExtensions = remoteExtensions.filter((e) => e.name !== ext.name)
        await reloadExtensions()
      } else {
        notifications.error(`Failed to install ${ext.displayName}`)
      }
    } catch (error) {
      notifications.error(`Error installing ${ext.displayName}`)
    } finally {
      isInstalling = false
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
    fetching_video = true
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

  function openBatchModal(urls, { albumTitle = '' } = {}) {
    const cleanUrls = [
      ...new Set(
        (urls || []).filter(
          (rawUrl) => typeof rawUrl === 'string' && /^https?:\/\//i.test(rawUrl.trim())
        )
      )
    ]

    if (cleanUrls.length === 0) {
      notifications.error('No valid links found')
      return false
    }

    batchResolveToken++
    batchItems = cleanUrls.map((rawUrl) => createBatchItem(rawUrl.trim(), albumTitle))
    batchModalOpen = true
    batchQuality = 'max'
    batchFormat = settings.default_format || 'mkv'
    batchDelay = 4000
    batchSkipCount = 0
    batchSubtitleMode = 'none'
    batchSubtitleLanguage = ''
    batchProgress = {
      total: 0,
      processed: 0,
      remaining: 0,
      status: '',
      currentUrl: ''
    }
    batchPreview = null
    batchPreviewUrl = cleanUrls[0]
    batchPreviewLoading = true
    batchResolving = false
    resolveBatchMetadata()
    return true
  }

  async function resolveBatchItem(index, token) {
    const item = batchItems[index]
    if (!item) return
    if (token !== batchResolveToken) return
    if (item.resolving && item.resolveToken === token) return

    item.resolving = true
    item.resolveToken = token
    if (item.status === 'pending' || item.status === 'failed') item.status = 'resolving'

    try {
      const result = await window.electron.ipcRenderer.invoke('resolve-video-metadata', {
        url: item.url
      })

      if (token !== batchResolveToken) return

      if (result?.success) {
        item.meta = result
        item.resolved = true
        item.isAlbum = !!result.is_batch
        item.albumCount = result.batch_urls?.length || 0
        item.title = result.title || item.title
        item.thumb = result.thumb || ''
        item.site = result.site || ''
        item.duration = result.time || ''
        item.quality = result.list_quality?.[0]?.quality || ''
        item.error = ''

        if (item.isAlbum) {
          item.status = 'album'
          item.title = result.title
            ? `${result.title} · album (${item.albumCount})`
            : `Album · ${item.albumCount} links`
        } else {
          item.status = 'ready'
        }

        if (item.url === batchPreviewUrl) {
          batchPreview = result
        }
      } else {
        item.resolved = false
        item.status = 'failed'
        item.error = result?.error || 'Could not load metadata'
      }
    } catch (error) {
      if (token !== batchResolveToken) return
      item.resolved = false
      item.status = 'failed'
      item.error = error?.message || 'Could not load metadata'
    } finally {
      if (item.resolveToken === token) {
        item.resolving = false
      }
      if (token === batchResolveToken && item.url === batchPreviewUrl) {
        batchPreviewLoading = false
      }
    }
  }

  async function resolveBatchMetadata({ onlyFailed = false } = {}) {
    if (batchItems.length === 0) return

    const token = ++batchResolveToken
    batchResolving = true

    const pending = batchItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (onlyFailed ? item.status === 'failed' : !item.resolved))

    if (pending.length === 0) {
      batchResolving = false
      return
    }

    if (!batchPreviewUrl) batchPreviewUrl = batchItems[0]?.url || ''

    const previewIndex = pending.findIndex((entry) => entry.item.url === batchPreviewUrl)
    const previewEntry = previewIndex >= 0 ? pending.splice(previewIndex, 1)[0] : null

    if (previewEntry) {
      batchPreviewLoading = !batchPreview
      await resolveBatchItem(previewEntry.index, token)
      batchPreviewLoading = false
    }

    let cursor = 0
    const worker = async () => {
      while (token === batchResolveToken) {
        const entry = pending[cursor++]
        if (!entry) return
        await resolveBatchItem(entry.index, token)
      }
    }

    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker))

    if (token === batchResolveToken) {
      batchResolving = false
      batchPreviewLoading = false
    }
  }

  async function selectBatchPreview(index) {
    const item = batchItems[index]
    if (!item) return

    batchPreviewUrl = item.url

    if (item.meta) {
      batchPreview = item.meta
      batchPreviewLoading = false
      return
    }

    batchPreview = null
    batchPreviewLoading = true
    const token = batchResolveToken

    if (!item.resolving) {
      await resolveBatchItem(index, token)
    }

    if (batchPreviewUrl === item.url) batchPreviewLoading = false
  }

  function removeBatchItem(index) {
    const removed = batchItems[index]
    if (!removed) return

    const wasPreview = removed.url === batchPreviewUrl
    batchItems = batchItems.filter((_, itemIndex) => itemIndex !== index)

    if (batchItems.length === 0) {
      batchModalOpen = false
      batchPreview = null
      batchPreviewUrl = ''
      batchPreviewLoading = false
      batchSkipCount = 0
      return
    }

    if (batchSkipCount > batchItems.length - 1) {
      batchSkipCount = Math.max(0, batchItems.length - 1)
    }

    if (wasPreview) {
      const nextIndex = Math.min(index, batchItems.length - 1)
      const nextItem = batchItems[nextIndex]
      batchPreviewUrl = nextItem.url
      batchPreview = nextItem.meta || null
      if (!nextItem.meta) selectBatchPreview(nextIndex)
    }
  }

  function expandBatchAlbum(index) {
    const item = batchItems[index]
    const albumUrls = item?.meta?.batch_urls || []

    if (albumUrls.length === 0) {
      notifications.info('This album has no links to expand', { duration: 2000 })
      return
    }

    const existing = new Set(batchItems.map((entry) => entry.url))
    const additions = albumUrls
      .filter((albumUrl) => !existing.has(albumUrl))
      .map((albumUrl) => createBatchItem(albumUrl, item.meta?.title || item.albumTitle))

    if (additions.length === 0) {
      notifications.info('All album links are already in the list', { duration: 2000 })
      return
    }

    batchItems = [...batchItems.slice(0, index), ...additions, ...batchItems.slice(index + 1)]

    notifications.success(`Added ${additions.length} links from the album`, { duration: 2000 })
    resolveBatchMetadata()
  }

  async function openBatchImport() {
    try {
      const result = await window.electron.ipcRenderer.invoke('pick-batch-file')
      if (result.count > 0) {
        openBatchModal(result.urls)
      } else if (result.error) {
        notifications.error('Error reading file')
      }
    } catch {
      notifications.error('Failed to open file')
    }
  }

  async function startBatchProcessing() {
    const skipCount = Math.min(Math.max(0, Number(batchSkipCount) || 0), batchItems.length)
    const urlsToProcess = batchItems.slice(skipCount).map((item) => item.url)

    if (urlsToProcess.length === 0) {
      notifications.error('There are no links to process')
      return
    }

    const metadata = {}
    for (const item of batchItems) {
      metadata[item.url] = {
        title: item.title,
        thumb: item.thumb,
        site: item.site,
        time: item.duration,
        referer: item.meta?.referer || ''
      }
    }

    batchModalOpen = false
    batchProgress = {
      total: urlsToProcess.length,
      processed: 0,
      remaining: urlsToProcess.length,
      status: 'started',
      currentUrl: ''
    }

    batchItems.forEach((item, index) => {
      if (index < skipCount) {
        item.status = 'skipped'
      } else {
        item.status = 'queued'
      }
    })

    try {
      const args = JSON.parse(
        JSON.stringify({
          urls: urlsToProcess,
          quality: batchQuality,
          delay: Number(batchDelay) || 0,
          format: batchFormat,
          subtitleMode: batchSubtitleMode,
          subtitleLanguage: batchSubtitleLanguage,
          metadata
        })
      )

      await window.electron.ipcRenderer.invoke('start-batch-download', args)

      notifications.success(`Processing ${urlsToProcess.length} links (skipped ${skipCount})...`, {
        duration: 3000
      })
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
              if (openBatchModal(urls)) {
                notifications.info(`Found ${urls.length} URLs to import`, { duration: 2000 })
              }
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
            if (openBatchModal(urls)) {
              notifications.info(`Found ${urls.length} URLs to import`, { duration: 2000 })
            }
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
  <BatchImportModal
    {batchItems}
    {batchPreview}
    {batchPreviewItem}
    {batchPreviewUrl}
    {batchPreviewTitle}
    {batchPreviewSource}
    {batchPreviewLoading}
    {batchResolvedCount}
    {batchFailedCount}
    {batchResolving}
    {batchProcessCount}
    {batchSubtitleLanguages}
    bind:batchQuality
    bind:batchFormat
    bind:batchSubtitleMode
    bind:batchSubtitleLanguage
    bind:batchDelay
    bind:batchSkipCount
    {PlayerComponent}
    useEmbed={settings.use_embed}
    onResolve={resolveBatchMetadata}
    onSelect={selectBatchPreview}
    onRemove={removeBatchItem}
    onExpand={expandBatchAlbum}
    onStart={startBatchProcessing}
    onClose={() => (batchModalOpen = false)}
  />
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
        {#if availableUpdates.length > 0}
          <button
            onclick={updateAllExtensions}
            class="ml-1.5 px-2 py-0.5 no_move text-xs font-medium rounded-full bg-orange-600 text-white flex items-center gap-1.5 hover:bg-orange-700 transition-colors"
          >
            <span>Update all extensions ({availableUpdates.length})</span>
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
    <SettingsModal
      bind:settings
      {isDev}
      {availableUpdates}
      {extensions_status}
      bind:remoteExtensions
      {isInstalling}
      onClose={closeSettings}
      onSave={saveSettings}
      onClearStorage={clearLocalStorage}
      onUpdateExtension={updateExtension}
      onReloadExtensions={reloadExtensions}
      onFetchRemoteExtensions={fetchRemoteExtensions}
      onInstallExtension={installExtension}
      onCheckForUpdates={checkForUpdates}
      onSyncExtensions={syncExtensions}
    />
  {/if}

  <div
    bind:this={listContainer}
    class="w-full flex-1 mt-[12em] px-6 pb-8 overflow-y-auto scroll scroll relative"
    onscroll={handleScroll}
  >
    <span
      class="fixed left-0 bottom-0 m-6 z-20 px-3 py-1.5 bg-[#1B1B1B]/60 border-[#2d2d2d] text-sm font-medium rounded-full backdrop-blur-sm border shadow-lg"
    >
      {locallist.length} videos
    </span>
    {#if batchProgress.total > 0}
      <span
        class="fixed left-0 bottom-0 m-6 mb-16 z-20 max-w-[70vw] truncate px-3 py-1.5 bg-[#1B1B1B]/60 border-[#2d2d2d] text-sm font-medium rounded-full backdrop-blur-sm border shadow-lg"
        title={batchProgressLabel}
      >
        {batchProgressLabel}
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
        <DownloadItem
          {item}
          {viewMode}
          siteColorValue={siteColor(item.site)}
          onReveal={reveal}
          onCopy={copytext}
          onRemove={removeItem}
        />
      {/each}
      {#if loadMore}
        <div class="col-span-full text-center py-4">
          <span class="text-gray-500 text-sm">Loading more...</span>
        </div>
      {/if}
    </div>
  </div>
  {#if fetching_video}
    <div
      class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <div
        class="bg-[#1e1e1e] border border-[#3a3a3a] rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl"
      >
        <svg
          class="animate-spin h-10 w-10 text-[#FF9027]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          ></path>
        </svg>
        <span class="text-white text-sm font-medium">Loading video data...</span>
      </div>
    </div>
  {/if}
  {#if window_video}
    <DownloadOptionsModal
      {PlayerComponent}
      useEmbed={settings.use_embed}
      {embed}
      {video_test}
      {thumb_video}
      {title_video}
      {proxy_method_video}
      {subtitle_list}
      {time_video}
      {quality_list}
      bind:format_video
      bind:selected_quality
      bind:selected_subtitle
      {getdata}
      onClose={window_close}
      onStart={startDownload}
      onDuration={handleDuration}
    />
  {/if}
</main>
