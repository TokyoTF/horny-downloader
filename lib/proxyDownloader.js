import { BrowserWindow, net, session } from 'electron'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  createWriteStream,
  openSync,
  readSync,
  closeSync
} from 'fs'
import { randomUUID } from 'crypto'
import path from 'path'
import logger from '../src/main/logger.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

function validateUrl(url) {
  if (typeof url !== 'string') throw new Error('URL must be a string')
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Invalid protocol: ${parsed.protocol}`)
  }
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    throw new Error('Localhost not allowed')
  }
  return parsed.href
}

let fallbackWindow = null
let fallbackOrigin = null

async function getCookies(url) {
  try {
    const cookies = await session.defaultSession.cookies.get({ url })
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  } catch {
    return ''
  }
}

async function netFetch(url, extraHeaders = {}) {
  const safeUrl = validateUrl(url)
  const cookieHeader = await getCookies(safeUrl)
  const headers = { 'User-Agent': UA }
  if (cookieHeader) headers['Cookie'] = cookieHeader
  Object.assign(headers, extraHeaders)
  return await net.fetch(safeUrl, { headers })
}

/**
 * Same as netFetch but returns the raw Response so the body can be streamed
 * to disk instead of being buffered whole in memory.
 */
async function netFetchStream(url, extraHeaders = {}) {
  return await netFetch(url, extraHeaders)
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function parseTotalLength(headers) {
  const contentRange = headers.get('content-range')
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)\s*$/)
    if (match) return parseInt(match[1], 10)
  }
  const contentLength = headers.get('content-length')
  return contentLength ? parseInt(contentLength, 10) : 0
}

/**
 * Stream a fetch Response body into a file, reporting progress (0-89) based on
 * the expected total size. Throws if no data arrives for a while so a stalled
 * connection never leaves the UI stuck at 0%.
 */
async function streamResponseToFile(resp, outFile, total, onProgress) {
  const reader = resp.body.getReader()
  const writer = createWriteStream(outFile)
  const IDLE_TIMEOUT_MS = 45000

  let received = 0
  let lastPct = -1
  let stalled = false
  let idleTimer = setTimeout(() => {
    stalled = true
    reader.cancel().catch(() => {})
  }, IDLE_TIMEOUT_MS)

  const writerError = new Promise((_, reject) => {
    writer.once('error', reject)
  })

  try {
    for (;;) {
      const { done, value } = await Promise.race([
        reader.read(),
        writerError.then(() => {
          throw new Error('Failed to write temp file')
        })
      ])
      if (done) break
      const chunk = Buffer.from(value)
      received += chunk.length
      await new Promise((resolve, reject) => {
        writer.write(chunk, (err) => (err ? reject(err) : resolve()))
      })
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        stalled = true
        reader.cancel().catch(() => {})
      }, IDLE_TIMEOUT_MS)
      if (onProgress && total > 0) {
        const pct = Math.min(89, Math.round((received / total) * 90))
        if (pct !== lastPct) {
          lastPct = pct
          onProgress(pct)
        }
      }
    }
    if (stalled) throw new Error('Download stalled: no data received for 45s')
    if (received === 0) throw new Error('Empty response')
  } finally {
    clearTimeout(idleTimer)
    try {
      await reader.cancel()
    } catch {}
    await new Promise((resolve) => writer.end(resolve))
  }

  return received
}

function looksLikeMp4(filePath) {
  try {
    const fd = openSync(filePath, 'r')
    const head = Buffer.alloc(8)
    readSync(fd, head, 0, 8, 0)
    closeSync(fd)
    return head.toString('latin1', 4, 8) === 'ftyp'
  } catch {
    return false
  }
}

async function ensureFallbackWindow(origin) {
  if (fallbackWindow && !fallbackWindow.isDestroyed() && fallbackOrigin === origin) {
    return fallbackWindow
  }
  if (fallbackWindow && !fallbackWindow.isDestroyed()) {
    fallbackWindow.destroy()
  }
  fallbackWindow = new BrowserWindow({
    show: false,
    webPreferences: { session: session.defaultSession, offscreen: true }
  })
  await fallbackWindow.loadURL(origin)
  fallbackOrigin = origin
  return fallbackWindow
}

async function rendererFetch(url, extraHeaders = {}) {
  const safeUrl = validateUrl(url)
  const origin = new URL(safeUrl).origin
  const win = await ensureFallbackWindow(origin)
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const r = await fetch(${JSON.stringify(safeUrl)}, { credentials: 'include', headers: ${JSON.stringify(extraHeaders)} })
      const buf = await r.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let bin = ''
      for (let i = 0; i < bytes.length; i += 8192) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192))
      }
      return {
        status: r.status,
        ok: r.ok,
        headers: Object.fromEntries(r.headers.entries()),
        bodyBase64: btoa(bin)
      }
    })()
  `)
  const buf = Buffer.from(result.bodyBase64, 'base64')
  return {
    status: result.status,
    ok: result.ok,
    headers: new Map(Object.entries(result.headers)),
    arrayBuffer: () => Promise.resolve(buf),
    text: () => Promise.resolve(buf.toString('utf-8'))
  }
}

let useFallback = false

export async function proxyFetch(url, extraHeaders = {}) {
  if (useFallback) return rendererFetch(url, extraHeaders)

  try {
    const resp = await netFetch(url, extraHeaders)
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer())
      if (buf.length === 0) throw new Error('Empty response')
      return {
        status: resp.status,
        ok: true,
        headers: resp.headers,
        arrayBuffer: () => Promise.resolve(buf),
        text: () => Promise.resolve(buf.toString('utf-8'))
      }
    }
    //logger.info(`[proxy] net.fetch returned ${resp.status}, switching to renderer fallback`)
    useFallback = true
    return rendererFetch(url, extraHeaders)
  } catch (err) {
    //logger.info(`[proxy] net.fetch failed: ${err.message}, switching to renderer fallback`)
    useFallback = true
    return rendererFetch(url, extraHeaders)
  }
}

export function destroyProxyWindow() {
  if (fallbackWindow && !fallbackWindow.isDestroyed()) {
    fallbackWindow.destroy()
    fallbackWindow = null
  }
}

export async function cloudflareFetch(url) {
  const safeUrl = validateUrl(url)

  const win = new BrowserWindow({
    show: false,
    webPreferences: { session: session.defaultSession }
  })

  try {
    await win.loadURL(safeUrl, {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    })

    for (let i = 0; i < 10; i++) {
      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
      if (
        !html.includes('Just a moment') &&
        !html.includes('challenge-platform') &&
        html.length > 5000
      )
        break
      await new Promise((r) => setTimeout(r, 1000))
    }

    const result = await win.webContents.executeJavaScript(`
      (async () => {
        const buf = document.documentElement.outerHTML
        return { status: 200, ok: true, body: buf }
      })()
    `)

    return {
      status: result.status,
      ok: result.ok,
      text: () => Promise.resolve(result.body)
    }
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
  }
}

function parseMasterPlaylist(m3u8Content, baseUrl) {
  let bestHeight = 0
  let bestUrl = null
  const lines = m3u8Content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue
    const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/)
    const nextLine = lines[i + 1]?.trim()
    if (!resMatch || !nextLine || nextLine.startsWith('#')) continue
    const h = parseInt(resMatch[1])
    if (h > bestHeight) {
      bestHeight = h
      bestUrl = nextLine.startsWith('http') ? nextLine : new URL(nextLine, baseUrl).href
    }
  }
  return { url: bestUrl, height: bestHeight }
}

function parseMediaPlaylist(m3u8Content, baseUrl) {
  const segmentUrls = []
  let initUrl = null

  for (const line of m3u8Content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#EXT-X-MAP:URI=')) {
      const match = trimmed.match(/URI="([^"]+)"/)
      if (match) initUrl = new URL(match[1], baseUrl).href
    } else if (trimmed && !trimmed.startsWith('#')) {
      segmentUrls.push(new URL(trimmed, baseUrl).href)
    }
  }
  return { initUrl, segmentUrls }
}

async function downloadSegment(url, index, total) {
  const resp = await proxyFetch(url)
  const buf = Buffer.from(await resp.arrayBuffer())
  //logger.info(`[proxy] Segment ${index}/${total}: ${buf.length} bytes`)
  return buf
}

export async function downloadHlsToMp4(m3u8Url, documentsPath, onProgress) {
  //logger.info('[proxy] Fetching m3u8:', m3u8Url)

  const resp = await proxyFetch(m3u8Url)
  const content = await resp.text()
  if (!content.includes('#EXTM3U')) {
    throw new Error('Response is not a valid m3u8 playlist')
  }

  let playlistUrl = m3u8Url
  let playlistContent = content

  if (content.includes('#EXT-X-STREAM-INF')) {
    const master = parseMasterPlaylist(content, m3u8Url)
    if (!master.url) throw new Error('No valid quality found in master playlist')
    //logger.info(`[proxy] Master playlist → ${master.height}p: ${master.url}`)
    playlistUrl = master.url
    const subResp = await proxyFetch(master.url)
    playlistContent = await subResp.text()
    if (!playlistContent.includes('#EXTM3U')) {
      throw new Error('Media playlist is not valid HLS')
    }
  }

  const { initUrl, segmentUrls } = parseMediaPlaylist(playlistContent, playlistUrl)
  const total = segmentUrls.length + (initUrl ? 1 : 0)
  //logger.info(`[proxy] ${segmentUrls.length} segments${initUrl ? ' + init' : ''}`)

  let downloaded = 0
  const reportProgress = () => {
    downloaded++
    if (onProgress) onProgress(Math.round((downloaded / total) * 90))
  }

  const chunks = []
  if (initUrl) {
    const initBuf = await downloadSegment(initUrl, 'init', 'init')
    chunks.push(initBuf)
    reportProgress()
  }

  for (let i = 0; i < segmentUrls.length; i++) {
    chunks.push(await downloadSegment(segmentUrls[i], i, segmentUrls.length - 1))
    reportProgress()
  }

  const merged = Buffer.concat(chunks)
  const outFile = path.join(documentsPath, 'horny-downloader', 'temp', `proxy_${randomUUID()}.mp4`)
  writeFileSync(outFile, merged)
  //logger.info(`[proxy] Merged: ${outFile} (${merged.length} bytes)`)

  if (onProgress) onProgress(90)
  return outFile
}

export function cleanupTempFile(filePath) {
  if (!filePath) return
  try {
    unlinkSync(filePath)
  } catch {
    setTimeout(() => {
      try {
        unlinkSync(filePath)
      } catch {}
    }, 1000)
  }
}

/**
 * Download a direct media file (usually mp4) through the Chromium network stack
 * and write it to a local temp file, reporting progress while streaming.
 *
 * Some hosts redirect to a CDN that only accepts browser TLS fingerprints, so
 * ffmpeg (which uses the Schannel network stack on Windows) fails with
 * "Creating security context failed". Running the request through Chromium's
 * network stack (like the preview player does) works instead.
 *
 * @param {string} url - Media URL
 * @param {string} documentsPath - Documents path, used to locate the temp folder
 * @param {Function} onProgress - Progress callback (0-90)
 * @param {Object} [options] - Extra options
 * @param {Object} [options.headers] - Extra request headers
 * @returns {Promise<string>} Path to the downloaded temp file
 */
export async function downloadFileToMp4(url, documentsPath, onProgress, options = {}) {
  const baseHeaders = options.headers || {}
  const headerVariants = [{ ...baseHeaders, Range: 'bytes=0-' }, { ...baseHeaders }]

  const tempDir = path.join(documentsPath, 'horny-downloader', 'temp')
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

  let lastError = null

  // Streaming attempts through Chromium's network stack (net.fetch)
  if (!useFallback) {
    for (const headers of headerVariants) {
      const outFile = path.join(tempDir, `proxy_${randomUUID()}.mp4`)
      try {
        const resp = await withTimeout(
          netFetchStream(url, headers),
          30000,
          'Connection to the media host timed out'
        )
        if (!resp.ok || !resp.body) {
          lastError = new Error(`Media request failed with status ${resp.status}`)
          continue
        }
        const total = parseTotalLength(resp.headers)
        await streamResponseToFile(resp, outFile, total, onProgress)
        if (!looksLikeMp4(outFile)) {
          throw new Error('Host returned a non-media response (not an mp4 file)')
        }
        if (onProgress) onProgress(90)
        return outFile
      } catch (err) {
        lastError = err
        try {
          unlinkSync(outFile)
        } catch {}
      }
    }
    // net.fetch did not work for this host: use the buffered renderer fallback
    useFallback = true
  }

  // Buffered fallback through proxyFetch (renderer window if needed)
  for (const headers of headerVariants) {
    try {
      const response = await proxyFetch(url, headers)

      if (!response.ok) {
        lastError = new Error(`Media request failed with status ${response.status}`)
        continue
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length === 0) throw new Error('Empty response')

      // An html payload means the host declined to serve the media file
      const head = buffer
        .slice(0, 512)
        .toString('latin1')
        .replace(/[^\x20-\x7e]/g, '.')
      if (head.startsWith('<') || head.includes('<!doctype') || head.includes('<html')) {
        lastError = new Error('Host returned an html page instead of the media file')
        continue
      }

      const outFile = path.join(tempDir, `proxy_${randomUUID()}.mp4`)
      writeFileSync(outFile, buffer)

      if (onProgress) onProgress(90)
      return outFile
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Failed to download the media file')
}
