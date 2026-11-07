import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  dialog,
  Notification,
  protocol,
  net
} from 'electron'
import path from 'path'
import ExtensionRegistry from '../../lib/ExtensionRegistry.js'
import { clearExtensionLogs, getExtensionLogs } from '../../lib/extensionLogger.js'
import RequestInterceptor from '../../lib/requestInterceptor.js'
import { is, optimizer } from '@electron-toolkit/utils'
import sqlite3 from 'sqlite3'
import {
  existsSync,
  mkdirSync,
  writeFile,
  unlinkSync,
  statSync,
  cpSync,
  readFileSync,
  readdirSync
} from 'fs'

import { setupAutoUpdater } from './autoUpdater.js'
import { randomUUID } from 'crypto'
import logger from './logger.js'
import { init } from './telegramBot.js'
import {
  destroyProxyWindow,
  downloadHlsToMp4,
  downloadFileToMp4,
  proxyFetch,
  cleanupTempFile
} from '../../lib/proxyDownloader.js'

const documentsPath = app.getPath('documents')
const url = require('node:url')

if (!existsSync(path.join(documentsPath, 'horny-downloader'))) {
  mkdirSync(path.join(documentsPath, 'horny-downloader'))
}
const sql = sqlite3.verbose()
const db = new sql.Database(path.join(documentsPath, 'horny-downloader', 'data.db'))

const extensionRegistry = new ExtensionRegistry()
let requestInterceptor = null
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
  return new Promise(async (resolve, reject) => {
    let tempFile = null
    let actualSrcUrl = srcUrl

    const isHls = srcUrl && (srcUrl.includes('.m3u8') || srcUrl.includes('/m3u8/'))

    if (opts?.proxy_method && !isHls && srcUrl) {
      // Direct media file on a host that only accepts browser TLS fingerprints
      try {
        tempFile = await downloadFileToMp4(srcUrl, documentsPath, onProgress, {
          headers: opts.referer ? { Referer: opts.referer } : {}
        })
        actualSrcUrl = tempFile.split(path.sep).join('/')
      } catch (err) {
        logger.error('Proxy download failed, falling back to direct:', err.message)
      }
    } else if (opts?.proxy_method && isHls && srcUrl) {
      try {
        tempFile = await downloadHlsToMp4(srcUrl, documentsPath, onProgress)
        actualSrcUrl = tempFile.split(path.sep).join('/')
      } catch (err) {
        logger.error('Proxy download failed, falling back to direct:', err.message)
      }
    }

    const baseOpts =
      opts && opts.mapAudio
        ? ['-c', 'copy', '-map', '0:v:0', '-map', '0:a:0?', '-threads', local_settings.threads]
        : ['-c', 'copy', '-map', '0:v:0', '-threads', local_settings.threads]

    const inputOpts = []

    if (actualSrcUrl.startsWith('http')) {
      inputOpts.push(
        '-timeout',
        '10000000',
        '-user_agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      )
      if (opts && opts.referer) {
        inputOpts.unshift('-referer', opts.referer)
      }
    }

    if (tempFile && actualSrcUrl.endsWith('.mp4')) {
      inputOpts.push('-f', 'mp4')
    } else if (tempFile) {
      inputOpts.unshift('-protocol_whitelist', 'file,http,https,tcp,tls')
      inputOpts.push('-allowed_extensions', 'ALL')
    }

    const cmd = ffmpeg().input(actualSrcUrl).inputOptions(inputOpts)

    if (opts && opts.subtitlesAll && opts.subtitlesAll.length > 0) {
      let inputIdx = 1
      for (const sub of opts.subtitlesAll) {
        if (!sub || !sub.url) continue
        const subInputOpts = [
          '-timeout',
          '10000000',
          '-user_agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        ]
        if (opts && opts.referer) {
          subInputOpts.unshift('-referer', opts.referer)
        }
        cmd.input(sub.url).inputOptions(subInputOpts)
        baseOpts.push('-map', `${inputIdx}:0?`)
        if (sub.language) {
          baseOpts.push('-metadata:s:s:' + (inputIdx - 1), `language=${sub.language}`)
        }
        inputIdx++
      }
    } else if (opts && opts.subtitleUrl) {
      const subInputOpts = [
        '-timeout',
        '10000000',
        '-user_agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ]
      if (opts && opts.referer) {
        subInputOpts.unshift('-referer', opts.referer)
      }
      cmd.input(opts.subtitleUrl).inputOptions(subInputOpts)
      baseOpts.push('-map', '1:0?')
      if (opts.subtitleLanguage) {
        baseOpts.push('-metadata:s:s:0', `language=${opts.subtitleLanguage}`)
      }
    }

    if (local_settings.custom_ffmpeg_params) {
      const extra = local_settings.custom_ffmpeg_params.trim().split(/\s+/).filter(Boolean)
      baseOpts.push(...extra)
    }

    cmd.outputOptions(baseOpts).output(outPath)

    cmd.on('progress', (info) => {
      if (onProgress && durationSec && durationSec > 0 && info && info.timemark) {
        const cur = toSeconds(info.timemark)
        const pct = Math.max(0, Math.min(100, Math.round((cur / durationSec) * 100)))
        onProgress(pct)
      }
    })

    if (typeof onCmd === 'function') {
      try {
        onCmd(cmd)
      } catch {}
    }
    cmd.on('end', () => {
      cleanupTempFile(tempFile)
      resolve()
    })
    cmd.on('error', (err) => {
      cleanupTempFile(tempFile)
      reject(err)
    })
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
let telegramBotInstance = null

// FFmpeg can emit progress many times per second. Coalesce renderer updates so the
// UI stays smooth without flooding the IPC channel (and the reactive store) with events.
const PROGRESS_INTERVAL_MS = 120
const downloadProgressState = new Map()

function sendDownloadProgress(payload, { immediate = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const key = String(payload.id ?? '')
  const now = Date.now()
  const state = downloadProgressState.get(key) || { last: 0, timer: null, pending: null }

  if (immediate) {
    if (state.timer) clearTimeout(state.timer)
    state.timer = null
    state.pending = null
    state.last = now
    mainWindow.webContents.send('getProgress', payload)
    if (payload.load >= 100) downloadProgressState.delete(key)
    else downloadProgressState.set(key, state)
    return
  }

  state.pending = payload
  const elapsed = now - state.last

  if (elapsed >= PROGRESS_INTERVAL_MS) {
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }
    state.pending = null
    state.last = now
    downloadProgressState.set(key, state)
    mainWindow.webContents.send('getProgress', payload)
    return
  }

  if (!state.timer) {
    state.timer = setTimeout(() => {
      state.timer = null
      const next = state.pending
      state.pending = null
      if (!next) return
      if (!mainWindow || mainWindow.isDestroyed()) return
      state.last = Date.now()
      mainWindow.webContents.send('getProgress', next)
    }, PROGRESS_INTERVAL_MS - elapsed)
  }

  downloadProgressState.set(key, state)
}

function extensionErrorPayload(error, url = '') {
  return {
    error: error?.message || 'The extension could not extract this video',
    error_code: error?.code || 'EXTENSION_ERROR',
    error_extension: error?.extension || '',
    error_url: error?.url || url
  }
}

async function enqueueDownload(job) {
  logger.info('Enqueueing download', { title: job.title, site: job.site, url: job.url })

  const namethumb = randomUUID() + '.jpg'
  let thumbPath = job.thumb

  if ((job.thumb && job.thumb.startsWith('http')) || (job.thumb && job.thumb.startsWith('//'))) {
    try {
      let thumbUrl = job.thumb
      if (job.thumb.startsWith('//')) {
        thumbUrl = 'https:' + job.thumb
      }
      await downloadthumb(thumbUrl, namethumb)
      thumbPath = path.join(documentsPath, 'horny-downloader', 'temp', namethumb)
    } catch (err) {
      logger.warn('Failed to download thumbnail in enqueue', err)
      thumbPath = path.join(documentsPath, 'horny-downloader', 'temp', 'thumb.jpg')
    }
  }
  job.thumb = thumbPath

  await new Promise((resolve) => {
    const smt = db.prepare(
      'INSERT INTO history (title,url,status,thumb,site,formatfile,timevideo,quality,tempid) VALUES (?,?,?,?,?,?,?,?,?)'
    )

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
            db.all(
              'SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality,tempid from history',
              (err, row) => {
                if (row && row.length > 0) {
                  mainWindow.webContents.send('getList', row)
                }
              }
            )
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
      logger.error('Download job failed:', err)
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
    logger.error('revealFile error:', err)
  }
})

ipcMain.on('openExtensionsFolder', (e) => {
  try {
    const extPath = is.dev
      ? path.join(process.cwd(), 'extensions')
      : path.join(documentsPath, 'horny-downloader', 'extensions')
    if (!existsSync(extPath)) {
      mkdirSync(extPath, { recursive: true })
    }
    shell.openPath(extPath)
  } catch (err) {
    logger.error('openExtensionsFolder error:', err)
  }
})

ipcMain.on('openExtensionLogs', (e) => {
  try {
    shell.openPath(logger.getLogsPath())
  } catch (err) {
    logger.error('openExtensionLogs error:', err)
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
      try {
        rec.cmd.kill('SIGKILL')
      } catch {}
      try {
        rec.cmd.kill('SIGTERM')
      } catch {}
    }
    if (rec && rec.localid != null) {
      const localid = rec.localid
      db.get('SELECT thumb, pathfile FROM history WHERE id=?', [localid], (err, row) => {
        if (row) {
          const thumbPath = row.thumb
          const outPath = row.pathfile
          setTimeout(() => {
            if (thumbPath && existsSync(thumbPath)) unlinkSync(thumbPath)
            if (outPath && existsSync(outPath)) unlinkSync(outPath)
          }, 2000)
        }
      })
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('getCheck', { status: 3, id: localid })
      }
      db.run('DELETE FROM history WHERE id=?', [localid], () => {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            db.all(
              'SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality from history',
              (err, row) => {
                if (row && row.length > 0) {
                  mainWindow.webContents.send('getList', row)
                }
              }
            )
          }
        }, 100)
      })
    } else {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('getCheck', { status: 3, id: id })
      }
      if (rec && rec.outPath) {
        setTimeout(() => {
          if (existsSync(rec.outPath)) unlinkSync(rec.outPath)
        }, 2000)
      }
    }
    if (rec) {
      setTimeout(() => {
        if (rec.outPath && existsSync(rec.outPath)) unlinkSync(rec.outPath)
      }, 2000)
      delete activeJobs[jobKey]
    }
  } catch (err) {
    logger.error('cancelDownload error:', err)
  }
})

ipcMain.on('updateSettings', (e, data) => {
  local_settings = JSON.parse(data)
  if (local_settings.ffmpeg_path) {
    updateFfmpegPath(local_settings.ffmpeg_path)
  }

  if (telegramBotInstance) {
    if (local_settings.telegram_enabled && local_settings.telegram_token) {
      telegramBotInstance.configure(local_settings.telegram_token, null)
      telegramBotInstance.start()
      logger.info('Telegram bot started with grammy')
    } else {
      telegramBotInstance.stop()
    }
  }
})

async function startJob(job) {
  const {
    title,
    format,
    thumb,
    site,
    url,
    video_src,
    tempid,
    duration,
    quality,
    localid,
    referer,
    fromTelegram,
    subtitle_url,
    subtitle_language,
    subtitles_all,
    proxy_method
  } = job

  if (!video_src || typeof video_src !== 'string') {
    logger.error(`Invalid video source for: ${url}`)
    return
  }

  let namefile = ''
  let outPath = ''

  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const safeTitle = title
    .substring(0, 230)
    .replace(/[^\w\s]/gi, '')
    .replace(/[\n\r\t]/gm, '')
  const safeSite = site ? site.replace(/[^a-zA-Z0-9]/g, '') : ''

  if (
    local_settings.namefile_type === 'video_title' ||
    local_settings.namefile_type === 'site_title' ||
    local_settings.namefile_type === 'title_site' ||
    local_settings.namefile_type === 'date_title'
  ) {
    if (local_settings.namefile_type === 'site_title') {
      namefile = `${safeSite} - ${safeTitle}`
    } else if (local_settings.namefile_type === 'title_site') {
      namefile = `${safeTitle} - ${safeSite}`
    } else if (local_settings.namefile_type === 'date_title') {
      namefile = `${dateStr} - ${safeTitle}`
    } else {
      namefile = safeTitle
    }

    let baseDownloadDir =
      local_settings.download_folder || path.join(documentsPath, 'horny-downloader', 'downloads')

    if (local_settings.organize_by_site && site) {
      baseDownloadDir = path.join(baseDownloadDir, site)
    }

    if (!existsSync(baseDownloadDir)) {
      mkdirSync(baseDownloadDir, { recursive: true })
    }

    let basePath = path.join(baseDownloadDir, `${namefile}`)
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
    let baseDownloadDir =
      local_settings.download_folder || path.join(documentsPath, 'horny-downloader', 'downloads')

    if (local_settings.organize_by_site && site) {
      baseDownloadDir = path.join(baseDownloadDir, site)
    }

    if (!existsSync(baseDownloadDir)) {
      mkdirSync(baseDownloadDir, { recursive: true })
    }
    outPath = path.join(baseDownloadDir, `${namefile}-${site}.${format}`)
  }

  activeJobs[tempid] = { cmd: null, localid, outPath }

  await new Promise((resolve) => {
    db.run('UPDATE history SET status=1, pathfile=? WHERE id=?', [outPath, localid], () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
          db.all(
            'SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality,tempid from history',
            (err, row) => {
              if (row && row.length > 0) {
                mainWindow.webContents.send('getList', row)
              }
            }
          )
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
        sendDownloadProgress({
          id: localid || tempid,
          load: pct
        })
      },
      durationSec,
      {
        mapAudio: true,
        referer,
        subtitleUrl: subtitle_url || '',
        subtitleLanguage: subtitle_language || '',
        subtitlesAll: subtitles_all || [],
        proxy_method: proxy_method || false
      },
      (cmd) => {
        if (activeJobs[tempid]) activeJobs[tempid].cmd = cmd
      }
    )
    if (localid !== null) {
      sendDownloadProgress({ id: localid, load: 100 }, { immediate: true })

      const stats = statSync(outPath)
      const fileSizeInBytes = stats.size
      db.run(
        'UPDATE history SET status=?, filesize=? WHERE id=?',
        [2, fileSizeInBytes, localid],
        () => {
          if (Notification.isSupported()) {
            new Notification({
              title: 'Download Complete',
              body: title || 'Video downloaded successfully',
              icon: path.join(__dirname, '../../resources/icon.png')
            }).show()
          }
          if (fromTelegram && telegramBotInstance && telegramBotInstance.isRunning()) {
            telegramBotInstance.notifyDownloadComplete(title, site)
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('getCheck', {
              status: 2,
              id: localid,
              pathfile: outPath,
              filesize: fileSizeInBytes
            })
            setTimeout(() => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                db.all(
                  'SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality,tempid from history',
                  (err, row) => {
                    if (row && row.length > 0) {
                      mainWindow.webContents.send('getList', row)
                    }
                  }
                )
              }
            }, 100)
          }
        }
      )
    }
  } catch (err) {
    logger.error('Download failed:', err)
    if (localid !== null) {
      db.run('UPDATE history SET status=? WHERE id=?', [3, localid], () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('getCheck', { status: 3, id: localid })
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              db.all(
                'SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality,tempid from history',
                (err, row) => {
                  if (row && row.length > 0) {
                    mainWindow.webContents.send('getList', row)
                  }
                }
              )
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
    backgroundColor: '#161616',
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const BoundsWin = mainWindow.getBounds()

  if (!requestInterceptor) {
    requestInterceptor = new RequestInterceptor(extensionRegistry, session.defaultSession)
  }
  requestInterceptor.attach()

  if (!existsSync(path.join(documentsPath, 'horny-downloader', 'temp'))) {
    mkdirSync(path.join(documentsPath, 'horny-downloader', 'temp'))
  }

  if (!existsSync(path.join(documentsPath, 'horny-downloader', 'extensions'))) {
    mkdirSync(path.join(documentsPath, 'horny-downloader', 'extensions'))
  }

  if (!existsSync(path.join(documentsPath, 'horny-downloader', 'downloads'))) {
    mkdirSync(path.join(documentsPath, 'horny-downloader', 'downloads'))
  }

  db.serialize(() => {
    db.run(
      'CREATE TABLE IF NOT EXISTS history (id INTEGER NOT NULL Primary Key AUTOINCREMENT, title varchar(255),status int(11), url varchar(255), thumb varchar(255), pathfile varchar(255), formatfile varchar(255), timevideo varchar(20), site varchar(40), quality varchar(40), filesize varchat(255), created_at datetime DEFAULT CURRENT_TIMESTAMP, tempid varchar(255))',
      () => {
        // Add tempid column if it doesn't exist (for existing databases)
        db.all('PRAGMA table_info(history)', (err, rows) => {
          if (rows && !rows.find((row) => row.name === 'tempid')) {
            db.run('ALTER TABLE history ADD COLUMN tempid varchar(255)')
          }
        })
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

  mainWindow.on('maximize', () => {
    max = true
  })

  mainWindow.on('unmaximize', () => {
    max = false
  })

  ipcMain.on('setState', (e, v) => {
    if (v == 'min') {
      if (!mainWindow.isMinimized()) {
        mainWindow.minimize()
      }
    } else if (v == 'max') {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        localpos.x = mainWindow.getBounds().x
        localpos.y = mainWindow.getBounds().y
        mainWindow.maximize()
        mainWindow.focus()
      }
    } else if (v == 'close') {
      app.quit()
    }
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
  const docPath = path.join(documentsPath, 'horny-downloader', 'temp')

  protocol.handle('hornydl', (request) => {
    const filePath = request.url.slice('hornydl://'.length).split('/')[6]
    return net.fetch(url.pathToFileURL(path.join(docPath, filePath)).toString())
  })

  app.setAppUserModelId('com.tokyotf.horny-downloader')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('getList', (e) => {
    db.all(
      'SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration, filesize,quality,tempid from history',
      (err, row) => {
        if (row && row.length > 0) {
          e.reply('getList', row)
        }
      }
    )
  })

  ipcMain.on('telegram-add-url', (e, url) => {
    if (url && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('telegram-url-received', url)
    }
  })

  ipcMain.handle('extract-video-data', async (e, url) => {
    try {
      const registry = extensionRegistry
      const videoData = await registry.extractVideo(url)

      if (videoData.is_batch && videoData.batch_urls && videoData.batch_urls.length > 0) {
        return {
          is_batch: true,
          batch_urls: videoData.batch_urls,
          title: videoData.title || 'Album',
          status: videoData.status || 200
        }
      }

      return {
        url: url,
        site: videoData.site || 'unknown',
        title:
          decodeURIComponent(escape(videoData.title.replace(/[^a-zA-Z0-9 ]/g, ''))) ||
          'Unknown Title',
        video_test: videoData.video_test || [],
        thumb: videoData.thumb || '',
        list_quality: videoData.list_quality || [],
        subtitles: videoData.subtitles || [],
        time: videoData.time || '0:0:0',
        embed: videoData.embed || '',
        status: videoData.status || 404,
        force_type: videoData.force_type,
        referer: videoData.referer
      }
    } catch (error) {
      logger.error('Error extracting video:', error)
      return { success: false, ...extensionErrorPayload(error, url) }
    }
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
      logger.error('deleteItem error:', err)
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
      logger.error('Error getting extensions status:', error)
      return { loaded: {}, failed: {}, total: 0 }
    }
  })

  ipcMain.handle('get-extension-logs', async (e, options = {}) => {
    try {
      return getExtensionLogs(options)
    } catch (error) {
      logger.error('Error reading extension logs:', error)
      return []
    }
  })

  ipcMain.handle('clear-extension-logs', async () => {
    clearExtensionLogs()
    return { success: true }
  })

  ipcMain.handle('is-dev', () => {
    return is.dev
  })

  ipcMain.handle('copy-extensions-to-documents', async () => {
    if (!is.dev) return { success: false, error: 'Not in dev mode' }
    try {
      const srcExt = path.join(process.cwd(), 'extensions')
      const destExt = path.join(documentsPath, 'horny-downloader', 'extensions')

      if (!existsSync(srcExt)) {
        return { success: false, error: 'Source extensions folder not found' }
      }

      if (!existsSync(destExt)) {
        mkdirSync(destExt, { recursive: true })
      }

      const files = readdirSync(srcExt)
      let count = 0

      for (const file of files) {
        if (file.endsWith('.js')) {
          cpSync(path.join(srcExt, file), path.join(destExt, file))
          count++
        }
      }

      return { success: count > 0, count }
    } catch (error) {
      logger.error('Error copying extensions:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('reload-extensions', async () => {
    try {
      await extensionRegistry.reloadExtensions()
      const status = await extensionRegistry.getAllExtensionsStatus()

      return status
    } catch (error) {
      logger.error('Error reloading extensions:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('get-supported-domains', async () => {
    try {
      return await extensionRegistry.getSupportedDomains()
    } catch (error) {
      logger.error('Error getting supported domains:', error)
      return []
    }
  })

  ipcMain.handle('check-for-extension-updates', async (e, branch = 'main') => {
    try {
      return await extensionRegistry.checkForUpdates(branch)
    } catch (error) {
      logger.error('Error checking for updates:', error)
      return []
    }
  })

  ipcMain.handle('update-extension', async (e, { name, branch, fileName }) => {
    try {
      return await extensionRegistry.updateExtension(name, branch || 'main', fileName || null)
    } catch (error) {
      logger.error(`Error updating extension ${name}:`, error)
      return false
    }
  })

  ipcMain.handle('list-remote-extensions', async (e, branch) => {
    try {
      return await extensionRegistry.listRemoteExtensions(branch || 'main')
    } catch (error) {
      logger.error('Error listing remote extensions:', error)
      return []
    }
  })

  ipcMain.handle('open-devtools', () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) win.webContents.toggleDevTools()
  })

  ipcMain.handle('list-local-extensions', async () => {
    try {
      const extensionsDir = is.dev
        ? path.join(process.cwd(), 'extensions')
        : path.join(documentsPath, 'horny-downloader', 'extensions')
      const files = readdirSync(extensionsDir).filter(
        (f) => f.endsWith('Extension.js') && f !== 'Extension.js' && f !== 'index.js'
      )
      return files.map((f) => f.replace('Extension.js', '').toLowerCase())
    } catch (error) {
      logger.error('Error listing local extensions:', error)
      return []
    }
  })

  ipcMain.handle('install-extension', async (e, { name, branch, fileName }) => {
    try {
      return await extensionRegistry.installExtension(name, branch || 'main', fileName || null)
    } catch (error) {
      logger.error(`Error installing extension ${name}:`, error)
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
        logger.error('Error reading batch file:', err)
        return { error: err.message }
      }
    }
    return { count: 0, urls: [] }
  })

  ipcMain.handle('start-batch-download', async (e, options) => {
    processBatchUrls(options)
    return { success: true }
  })

  ipcMain.handle('resolve-video-metadata', async (e, { url }) => {
    try {
      const registry = extensionRegistry
      const videoData = await registry.extractVideo(url)
      return normalizeVideoMetadata(url, videoData)
    } catch (error) {
      logger.error(`Error resolving metadata for ${url}:`, error)
      return { success: false, url, ...extensionErrorPayload(error, url) }
    }
  })

  // Fetch a text resource (e.g. .vtt subtitles) through Chromium's network
  // stack so the renderer can load it as a blob URL. <track> elements fetch
  // cross-origin vtt files in CORS mode and many CDNs do not send
  // Access-Control-Allow-Origin, which logs "Unsafe attempt to load URL".
  ipcMain.handle('fetch-proxy-text', async (e, url) => {
    const resp = await proxyFetch(String(url))
    if (!resp.ok) throw new Error(`Request failed with status ${resp.status}`)
    return await resp.text()
  })

  ipcMain.on('addToDownload', async (e, v) => {
    const job = {
      title: v.title || 'Unknown',
      format: v.format || 'mkv',
      thumb: v.thumb || '',
      site: v.site || 'unknown',
      url: v.url || '',
      video_src: v.video_src || '',
      quality: v.quality || '',
      duration: v.time || '0:0:0',
      referer: v.referer || '',
      subtitle_url: v.subtitle_url || '',
      subtitle_language: v.subtitle_language || '',
      tempid: randomUUID(),
      localid: 0,
      status: 'pending',
      fromTelegram: v.fromTelegram || false
    }
    await enqueueDownload(job)
  })

  ipcMain.handle('process-queue', async () => {
    const pending = await new Promise((resolve) => {
      db.all('SELECT url FROM history WHERE status = 0', (err, row) => resolve(row || []))
    })
    if (pending.length > 0) {
      const urls = pending.map((p) => p.url)
      processBatchUrls(urls, 'max', 4000)
      return { success: true, count: urls.length }
    }
    return { success: false, count: 0 }
  })

  ipcMain.handle('export-list', async (e, { format }) => {
    const downloads = await new Promise((resolve) => {
      db.all(
        'SELECT id,title,thumb,status,site,url,pathfile,created_at,formatfile as format,timevideo as duration,filesize,quality from history ORDER BY created_at DESC',
        (err, row) => resolve(row || [])
      )
    })

    if (format === 'json') {
      return JSON.stringify(downloads, null, 2)
    } else if (format === 'csv') {
      const headers = [
        'id',
        'title',
        'site',
        'url',
        'status',
        'format',
        'quality',
        'filesize',
        'created_at',
        'pathfile'
      ]
      const csvRows = downloads.map((d) =>
        headers
          .map((h) => {
            const val = d[h] !== null && d[h] !== undefined ? String(d[h]).replace(/"/g, '""') : ''
            return `"${val}"`
          })
          .join(',')
      )
      return [headers.join(','), ...csvRows].join('\n')
    }
    return ''
  })

  ipcMain.handle('get-logs', async () => {
    return logger.getRecentLogs(500)
  })

  function cleanVideoTitle(value) {
    if (!value) return ''
    let title = String(value)
    try {
      title = decodeURIComponent(title)
    } catch {}
    return title
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function normalizeVideoMetadata(url, videoData) {
    const listQuality = Array.isArray(videoData.list_quality) ? videoData.list_quality : []
    const subtitles = Array.isArray(videoData.subtitles) ? videoData.subtitles : []

    return {
      success: true,
      url,
      is_batch: !!(videoData.is_batch && videoData.batch_urls && videoData.batch_urls.length > 0),
      batch_urls: videoData.batch_urls || [],
      title: cleanVideoTitle(videoData.title),
      thumb: videoData.thumb || '',
      site: videoData.site || 'unknown',
      time: videoData.time || '',
      embed: videoData.embed || '',
      video_test: videoData.video_test || '',
      list_quality: listQuality,
      subtitles,
      referer: videoData.referer || '',
      force_type: videoData.force_type || '',
      proxy_method: videoData.proxy_method || false
    }
  }

  function pickBatchQuality(qualities, preference) {
    const valid = (qualities || []).filter((q) => q && (q.url || q.src))
    if (valid.length === 0) return null

    const sorted = [...valid].sort(
      (a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0)
    )

    if (preference === 'low') return sorted[sorted.length - 1]
    if (preference === 'medium') return sorted[Math.floor(sorted.length / 2)]

    const preferenceValue = String(preference || '')
      .trim()
      .toLowerCase()
    const exactMatch = sorted.find(
      (quality) => String(quality.quality || '').toLowerCase() === preferenceValue
    )
    if (exactMatch) return exactMatch

    const target = parseInt(preference, 10)
    if (!isNaN(target) && String(preference).trim() !== '') {
      const match = sorted.find((q) => {
        const value = parseInt(q.quality, 10)
        return !isNaN(value) && value <= target
      })
      return match || sorted[sorted.length - 1]
    }

    return sorted[0]
  }

  function pickBatchSubtitles(subtitles, mode, language) {
    const list = Array.isArray(subtitles) ? subtitles.filter((s) => s && s.url) : []
    if (list.length === 0 || !mode || mode === 'none') return {}

    if (mode === 'all') {
      return { subtitles_all: list }
    }

    if (mode === 'language') {
      const lang = String(language || '')
        .toLowerCase()
        .trim()
      if (lang) {
        const match = list.find((s) => {
          return (
            String(s.language || '')
              .toLowerCase()
              .includes(lang) ||
            String(s.name || '')
              .toLowerCase()
              .includes(lang)
          )
        })
        if (match) {
          return { subtitle_url: match.url, subtitle_language: match.language || '' }
        }
      }
    }

    return { subtitle_url: list[0].url, subtitle_language: list[0].language || '' }
  }

  async function processBatchUrls(input, legacyQuality, legacyDelay) {
    const options =
      input && typeof input === 'object' && !Array.isArray(input)
        ? input
        : { urls: input, quality: legacyQuality, delay: legacyDelay }

    const {
      urls = [],
      quality = 'max',
      delay = 0,
      format,
      subtitleMode = 'none',
      subtitleLanguage = '',
      metadata = {}
    } = options

    const registry = extensionRegistry
    const total = urls.length

    const sendProgress = (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('batch-progress', {
          total,
          processed: 0,
          remaining: total,
          ...payload
        })
      }
    }

    sendProgress({ processed: 0, remaining: total, status: 'started' })

    for (let index = 0; index < total; index++) {
      const url = urls[index]

      try {
        if (delay && delay > 0 && index > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }

        sendProgress({
          processed: index,
          remaining: total - index,
          status: 'processing',
          currentUrl: url
        })

        const videoData = await registry.extractVideo(url)

        if (videoData.is_batch && videoData.batch_urls && videoData.batch_urls.length > 0) {
          logger.debug(`Skipping album URL in batch: ${url}`)
          sendProgress({
            processed: index + 1,
            remaining: total - index - 1,
            lastUrl: url,
            lastStatus: 'album'
          })
          continue
        }

        const selectedQuality = pickBatchQuality(videoData.list_quality, quality)
        let bestQualitySrc = ''
        let bestQualityLabel = ''

        if (selectedQuality) {
          bestQualitySrc = selectedQuality.url || selectedQuality.src
          bestQualityLabel = selectedQuality.quality || ''
        } else {
          bestQualitySrc = videoData.video_test
          bestQualityLabel = 'unknown'
        }

        if (
          !bestQualitySrc &&
          typeof videoData.video_test === 'string' &&
          videoData.video_test.startsWith('http')
        ) {
          bestQualitySrc = videoData.video_test
        }

        if (bestQualitySrc && bestQualitySrc.startsWith('http')) {
          const meta = metadata[url] || {}
          const title =
            cleanVideoTitle(meta.title) || cleanVideoTitle(videoData.title) || 'Unknown Title'
          const subtitleFields = pickBatchSubtitles(
            videoData.subtitles,
            subtitleMode,
            subtitleLanguage
          )

          const job = {
            title,
            thumb: meta.thumb || videoData.thumb || '',
            site: meta.site || videoData.site || 'unknown',
            url,
            format: format || local_settings.default_format || 'mkv',
            video_src: bestQualitySrc,
            tempid: randomUUID(),
            duration: meta.time || videoData.time || '00:00:00',
            quality: bestQualityLabel,
            referer: videoData.referer || meta.referer || '',
            proxy_method: videoData.proxy_method || false,
            ...subtitleFields
          }

          await enqueueDownload(job)

          sendProgress({
            processed: index + 1,
            remaining: total - index - 1,
            lastUrl: url,
            lastStatus: 'queued',
            lastTitle: title
          })
        } else {
          logger.warn(`No valid video source for URL: ${url}`)
          sendProgress({
            processed: index + 1,
            remaining: total - index - 1,
            lastUrl: url,
            lastStatus: 'failed',
            error: 'No video source found'
          })
        }
      } catch (err) {
        logger.error(`Failed to process batch url ${url}:`, err)
        sendProgress({
          processed: index + 1,
          remaining: total - index - 1,
          lastUrl: url,
          lastStatus: 'failed',
          error: err.message
        })
      }
    }

    sendProgress({
      processed: total,
      remaining: 0,
      status: 'finished'
    })
  }

  telegramBotInstance = init({
    activeJobs,
    localSettings: local_settings,
    mainWindow,
    logger,
    extractVideo: async (url) => {
      const registry = extensionRegistry
      return await registry.extractVideo(url)
    },
    processBatchUrls: (urls, quality, delay) => {
      processBatchUrls(urls, quality, delay)
    }
  })

  ipcMain.on('getCheck', async (e, v) => {
    const {
      title,
      format,
      thumb,
      site,
      url,
      video_src,
      tempid,
      duration,
      quality,
      referer,
      subtitle_url,
      subtitle_language,
      subtitles_all,
      proxy_method
    } = v

    if (title && format && site && url && video_src) {
      await enqueueDownload({
        title,
        format,
        thumb,
        site,
        url,
        video_src,
        tempid,
        duration,
        quality,
        referer,
        subtitle_url: subtitle_url || '',
        subtitle_language: subtitle_language || '',
        subtitles_all: subtitles_all || [],
        proxy_method: proxy_method || false
      })
    }
  })

  ipcMain.on('getVideo', async (e, v) => {
    try {
      const registry = extensionRegistry

      const videoData = await registry.extractVideo(v.url)
      console.log(videoData)
      if (videoData.is_batch && videoData.batch_urls && videoData.batch_urls.length > 0) {
        e.reply('getVideo', {
          is_batch: true,
          batch_urls: videoData.batch_urls,
          title: videoData.title || 'Album',
          status: videoData.status || 200
        })
        return
      }

      const videoObject = {
        url: v.url,
        site: videoData.site || 'unknown',
        title: cleanVideoTitle(videoData.title) || 'Unknown Title',
        video_test: videoData.video_test || [],
        thumb: videoData.thumb || '',
        list_quality: videoData.list_quality || [],
        subtitles: videoData.subtitles || [],
        time: videoData.time || '0:0:0',
        embed: videoData.embed || '',
        status: videoData.status || 404,
        force_type: videoData.force_type,
        referer: videoData.referer,
        proxy_method: videoData.proxy_method || false
      }
      e.reply('getVideo', videoObject)
    } catch (error) {
      logger.error('Error extracting video:', error)
      e.reply('getVideo', extensionErrorPayload(error, v.url))
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  destroyProxyWindow()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
