import { BrowserWindow, net, session } from 'electron'
import { writeFileSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
import path from 'path'
import logger from '../src/main/logger.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

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
    return cookies.map(c => `${c.name}=${c.value}`).join('; ')
  } catch {
    return ''
  }
}

async function netFetch(url) {
  const safeUrl = validateUrl(url)
  const cookieHeader = await getCookies(safeUrl)
  const headers = { 'User-Agent': UA }
  if (cookieHeader) headers['Cookie'] = cookieHeader
  return await net.fetch(safeUrl, { headers })
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

async function rendererFetch(url) {
  const safeUrl = validateUrl(url)
  const origin = new URL(safeUrl).origin
  const win = await ensureFallbackWindow(origin)
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const r = await fetch(${JSON.stringify(safeUrl)}, { credentials: 'include' })
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

export async function proxyFetch(url) {
  if (useFallback) return rendererFetch(url)

  try {
    const resp = await netFetch(url)
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
    return rendererFetch(url)
  } catch (err) {
    //logger.info(`[proxy] net.fetch failed: ${err.message}, switching to renderer fallback`)
    useFallback = true
    return rendererFetch(url)
  }
}

export function destroyProxyWindow() {
  if (fallbackWindow && !fallbackWindow.isDestroyed()) {
    fallbackWindow.destroy()
    fallbackWindow = null
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
  try { unlinkSync(filePath) } catch {
    setTimeout(() => { try { unlinkSync(filePath) } catch {} }, 1000)
  }
}
