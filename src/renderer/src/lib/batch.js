// Helpers for the Batch Import flow (pure functions, no app state).

export function batchTitleFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const lastPart = parts[parts.length - 1] || ''
    let slug = lastPart || parsed.hostname
    try {
      slug = decodeURIComponent(slug)
    } catch {}
    slug = slug
      .replace(/\.(html?|php|mp4|mkv|m3u8|mpd)$/i, '')
      .replace(/[-_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!slug || /^([a-z]?\d{3,}|[a-f0-9]{8,})$/i.test(slug)) {
      const host = parsed.hostname.replace(/^www\./, '')
      return `${host} · ${lastPart || 'link'}`
    }

    return slug.charAt(0).toUpperCase() + slug.slice(1)
  } catch {
    return rawUrl
  }
}

export function createBatchItem(url, albumTitle = '') {
  let hintedTitle = ''
  try {
    const parsed = new URL(url)
    hintedTitle = parsed.searchParams.get('title') || parsed.searchParams.get('name') || ''
  } catch {}

  return {
    url,
    title: hintedTitle || batchTitleFromUrl(url),
    albumTitle,
    thumb: '',
    site: '',
    duration: '',
    quality: '',
    meta: null,
    resolved: false,
    resolving: false,
    resolveToken: 0,
    isAlbum: false,
    albumCount: 0,
    status: 'pending',
    error: ''
  }
}

export function batchStatusLabel(item) {
  switch (item.status) {
    case 'resolving':
      return 'Loading'
    case 'ready':
      return 'Ready'
    case 'failed':
      return 'Error'
    case 'queued':
      return 'Queued'
    case 'processing':
      return 'Processing'
    case 'album':
      return 'Album'
    case 'skipped':
      return 'Skipped'
    default:
      return 'Pending'
  }
}

export function batchStatusClass(item) {
  switch (item.status) {
    case 'ready':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'failed':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'resolving':
    case 'processing':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30'
    case 'queued':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    case 'album':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/30'
    case 'skipped':
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
    default:
      return 'bg-[#2d2d2d] text-gray-400 border-[#3d3d3d]'
  }
}
