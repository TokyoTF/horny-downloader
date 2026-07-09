export default class EromeExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Erome',
      color: '#eb6395b0',
      domains_support: ['erome.com', 'www.erome.com'],
      domains_includes: ['/a/'],
      domains_includes_album: ['/a/'],
      embed_preview: '',
      prefix_url: 'www.erome.com',
      referer: true,
      format_support: ['mp4'],
      vtt_support: false,
      quality_support: ['720', '480'],
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    let duration = ''
    let albumTitle = ''
    let cleanUrl = url
    try {
      const urlObj = new URL(url)
      duration = urlObj.searchParams.get('duration') || ''
      albumTitle = urlObj.searchParams.get('title') || ''
      urlObj.searchParams.delete('duration')
      urlObj.searchParams.delete('title')
      cleanUrl = urlObj.toString()
    } catch {}

    if (/^https?:\/\/v\d+\.erome\.com\/.+\.mp4/i.test(cleanUrl)) {
      const thumbUrl = this.buildThumbFromCdnUrl(cleanUrl)
      const title = albumTitle || this.buildTitleFromCdnUrl(cleanUrl)
      return this.extension.createResponse({
        embed: '',
        video_test: cleanUrl,
        list_quality: [{ quality: 'original', url: cleanUrl }],
        title,
        time: duration || '',
        thumb: thumbUrl,
        status: 200,
        force_type: 'video/mp4'
      })
    }

    const isAlbum = url.includes('/a/')
    if (isAlbum) {
      return this.extractAlbum(url)
    }
    return this.extractVideo(url)
  }

  async extractAlbum(url) {
    const req = await fetch(url, {
      headers: this.extension.getDefaultHeaders()
    })
    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const title =
      $('h1.album-title-page').text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      'Album'

    const videos = this.parseVideos($, view)

    if (videos.length === 1) {
      const v = videos[0]
      return this.extension.createResponse({
        embed: '',
        video_test: v.url,
        list_quality: v.qualities,
        title,
        time: v.duration,
        thumb: v.thumb,
        status: req.status,
        force_type: 'video/mp4'
      })
    }

    return this.extension.createResponse({
      is_batch: true,
      batch_urls: videos.map((v) => {
        const params = new URLSearchParams()
        if (v.duration) params.set('duration', v.duration)
        if (title) params.set('title', title)
        const qs = params.toString()
        return qs ? `${v.url}?${qs}` : v.url
      }),
      title,
      status: req.status
    })
  }

  async extractVideo(url) {
    const req = await fetch(url, {
      headers: this.extension.getDefaultHeaders()
    })
    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const title =
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      'Unknown Title'

    const thumb = $('meta[property="og:image"]').attr('content') || ''

    const videos = this.parseVideos($, view)

    if (videos.length === 0) {
      return this.extension.createResponse({
        embed: '',
        video_test: '',
        list_quality: [],
        title,
        thumb,
        status: req.status
      })
    }

    const v = videos[0]
    return this.extension.createResponse({
      embed: '',
      video_test: v.url,
      list_quality: v.qualities,
      title,
      time: v.duration,
      thumb: thumb || v.thumb,
      status: req.status,
      force_type: 'video/mp4'
    })
  }

  parseVideos($, view) {
    const videos = []
    const seen = new Set()

    $('div.media-group').each((_, group) => {
      const $group = $(group)

      const duration = this.normalizeDuration($group.find('span.duration').text().trim())

      const poster =
        $group.find('video').attr('poster') ||
        $group.find('video').attr('data-poster') ||
        ''

      const qualities = []
      $group.find('video source[type="video/mp4"]').each((_, source) => {
        const src = $(source).attr('src')
        const label = $(source).attr('label') || ''
        const res = $(source).attr('res') || ''
        if (src && !seen.has(src)) {
          seen.add(src)
          qualities.push({
            quality: res || label || 'original',
            url: src
          })
        }
      })

      if (qualities.length > 0) {
        videos.push({
          url: qualities[0].url,
          qualities,
          duration,
          thumb: poster
        })
      }
    })

    if (videos.length === 0) {
      const qualities = []
      $('video source[type="video/mp4"]').each((_, source) => {
        const src = $(source).attr('src')
        const label = $(source).attr('label') || ''
        const res = $(source).attr('res') || ''
        if (src && !seen.has(src)) {
          seen.add(src)
          qualities.push({
            quality: res || label || 'original',
            url: src
          })
        }
      })

      if (qualities.length > 0) {
        const thumb =
          $('video').first().attr('poster') ||
          $('video').first().attr('data-poster') ||
          $('meta[property="og:image"]').attr('content') ||
          ''
        const duration = this.normalizeDuration($('span.duration').first().text().trim())

        videos.push({
          url: qualities[0].url,
          qualities,
          duration,
          thumb
        })
      }
    }

    return videos
  }

  normalizeDuration(raw) {
    if (!raw) return ''
    const parts = raw.split(':').map((x) => x.trim())
    if (parts.length === 3) return raw
    if (parts.length === 2) {
      const h = Math.floor(parseInt(parts[0], 10) / 60)
      const m = parseInt(parts[0], 10) % 60
      const s = parts[1]
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.padStart(2, '0')}`
    }
    return raw
  }

  buildThumbFromCdnUrl(url) {
    try {
      const urlObj = new URL(url)
      const cdnMatch = urlObj.hostname.match(/^v(\d+)/)
      if (!cdnMatch) return ''
      const cdnNum = cdnMatch[1]
      const parts = urlObj.pathname.split('/')
      const filename = parts.pop()
      const mediaHash = filename.replace(/_\d+p\.mp4$/, '')
      return `https://s${cdnNum}.erome.com${parts.join('/')}/thumbs/${mediaHash}.jpg`
    } catch {
      return ''
    }
  }

  buildTitleFromCdnUrl(url) {
    try {
      const urlObj = new URL(url)
      const parts = urlObj.pathname.split('/').filter(Boolean)
      const filename = parts.pop()
      const mediaHash = filename.replace(/_\d+p\.mp4$/, '')
      const albumHash = parts[parts.length - 1] || ''
      return `${albumHash} - ${mediaHash}`
    } catch {
      return 'Erome Video'
    }
  }
}
