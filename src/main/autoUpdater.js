import { autoUpdater } from 'electron-updater'
import { dialog, ipcMain, BrowserWindow } from 'electron'

autoUpdater.autoDownload = false

autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'TokyoTF',
  repo: 'horny-downloader'
})

autoUpdater.on('update-available', (info) => {

  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Available',
      message: `A new version ${info.version} is available. Would you like to download it now?`,
      buttons: ['Download', 'Later']
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate()
      }
    })
  }
})

autoUpdater.on('update-not-available', (info) => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    win.webContents.send('update-not-available')
  }
})

autoUpdater.on('download-progress', (progressObj) => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    win.webContents.send('download-progress', progressObj.percent)
  }
})

autoUpdater.on('update-downloaded', (info) => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Ready',
      message: 'The update has been downloaded. Restart the application to apply the updates.',
      buttons: ['Restart', 'Later']
    }).then(({ response }) => {
      if (response === 0) {
        setImmediate(() => autoUpdater.quitAndInstall())
      }
    })
  }
})

autoUpdater.on('error', (error) => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    win.webContents.send('update-error', error.message || 'Unknown error')
  }
})

function checkForUpdates() {
  autoUpdater.checkForUpdates().catch(error => {
    console.error('Failed to check for updates:', error)
  })
}

function setupAutoUpdater() {
  setTimeout(checkForUpdates, 5000)

  ipcMain.handle('check-for-updates', () => {
    checkForUpdates()
  })

  ipcMain.handle('restart-and-update', () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      console.error('Failed to download update:', error)
      return { success: false, error: error.message }
    }
  })
}

export { checkForUpdates, setupAutoUpdater }
