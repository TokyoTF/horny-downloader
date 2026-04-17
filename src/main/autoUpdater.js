import elctronUpdater from 'electron-updater'
import { ipcMain, BrowserWindow } from 'electron'
import logger from './logger.js'

const { autoUpdater } = elctronUpdater

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

ipcMain.handle('download-update', async () => {
  return autoUpdater.downloadUpdate()
})

ipcMain.handle('restart-and-update', () => {
  autoUpdater.quitAndInstall()
})

autoUpdater.on('update-available', (info) => {
  if (isDev) return
  logger.info('Update available:', info)
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
  if (isDev) return
  logger.info('Update downloaded, ready to install')
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
  if (isDev) return
  setTimeout(() => {
    checkForUpdates()
  }, 5000)

  ipcMain.handle('check-for-updates', checkForUpdates)
}

export { checkForUpdates, setupAutoUpdater }
