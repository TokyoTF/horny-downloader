import { app, shell, BrowserWindow, ipcMain, session, dialog } from 'electron'
import path from 'path'
import ExtensionRegistry from '../../lib/ExtensionRegistry.js'
import { is, optimizer } from '@electron-toolkit/utils'
import sqlite3 from 'sqlite3'
import { existsSync, mkdirSync, writeFile, unlinkSync, statSync, cpSync, readFileSync } from 'fs'
import { setupAutoUpdater } from './autoUpdater'
import { randomUUID } from 'crypto'

const documentsPath = app.getPath('documents')

if (!existsSync(path.join(documentsPath, 'horny-downloader'))) {
  mkdirSync(path.join(documentsPath, 'horny-downloader'))
}
const sql = sqlite3.verbose()
const db = new sql.Database(path.join(documentsPath, 'horny-downloader', 'data.db'))

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
      .inputOptions([
        '-user_agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ])
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
let mainWindow = null

async function enqueueDownload(job) {
  const namethumb = randomUUID() + '.jpg'
  let thumbPath = job.thumb

  if (job.thumb && job.thumb.startsWith('http') || job.thumb && job.thumb.startsWith('//')) {
    try {
      let thumbUrl = job.thumb
      if (job.thumb.startsWith('//')) {
        thumbUrl = 'https:' + job.thumb
      }
      await downloadthumb(thumbUrl, namethumb)
      thumbPath = path.join(documentsPath, 'horny-downloader', 'temp', namethumb)
    } catch (err) {
      console.error('Failed to download thumb in enqueue:', err)
      thumbPath = path.join(documentsPath, 'horny-downloader', 'temp', 'thumb.jpg')
    }
  }
  job.thumb = thumbPath

  await new Promise((resolve) => {
    const smt = db.prepare('INSERT INTO history (title,url,status,thumb,site,formatfile,timevideo,quality,tempid) VALUES (?,?,?,?,?,?,?,?,?)')

    smt.run(
      [
        job.title,
        job.url,
        0,
        thumbPath,
        job.site,
        job.format,
        toSeconds(job.duration),
        job.quality,
        job.tempid
      ],
      function () {
        job.localid = this.lastID
        if (mainWindow && !mainWindow.isDestroyed()) {
          setTimeout(() => {
            db.all('SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality,tempid from history', (err, row) => {
              if (row && row.length > 0) {
                mainWindow.webContents.send('getList', row)
              }
            })
          }, 100)
        }
        resolve()
      }
    )
    smt.finalize()
  })

  downloadQueue.push(job)
  startNextDownload()
}

async function downloadthumb(url, namefile, site) {
  const dest = path.join(documentsPath, 'horny-downloader', 'temp', namefile)
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
  if (activeDownloads >= local_settings.concurrent_downloads) {
    return
  }
  if (downloadQueue.length === 0) {
    return
  }

  const job = downloadQueue.shift()

  if (!job) {
    return
  }

  activeDownloads++

  startJob(job)
    .catch((err) => {
      console.error('Download job failed:', err)
    })
    .finally(() => {
      activeDownloads--

      setTimeout(() => {
        for (let i = 0; i < local_settings.concurrent_downloads; i++) {
          if (activeDownloads < local_settings.concurrent_downloads && downloadQueue.length > 0) {
            startNextDownload()
          }
        }
      }, 10)
    })
  if (activeDownloads < local_settings.concurrent_downloads && downloadQueue.length > 0) {
    setTimeout(() => startNextDownload(), 0)
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

ipcMain.on('openExtensionsFolder', (e) => {
  try {
    const extPath = path.join(documentsPath, 'horny-downloader', 'extensions')
    if (!existsSync(extPath)) {
      mkdirSync(extPath, { recursive: true })
    }
    shell.openPath(extPath)
  } catch (err) {
    console.error('openExtensionsFolder error:', err)
  }
})


ipcMain.on('cancelDownload', (e, { id }) => {
  try {
    if (id == null) return
    let jobKey = id
    let rec = activeJobs[id]
    if (!rec) {
      const foundEntry = Object.entries(activeJobs).find(([key, val]) => val.localid === id)
      if (foundEntry) {
        jobKey = foundEntry[0]
        rec = foundEntry[1]
      }
    }

    if (rec && rec.cmd) {
      try { rec.cmd.kill('SIGKILL') } catch { }
      try { rec.cmd.kill('SIGTERM') } catch { }
    }
    if (rec && rec.localid != null) {
      db.run('UPDATE history SET status=? WHERE id=?', [3, rec.localid], () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('getCheck', { status: 3, id: rec.localid })
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              db.all('SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality from history', (err, row) => {
                if (row && row.length > 0) {
                  mainWindow.webContents.send('getList', row)
                }
              })
            }
          }, 100)
        }
      })
    } else {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('getCheck', { status: 3, id: id })
      }
    }
    if (rec) {
      setTimeout(() => {
        if (rec.outPath && existsSync(rec.outPath)) unlinkSync(rec.outPath)
      }, 2000);
      delete activeJobs[jobKey]
    }

  } catch (err) {
    console.error('cancelDownload error:', err)
  }
})


ipcMain.on('updateSettings', (e, data) => {
  local_settings = JSON.parse(data)
  if (local_settings.ffmpeg_path) {
    updateFfmpegPath(local_settings.ffmpeg_path)
  }
})


async function startJob(job) {
  const { title, format, thumb, site, url, video_src, tempid, duration, quality, localid } = job

  let namefile = ''
  let outPath = ''

  if (local_settings.namefile_type == 'video_title') {
    namefile = title.replace(/[^\w\s]/gi, '')

    const downloadDir = local_settings.download_folder || path.join(documentsPath, 'horny-downloader', 'downloads')
    if (!existsSync(downloadDir)) {
      mkdirSync(downloadDir, { recursive: true })
    }

    let basePath = path.join(downloadDir, `${namefile}-${site}`)
    let counter = 1

    do {
      outPath = `${basePath}${counter > 1 ? ` (${counter})` : ''}.${format}`
      counter++
    } while (existsSync(outPath) && counter < 1000)
    if (counter >= 1000) {
      namefile = randomUUID()
      outPath = path.join(downloadDir, `${namefile}-${site}.${format}`)
    }
  } else {
    namefile = randomUUID()
    const downloadDir = local_settings.download_folder || path.join(documentsPath, 'horny-downloader', 'downloads')
    if (!existsSync(downloadDir)) {
      mkdirSync(downloadDir, { recursive: true })
    }
    outPath = path.join(downloadDir, `${namefile}-${site}.${format}`)

  }

  activeJobs[tempid] = { cmd: null, localid, outPath }

  await new Promise((resolve) => {
    db.run('UPDATE history SET status=1, pathfile=? WHERE id=?', [outPath, localid], () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
          db.all('SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality,tempid from history', (err, row) => {
            if (row && row.length > 0) {
              mainWindow.webContents.send('getList', row)
            }
          })
        }, 100)
      }
      resolve()
    })
  })

  try {
    let durationSec = parseDurationString(duration)

    await runFfmpegDownload(
      video_src,
      outPath,
      (pct) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('getProgress', {
            id: localid || tempid,
            load: pct
          })
        }
      },
      durationSec,
      { mapAudio: true },
      (cmd) => {
        if (activeJobs[tempid]) activeJobs[tempid].cmd = cmd
      })
    if (localid !== null) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('getProgress', {
          id: localid,
          load: 100
        })
      }

      const stats = statSync(outPath)
      const fileSizeInBytes = stats.size
      db.run('UPDATE history SET status=?, filesize=? WHERE id=?', [2, fileSizeInBytes, localid], () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('getCheck', { status: 2, id: localid, pathfile: outPath, filesize: fileSizeInBytes })
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              db.all('SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality,tempid from history', (err, row) => {
                if (row && row.length > 0) {
                  mainWindow.webContents.send('getList', row)
                }
              })
            }
          }, 100)
        }
      })
    }
  } catch (err) {
    console.error('Download failed:', err)
    if (localid !== null) {
      db.run('UPDATE history SET status=? WHERE id=?', [3, localid], () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('getCheck', { status: 3, id: localid })
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              db.all('SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality,tempid from history', (err, row) => {
                if (row && row.length > 0) {
                  mainWindow.webContents.send('getList', row)
                }
              })
            }
          }, 100)
        }
      })
    } else {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('getCheck', { status: 3, id: tempid })
      }
    }
  } finally {
    delete activeJobs[tempid]
  }
}
function createWindow() {
  let max = false

  mainWindow = new BrowserWindow({
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
    urls: [
      'https://*.phncdn.com/*',
      'https://*.externulls.com/*',
      'https://*.ahcdn.com/*',
      'https://*.eporner.com/*',
      'http://*.eporner.com/*',
      'https://*.spankbang.com/*',
      'https://*.pornone.com/*',
      'https://*.sxyprn.com/*'
    ]
  }

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (details && details.requestHeaders) {
      details.requestHeaders['Access-Control-Allow-Origin'] = '*'
      details.requestHeaders['Origin'] = ''
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

      const { url } = details

      if (url.includes('phncdn.com')) {
        details.requestHeaders['Referer'] = 'https://www.pornhub.com/'
      } else if (url.includes('externulls.com') || url.includes('ahcdn.com')) {
        details.requestHeaders['Referer'] = 'https://beeg.com/'
      } else if (url.includes('eporner.com')) {
        details.requestHeaders['Referer'] = 'https://www.eporner.com/'
      } else if (url.includes('spankbang.com')) {
        details.requestHeaders['Referer'] = 'https://spankbang.com/'
      } else if (url.includes('pornone.com')) {
        details.requestHeaders['Referer'] = 'https://pornone.com/'
      } else if (url.includes('sxyprn.com')) {
        details.requestHeaders['Referer'] = 'https://sxyprn.com/'
        details.requestHeaders['Range'] = 'bytes=0-'
      }


      callback({ requestHeaders: details.requestHeaders })
    } else {
      callback({ cancel: false })
    }
  })



  if (!existsSync(path.join(documentsPath, 'horny-downloader', 'temp'))) {
    mkdirSync(path.join(documentsPath, 'horny-downloader', 'temp'))
  }

  if (!existsSync(path.join(documentsPath, 'horny-downloader', 'extensions'))) {
    mkdirSync(path.join(documentsPath, 'horny-downloader', 'extensions'))
  }

  if (is.dev) {
    try {
      const srcExt = path.join(process.cwd(), 'extensions')
      const destExt = path.join(documentsPath, 'horny-downloader', 'extensions')
      if (existsSync(srcExt)) {
        cpSync(srcExt, destExt, { recursive: true, force: true })
        console.log('Extensions copied to Documents folder')
      }
    } catch (err) {
      console.error('Error copying extensions:', err)
    }
  }

  if (!existsSync(path.join(documentsPath, 'horny-downloader', 'downloads'))) {
    mkdirSync(path.join(documentsPath, 'horny-downloader', 'downloads'))
  }

  db.serialize(() => {
    db.run(
      'CREATE TABLE IF NOT EXISTS history (id INTEGER NOT NULL Primary Key AUTOINCREMENT, title varchar(255),status int(11), url varchar(255), thumb varchar(255), pathfile varchar(255), formatfile varchar(255), timevideo varchar(20), site varchar(40), quality varchar(40), filesize varchat(255), created_at datetime DEFAULT CURRENT_TIMESTAMP, tempid varchar(255))',
      () => {
        // Add tempid column if it doesn't exist (for existing databases)
        db.all("PRAGMA table_info(history)", (err, rows) => {
          if (rows && !rows.find(row => row.name === 'tempid')) {
            db.run('ALTER TABLE history ADD COLUMN tempid varchar(255)');
          }
        });
      }
    )
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
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

  if (!is.dev) {
    setupAutoUpdater()
  }

}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.tokyotf.horny-downloader')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('getList', (e) => {
    db.all('SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality,tempid from history', (err, row) => {
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

  ipcMain.handle('get-extensions-status', async () => {
    try {
      const status = await extensionRegistry.getAllExtensionsStatus()
      return status
    } catch (error) {
      console.error('Error getting extensions status:', error)
      return { loaded: {}, failed: {}, total: 0 }
    }
  })

  ipcMain.handle('reload-extensions', async () => {
    try {
      await extensionRegistry.reloadExtensions()
      const status = await extensionRegistry.getAllExtensionsStatus()


      if (is.dev) {
        try {
          const srcExt = path.join(process.cwd(), 'extensions')
          const destExt = path.join(documentsPath, 'horny-downloader', 'extensions')
          if (existsSync(srcExt)) {
            cpSync(srcExt, destExt, { recursive: true, force: true })
            console.log('Extensions copied to Documents folder')
          }
        } catch (err) {
          console.error('Error copying extensions:', err)
        }
      }

      return status
    } catch (error) {
      console.error('Error reloading extensions:', error)
      return { error: error.message }
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

  ipcMain.handle('check-for-extension-updates', async () => {
    try {
      return await extensionRegistry.checkForUpdates()
    } catch (error) {
      console.error('Error checking for updates:', error)
      return []
    }
  })

  ipcMain.handle('update-extension', async (e, name) => {
    try {
      return await extensionRegistry.updateExtension(name)
    } catch (error) {
      console.error(`Error updating extension ${name}:`, error)
      return false
    }
  })

  ipcMain.handle('pick-batch-file', async (e) => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Text Files', extensions: ['txt'] }]
    })

    if (filePaths && filePaths.length > 0) {
      try {
        const content = readFileSync(filePaths[0], 'utf-8')
        const urls = content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.startsWith('http'))

        return { count: urls.length, urls }
      } catch (err) {
        console.error('Error reading batch file:', err)
        return { error: err.message }
      }
    }
    return { count: 0, urls: [] }
  })

  ipcMain.handle('start-batch-download', async (e, { urls, quality, delay }) => {
    processBatchUrls(urls, quality, delay)
    return { success: true }
  })

  async function processBatchUrls(urls, qualityPreference, delay) {
    const registry = new ExtensionRegistry()

    for (const url of urls) {
      try {
        if (delay && delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }

        const videoData = await registry.extractVideo(url)

        let bestQualitySrc = ''
        let bestQualityLabel = ''

        if (videoData.list_quality && videoData.list_quality.length > 0) {
          const sorted = videoData.list_quality.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
          let selected = sorted[0]

          if (qualityPreference === 'low') {
            selected = sorted[sorted.length - 1]
          } else if (qualityPreference === 'medium') {
            selected = sorted[Math.floor(sorted.length / 2)]
          }

          bestQualitySrc = selected.url || selected.src
          bestQualityLabel = selected.quality
        } else {
          bestQualitySrc = videoData.video_test
          bestQualityLabel = 'unknown'
        }

        if (!bestQualitySrc && typeof videoData.video_test === 'string') {
          bestQualitySrc = videoData.video_test
        }

        if (bestQualitySrc) {
          const title = decodeURIComponent(escape(videoData.title)) || 'Unknown Title'

          const job = {
            title: title,
            thumb: videoData.thumb || '',
            site: videoData.site || 'unknown',
            url: url,
            format: local_settings.default_format || 'mkv',
            video_src: bestQualitySrc,
            tempid: randomUUID(),
            duration: videoData.time || '00:00:00',
            quality: bestQualityLabel
          }

          await enqueueDownload(job)
        }

      } catch (err) {
        console.error(`Failed to process batch url ${url}:`, err)
      }
    }
  }


  ipcMain.on('getCheck', async (e, v) => {
    const { title, format, thumb, site, url, video_src, tempid, duration, quality } = v

    if (title && format && site && url && video_src) {

      await enqueueDownload({ title, format, thumb, site, url, video_src, tempid, duration, quality })
    }
  })

  ipcMain.on('getVideo', async (e, v) => {
    try {
      const registry = new ExtensionRegistry()

      const videoData = await registry.extractVideo(v.url)

      const videoObject = {
        url: v.url,
        site: videoData.site || 'unknown',
        title: decodeURIComponent(escape(videoData.title)) || 'Unknown Title',
        video_test: videoData.video_test || [],
        thumb: videoData.thumb || '',
        list_quality: videoData.list_quality || [],
        time: videoData.time || '0:0:0',
        embed: videoData.embed || '',
        status: videoData.status || 404,
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
