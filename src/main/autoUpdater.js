import { autoUpdater } from 'electron-updater'
import { ipcMain, BrowserWindow } from 'electron'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

ipcMain.handle('download-update', async () => {
  return autoUpdater.downloadUpdate()
})

ipcMain.handle('restart-and-update', () => {
  autoUpdater.quitAndInstall()
})

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info)
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    win.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    })
  }
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded, ready to install')
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    win.webContents.send('update-downloaded', {
      version: info.version
    })
  }
})

async function checkForUpdates() {
  await autoUpdater.checkForUpdates()
}

function setupAutoUpdater() {
  setTimeout(() => {
    checkForUpdates()
  }, 5000)

  ipcMain.handle('check-for-updates', checkForUpdates)

}

export { checkForUpdates, setupAutoUpdater }