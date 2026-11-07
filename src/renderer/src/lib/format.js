// Pure formatting / parsing helpers shared by the renderer components.
// Caches live at module level so every component reuses the same results.

const parseCreatedAtCache = new Map()
const formatTimeCache = new Map()
const bytesToSizeCache = new Map()

export function parseCreatedAt(val) {
  if (parseCreatedAtCache.has(val)) return parseCreatedAtCache.get(val)
  let result = 0
  if (!val) result = 0
  else if (val instanceof Date) result = val.getTime()
  else if (typeof val === 'number') result = val
  else if (typeof val === 'string') {
    const iso = val.includes('T') ? val : val.replace(' ', 'T')
    const t = new Date(iso).getTime()
    if (!isNaN(t)) result = t
    else {
      const t2 = new Date(val).getTime()
      result = isNaN(t2) ? 0 : t2
    }
  } else {
    try {
      const t = new Date(val).getTime()
      result = isNaN(t) ? 0 : t
    } catch {
      result = 0
    }
  }
  parseCreatedAtCache.set(val, result)
  return result
}

export function toSeconds(timemark) {
  if (!timemark) return 0
  const parts = timemark.split(':')
  if (parts.length < 3) return 0
  const [hh, mm, ss] = parts
  const seconds = parseFloat(ss) + (parseInt(mm, 10) || 0) * 60 + (parseInt(hh, 10) || 0) * 3600
  return isNaN(seconds) ? 0 : seconds
}

export function format_time(time, secondTime) {
  const cacheKey = `${time}|${secondTime}`
  if (formatTimeCache.has(cacheKey)) return formatTimeCache.get(cacheKey)
  const secondsTimeTrack = secondTime ? time : toSeconds(time)
  const hours = Math.floor(secondsTimeTrack / 3600)
  const minutes = Math.floor((secondsTimeTrack % 3600) / 60)
  const seconds = Math.floor(secondsTimeTrack % 60)
  const result = `${hours > 0 ? hours + 'h ' : ''}${minutes > 0 ? minutes + 'm ' : ''}${seconds > 0 ? seconds + 's' : ''}`
  formatTimeCache.set(cacheKey, result)
  return result
}

export function bytesToSize(bytes) {
  if (bytesToSizeCache.has(bytes)) return bytesToSizeCache.get(bytes)
  var sizes = ['B', 'K', 'M', 'G', 'T', 'P']
  var b = bytes
  for (var i = 0; i < sizes.length; i++) {
    if (b <= 1024) {
      const result = Math.round(b) + ' ' + sizes[i]
      bytesToSizeCache.set(bytes, result)
      return result
    }
    b = parseFloat(b / 1024).toFixed(2)
  }
  const result = b + ' P'
  bytesToSizeCache.set(bytes, result)
  return result
}

export function formatQualityLabel(quality) {
  if (!quality) return 'Unknown'
  if (quality === 'original') return 'Original'
  if (quality === 'unknown') return 'Unknown'
  const value = String(quality)
  return /^\d+$/.test(value) ? `${value}p` : value
}

export function sameItem(a, b) {
  if (!a || !b) return false
  if (a.tempid != null && b.tempid != null) return a.tempid === b.tempid
  if (a.id != null && b.id != null) return a.id === b.id
  if (a.url && b.url) return a.url === b.url
  return false
}
