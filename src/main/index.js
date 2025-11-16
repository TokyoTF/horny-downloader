import { app, shell, BrowserWindow, ipcMain, session, dialog } from 'electron'
import path from 'path'

import ExtensionRegistry from '../../extensions/ExtensionRegistry.js'

import { is, optimizer} from '@electron-toolkit/utils'

import sqlite3 from 'sqlite3'
import { existsSync, mkdirSync, writeFile, unlinkSync, statSync } from 'fs'
const sql = sqlite3.verbose()
const db = new sql.Database('./data.db')
import { setupAutoUpdater } from './autoUpdater'

import { randomUUID } from 'crypto'

const extensionRegistry = new ExtensionRegistry()
import ffmpeg from 'fluent-ffmpeg'

let ffmpegPath = ''

function updateFfmpegPath(path) {
  if (path && existsSync(path)) {
    ffmpegPath = path
    ffmpeg.setFfmpegPath(ffmpegPath)
  }
}

updateFfmpegPath(ffmpegPath)

function toSeconds(timemark) {
  if (!timemark) return 0
  const parts = timemark.split(':')
  if (parts.length < 3) return 0
  const [hh, mm, ss] = parts
  const seconds = parseFloat(ss) + (parseInt(mm, 10) || 0) * 60 + (parseInt(hh, 10) || 0) * 3600
  return isNaN(seconds) ? 0 : seconds
}

function parseDurationString(d) {
  if (!d) return 0
  const parts = d.split(':').map((x) => parseInt(x, 10))
  if (parts.some((x) => isNaN(x))) return 0
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return 0
}

function runFfmpegDownload(
  srcUrl,
  outPath,
  onProgress,
  durationSec,
  opts = { mapAudio: true },
  onCmd
) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      .input(srcUrl)
      .outputOptions(
        opts && opts.mapAudio
          ? ['-c', 'copy', '-map', '0:v:0', '-map', '0:a:0', '-threads', local_settings.threads]
          : ['-c', 'copy', '-map', '0:v:0', '-threads', local_settings.threads]
      )
      .output(outPath)

    cmd.on('progress', (info) => {
      if (onProgress && durationSec && durationSec > 0 && info && info.timemark) {
        const cur = toSeconds(info.timemark)
        const pct = Math.max(0, Math.min(100, Math.round((cur / durationSec) * 100)))
        onProgress(pct)
      }
    })

    if (typeof onCmd === 'function') {
      try { onCmd(cmd) } catch { }
    }
    cmd.on('end', () => resolve())
    cmd.on('error', (err) => reject(err))
    cmd.run()
  })
}

const activeJobs = {}

let local_settings = {
  default_format: 'mkv',
  concurrent_downloads: 3,
  namefile_type: 'video_title',
  threads: '1'
}

const downloadQueue = []
let activeDownloads = 0

function enqueueDownload(job) {
  downloadQueue.push(job)
  startNextDownload()
}

async function downloadthumb(url, namefile, site) {
  const dest = path.join('./temp', namefile)
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()

  await new Promise((resolve, reject) => {
    writeFile(dest, Buffer.from(buffer), (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

function startNextDownload() {
  while (activeDownloads < local_settings.concurrent_downloads && downloadQueue.length > 0) {
    const job = downloadQueue.shift()
    activeDownloads++
    startJob(job)
      .catch(() => { })
      .finally(() => {
        activeDownloads--
        startNextDownload()
      })
  }
}
ipcMain.on('revealFile', (e, v) => {
  try {
    const p = v && v.path ? v.path : ''
    shell.showItemInFolder(p)
  } catch (err) {
    console.error('revealFile error:', err)
  }
})


ipcMain.on('cancelDownload', (e, { id }) => {
  try {
    if (id == null) return
    const rec = activeJobs[id]
    if (rec && rec.cmd) {
      try { rec.cmd.kill('SIGKILL') } catch { }
      try { rec.cmd.kill('SIGTERM') } catch { }
    }
    if (rec && rec.localid != null) {
      db.run('UPDATE history SET status=? WHERE id=?', [3, rec.localid])
    }
    setTimeout(() => {
      if (rec.outPath && existsSync(rec.outPath)) unlinkSync(rec.outPath)
    }, 2000);

    e.reply('getCheck', { status: 3, id })
  } catch (err) {
    console.error('cancelDownload error:', err)
  } finally {
    delete activeJobs[id]
  }
})


ipcMain.on('updateSettings', (e, data) => {
  local_settings = JSON.parse(data)
  if (local_settings.ffmpeg_path) {
    updateFfmpegPath(local_settings.ffmpeg_path)
  }
})


async function startJob(job) {
  const { e, title, format, thumb, site, url, video_src, tempid, duration, quality } = job

 
  const namethumb = randomUUID() + '.jpg'
  let localid = null

  if (thumb) {
    downloadthumb(thumb, namethumb, site)
  }

  let namefile = ''
  let outPath = ''
 
  if (local_settings.namefile_type == 'video_title') {
    namefile = title.replace(/[^\w\s]/gi, '')

    const downloadDir = local_settings.download_folder || path.join(process.cwd(), 'downloads')
    if (!existsSync(downloadDir)) {
      mkdirSync(downloadDir, { recursive: true })
    }

    let basePath = path.join(downloadDir, namefile)
    let counter = 1
       
    do {
      outPath = `${basePath}${counter > 1 ? ` (${counter})` : ''}.${format}`
      counter++
    } while (existsSync(outPath) && counter < 1000)
    if (counter >= 1000) {
      namefile = randomUUID()
      outPath = path.join(downloadDir, `${namefile}.${format}`)
    }
  } else {
    namefile = randomUUID()
    const downloadDir = local_settings.download_folder || path.join(process.cwd(), 'downloads')
    if (!existsSync(downloadDir)) {
      mkdirSync(downloadDir, { recursive: true })
    }
    outPath = path.join(downloadDir, `${namefile}.${format}`)
    
  }

  await new Promise((resolve) => {
    const smt = db.prepare('INSERT INTO history (title,url,status,thumb,site,formatfile,timevideo,quality) VALUES (?,?,?,?,?,?,?,?)')

    smt.run(
      [
        title,
        url,
        1,
        thumb ? path.join(process.cwd(), 'temp', namethumb) : path.join(process.cwd(), 'temp', 'thumb.jpg'),
        site,
        format,
        toSeconds(duration),
        quality
      ],
      function () {
        localid = this.lastID
        if (outPath && localid !== null) {
          db.run('UPDATE history SET pathfile=? WHERE id=?', [outPath, localid])
        }
        activeJobs[tempid] = { cmd: null, localid, outPath }
        resolve()
      }
    )
    smt.finalize()
  })

  try {
    let durationSec = parseDurationString(duration)

    await runFfmpegDownload(
      video_src,
      outPath,
      (pct) => {
        e.reply('getProgress', {
          id: tempid,
          load: pct
        })
      },
      durationSec,
      { mapAudio: true },
      (cmd) => {

        if (activeJobs[tempid]) activeJobs[tempid].cmd = cmd
      })
    if (localid !== null) {
      const stats = statSync(outPath);
      const fileSizeInBytes = stats.size;
      db.run('UPDATE history SET status=?, filesize=? WHERE id=?', [2, fileSizeInBytes, localid])
      e.reply('getCheck', { status: 2, id: tempid, pathfile: outPath, filesize: fileSizeInBytes })
    }
  } catch (err) {
    console.error('Download failed:', err)
  } finally {
    delete activeJobs[tempid]
  }
}
function createWindow() {
  let max = false

  const mainWindow = new BrowserWindow({
    width: 750,
    minWidth: 750,
    height: 590,
    minHeight: 590,
    show: false,
    transparent: true,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const BoundsWin = mainWindow.getBounds()

  const filter = {
    urls: ['https://*.phncdn.com/*']
  }

  const filter2 = {
    urls: ['https://*.externulls.com/*', 'https://*.ahcdn.com/*']
  }

  const filter3 = {
    urls: ['https://*.eporner.com/*', 'http://*.eporner.com/*']
  }

  const filter4 = {
    urls: ['https://*.spankbang.com/*']
  }

  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    if (details && details.requestHeaders) {
      details.requestHeaders['Access-Control-Allow-Origin'] = '*'
      details.requestHeaders['Referer'] = 'https://www.pornhub.com/'
      details.requestHeaders['Origin'] = ''
    }

    callback({ requestHeaders: details.requestHeaders })
  })

  session.defaultSession.webRequest.onBeforeSendHeaders(filter2, (details, callback) => {
    if (details && details.requestHeaders) {
      details.requestHeaders['Access-Control-Allow-Origin'] = '*'
      details.requestHeaders['Referer'] = 'https://beeg.com/'
      details.requestHeaders['Origin'] = ''
      callback({ requestHeaders: details.requestHeaders })
    }
  })

  session.defaultSession.webRequest.onBeforeSendHeaders(filter3, (details, callback) => {
    if (details && details.requestHeaders) {
      details.requestHeaders['Access-Control-Allow-Origin'] = '*'
      details.requestHeaders['Referer'] = 'https://www.eporner.com/'
      details.requestHeaders['Origin'] = ''
      callback({ requestHeaders: details.requestHeaders })
    }
  })

  session.defaultSession.webRequest.onBeforeSendHeaders(filter4, (details, callback) => {
    if (details && details.requestHeaders) {
      details.requestHeaders['Access-Control-Allow-Origin'] = '*'
      details.requestHeaders['Referer'] = 'https://spankbang.com/'
      details.requestHeaders['Origin'] = ''
      callback({ requestHeaders: details.requestHeaders })
    }
  })

  if (!existsSync('./temp')) {
    mkdirSync('./temp')
  }

  if (!existsSync('./extensions')) {
    mkdirSync('./extensions')
  }

  if (!existsSync('./downloads')) {
    mkdirSync('./downloads')
  }

  db.serialize(() => {
    db.prepare(
      'CREATE TABLE IF NOT EXISTS history (id INTEGER NOT NULL Primary Key AUTOINCREMENT, title varchar(255),status int(11), url varchar(255), thumb varchar(255), pathfile varchar(255), formatfile varchar(255), timevideo varchar(20), site varchar(40), quality varchar(40), filesize varchat(255), created_at datetime DEFAULT CURRENT_TIMESTAMP)'
    )
      .run()
      .finalize()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })
  let localpos = { x: 0, y: 0 }
  ipcMain.on('setState', (e, v) => {
    v == 'min' && !mainWindow.isMinimized() && mainWindow.minimize()

    if (v == 'max' && !max) {
      localpos.x = mainWindow.getBounds().x
      localpos.y = mainWindow.getBounds().y
      mainWindow.maximize()
      mainWindow.focus()
      max = true
    } else if (v == 'max' && max) {
      max = false
      mainWindow.setBounds({
        x: localpos.x,
        y: localpos.y,
        width: BoundsWin.width,
        height: BoundsWin.height
      })
    }
    v == 'close' && app.quit()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.tokyotf.horny-downloader')

  if (!is.dev) {
    setupAutoUpdater()
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('getList', (e) => {
    db.all('SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality from history', (err, row) => {
      if (row && row.length > 0) {
        e.reply('getList', row)
      }
    })
  })

  ipcMain.on('deleteItem', (e, { id }) => {
    if (!id) return
    try {
      const smt = db.prepare('DELETE FROM history WHERE id = ?')
      smt.run([id], function () {
        e.reply('deletedItem', { id })
      })
      smt.finalize()
    } catch (err) {
      console.error('deleteItem error:', err)
    }
  })

  ipcMain.handle('open-file-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(app, {
      title: 'Select FFmpeg Executable',
      properties: ['openFile'],
      filters: [{ name: 'Executable', extensions: ['exe'] }]
    })
    return result
  })

  ipcMain.handle('open-directory-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog({
      ...options,
      properties: ['openDirectory', 'createDirectory']
    })
    return result
  })


  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // Extension status handlers
  ipcMain.handle('get-extensions-status', async () => {
    try {
      const status = await extensionRegistry.getAllExtensionsStatus()
      console.log('Extension status:', status)
      return status
    } catch (error) {
      console.error('Error getting extensions status:', error)
      return { loaded: {}, failed: {}, total: 0 }
    }
  })

  ipcMain.handle('get-supported-domains', async () => {
    try {
      return await extensionRegistry.getSupportedDomains()
    } catch (error) {
      console.error('Error getting supported domains:', error)
      return []
    }
  })


  ipcMain.on('getCheck', (e, v) => {
    const { title, format, thumb, site, url, video_src, tempid, duration, quality } = v

    if (title && format && site && url && video_src) {
      
      enqueueDownload({ e, title, format, thumb, site, url, video_src, tempid, duration, quality })
    }
  })

  ipcMain.on('getVideo', async (e, v) => {
    try {
      const registry = new ExtensionRegistry()

      const videoData = await registry.extractVideo(v.url)
    
      const videoObject = {
        id: 1,
        url: v.url,
        site: videoData.site || 'unknown',
        title: videoData.title || 'Unknown Title',
        video_test: videoData.video_test || [],
        thumb: videoData.thumb || '',
        list_quality: videoData.list_quality || [],
        time:videoData.time || '0:0:0',
        embed: videoData.embed || '',
        status: videoData.status|| 404,
        force_type: videoData.force_type
      }
      
      e.reply('getVideo', videoObject)
    } catch (error) {
      console.error('Error extracting video:', error)
      e.reply('getVideo', { error: error.message })
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
