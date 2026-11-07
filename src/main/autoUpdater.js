import elctronUpdater from 'electron-updater'
import { app, ipcMain, BrowserWindow } from 'electron'
import logger from './logger.js'

const { autoUpdater } = elctronUpdater

const isDev = !app.isPackaged

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

ipcMain.handle('download-update', async () => {
  return autoUpdater.downloadUpdate()
})

ipcMain.handle('restart-and-update', () => {
  autoUpdater.quitAndInstall()
})

autoUpdater.on('error', (error) => {
  logger.error('AutoUpdater error:', error?.message || String(error))
})

autoUpdater.on('update-available', (info) => {
  if (isDev) return
  logger.info('Update available:', info.version)
  broadcast('update-available', {
    version: info.version,
    releaseNotes: info.releaseNotes,
    releaseDate: info.releaseDate
  })
})

autoUpdater.on('update-downloaded', (info) => {
  if (isDev) return
  logger.info('Update downloaded, ready to install:', info.version)
  broadcast('update-downloaded', {
    version: info.version
  })
})

async function checkForUpdates() {
  try {
    return await autoUpdater.checkForUpdates()
  } catch (error) {
    logger.error('checkForUpdates failed:', error?.message || String(error))
    return null
  }
}

function setupAutoUpdater() {
  if (isDev) return
  setTimeout(() => {
    checkForUpdates()
  }, 5000)

  ipcMain.handle('check-for-updates', checkForUpdates)
}

export { checkForUpdates, setupAutoUpdater }
