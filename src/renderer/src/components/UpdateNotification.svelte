<script>
  import { onMount } from 'svelte'

  import { XIcon, ArrowUpCircle } from 'lucide-svelte'
  import { notifications } from './NotificationStore'
  import { updateBanner,showUpdateBanner } from './store'

  let downloadProgress = 0
  let updateInfo = null

  const handleUpdateAvailable = (e,info) => {
    updateInfo = info
    updateBanner.set(true)
  }

  const downloadUpdate = async () => {
    try {
      await window.api.updater.downloadUpdate()
      
    } catch (error) {
      console.error('Error downloading update:', error)
      notifications.error('Failed to download update', { duration: 2000 });
      showUpdateBanner.set(false)
    }
  }

  const installUpdate = async () => {
    try {
      await window.api.updater.restartAndUpdate()
    } catch (error) {
      console.error('Error installing update:', error)
      notifications.error('Failed to install update', { duration: 2000 });
      showUpdateBanner.set(true)
    }
  }

  const dismissBanner = () => {
    showUpdateBanner.set(false)
  }

  onMount(() => {
    window.api.updater.checkForUpdates()
    window.api.updater.onUpdateDownloaded(installUpdate)
    
    window.api.updater.onUpdateAvailable(handleUpdateAvailable)

    return () => {
      window.api.updater.onUpdateAvailable(null)
      window.api.updater.onUpdateDownloaded(null)
    }
  })
  updateBanner.subscribe((value) => {
    updateBanner.set(value)
  })
  showUpdateBanner.subscribe((value) => {
    showUpdateBanner.set(value)
  })
</script>

{#if $showUpdateBanner && $updateBanner && updateInfo}
  <div class="fixed bottom-4 right-4 bg-[#282828] text-white p-4 rounded-lg shadow-lg max-w-md z-50 animate-fade-in">
    <div class="flex justify-between items-start mb-2">
      <h3 class="font-bold text-lg flex items-center">
        <ArrowUpCircle class="w-5 h-5 mr-2" />
        Update Available: v{updateInfo.version}
      </h3>
      <button
        onclick={dismissBanner}
        class="text-white hover:bg-[#313131] rounded-full p-1 -mt-1 -mr-1"
      >
        <XIcon class="w-4 h-4" />
      </button>
    </div>
    
    <p class="text-sm mb-3">A new version is available. Would you like to download it now?</p>
    
    <div class="flex justify-end space-x-2">
      <button
        onclick={dismissBanner}
        class="px-3 py-1 text-sm bg-[#484848] hover:bg-[#313131] rounded"
      >
        Later
      </button>
      <button
        onclick={downloadUpdate}
        class="px-3 py-1 text-sm bg-[#FF9027] hover:bg-[#FF9027]/50 rounded"
        disabled={downloadProgress > 0 && downloadProgress < 100}
      >
        {downloadProgress > 0 && downloadProgress < 100
          ? `Downloading... ${downloadProgress}%`
          : 'Download Now'}
      </button>
    </div>
  </div>
{/if}