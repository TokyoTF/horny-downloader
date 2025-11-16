<script>
  import { onMount } from 'svelte'
  import { Download, XIcon } from 'lucide-svelte'
  import { toast } from 'svelte-french-toast'

  let downloadProgress = 0
  let showUpdateBanner = false

  const checkForUpdates = async () => {
    try {
      const updateAvailable = await window.api.updater.checkForUpdates()
      if (updateAvailable) {
        const downloadNow = confirm(
          'A new version is available. Would you like to download and install it now?'
        )
        if (downloadNow) {
          showUpdateBanner = true
          window.api.updater.downloadUpdate().catch((error) => {
            console.error('Error downloading update:', error)
            toast.error('Failed to download update', {
              icon: '🚩',
              style: 'background:#242424;color:white;',
              duration: 2000,
              position: 'bottom-right'
            })
            showUpdateBanner = false
          })
        }
      } else {
        toast.success('You are using the latest version', {
          icon: '🌌',
          style: 'background:#242424;color:white;',
          duration: 2000,
          position: 'bottom-right'
        })
      }
    } catch (error) {
      console.error('Error checking for updates:', error)
      toast.error('Failed to check for updates', {
        icon: '🚩',
        style: 'background:#242424;color:white;',
        duration: 2000,
        position: 'bottom-right'
      })
    }
  }

  const installUpdate = async () => {
    try {
      showUpdateBanner = false
      window.api.updater.restartAndUpdate()
    } catch (error) {
      console.error('Error installing update:', error)
      toast.error('Failed to install update', {
        icon: '🚩',
        style: 'background:#242424;color:white;',
        duration: 2000,
        position: 'bottom-right'
      })
      showUpdateBanner = true
    }
  }

  const dismissBanner = () => {
    showUpdateBanner = false
  }

  onMount(() => {
    checkForUpdates()

    const updateListener = (_, available) => {
      showUpdateBanner = available
    }
    const progressListener = (_, progress) => {
      downloadProgress = Math.round(progress)
    }

    window.api.updater.onUpdateAvailable(updateListener)
    window.api.updater.onDownloadProgress(progressListener)

    return () => {
      window.api.updater.onUpdateAvailable(updateListener)
      window.api.updater.onDownloadProgress(progressListener)
    }
  })
</script>

{#if showUpdateBanner}
  <div
    class="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg max-w-md z-50 animate-fade-in"
  >
    <div class="flex justify-between items-start mb-2">
      <h3 class="font-bold text-lg flex items-center">
        <Download class="w-5 h-5 mr-2" />
        Update Downloaded
      </h3>
      <button
        onclick={dismissBanner}
        class="text-white hover:bg-blue-700 rounded-full p-1 -mt-1 -mr-1"
        aria-label="Dismiss"
      >
        <XIcon class="w-5 h-5" />
      </button>
    </div>

    <p class="mb-3">
      {#if downloadProgress < 100}
        Downloading update... {downloadProgress}%
      {:else}
        The update is ready to install. Would you like to restart now?
      {/if}
    </p>

    <div class="mt-2 flex gap-2">
      <button
        onclick={installUpdate}
        class="bg-white text-blue-600 hover:bg-blue-50 px-4 py-2 rounded font-medium transition-colors"
        disabled={downloadProgress < 100}
      >
        {downloadProgress < 100 ? 'Downloading...' : 'Restart & Install'}
      </button>
      <button
        onclick={dismissBanner}
        class="border border-white/30 hover:bg-white/10 px-4 py-2 rounded font-medium transition-colors"
      >
        {downloadProgress < 100 ? 'Cancel' : 'Later'}
      </button>
    </div>

    {#if downloadProgress < 100}
      <div class="w-full bg-blue-700 rounded-full h-2.5 mt-2">
        <div
          class="bg-white h-2.5 rounded-full transition-all duration-300"
          style={`width: ${downloadProgress}%`}
        ></div>
      </div>
    {/if}
  </div>
{/if}
