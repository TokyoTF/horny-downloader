export default class XfreeExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Xfree',
      color: '#7e1fe0b0',
      domains_support: ['xfree.com', 'www.xfree.com'],
      domains_includes: ['/video', '/embed/'],
      domains_includes_album: ['/playlist/'],
      embed_preview: 'embed',
      prefix_url: 'www.xfree.com',
      referer: false,
      format_support: ['mp4'],
      vtt_support: false,
      quality_support: ['2160', '1080', '720'],
      patterns: ['https://cdn.xfree.com/*', 'https://thumbs.xfree.com/*'],
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  /**
   * Extract the numeric video id from any xfree link:
   * /video?id=1536581&title=..., /video?id=1536581&playlist=154 or /embed/1536581
   * Named parseVideoId (not extractVideoId) because the base helper works on
   * path segments, while xfree carries the id in the query string / embed path.
   * @param {string} url
   * @returns {string|null}
   */
  parseVideoId(url) {
    try {
      const parsed = new URL(url)
      const embedMatch = /\/embed\/(\d+)/.exec(parsed.pathname)
      if (embedMatch) return embedMatch[1]
      const id = parsed.searchParams.get('id')
      if (id && /^\d+$/.test(id)) return id
      const pathMatch = /\/video\/(\d+)/.exec(parsed.pathname)
      if (pathMatch) return pathMatch[1]
    } catch {}
    return null
  }

  /**
   * Build the direct CDN url for a media uuid. The first three hex chars of
   * the uuid form the shard path: 6e21ec6b-... -> /xfree-prod/6/e/2/<uuid>/full.mp4
   * @param {string} uuid - media name from window.__NUXT__
   * @returns {string}
   */
  buildCdnUrl(uuid) {
    return `https://cdn.xfree.com/xfree-prod/${uuid[0]}/${uuid[1]}/${uuid[2]}/${uuid}/full.mp4`
  }

  /**
   * Fetch a page. xfree.com sits behind Cloudflare, so when the plain request
   * hits the "Just a moment" challenge we retry through a real browser window
   * (Chromium, only available inside the packaged app).
   * @param {string} pageUrl
   * @returns {Promise<{status:number, view:string}|null>} null when CF blocked us and no fallback exists
   */
  async fetchPageWithFallback(pageUrl) {
    let status = 0
    let view = ''

    try {
      const req = await fetch(pageUrl, {
        headers: this.extension.getDefaultHeaders({ Cookie: 'have18=1' })
      })
      status = req.status
      view = await req.text()
    } catch {
      status = 0
    }

    if (status === 403 || view.includes('Just a moment') || view.includes('challenge-platform')) {
      let proxyResp
      try {
        proxyResp = await this.extension.cloudflareFetch(pageUrl)
      } catch {
        this.extension.log(
          'error',
          'Cloudflare is blocking this request and the browser fallback is unavailable',
          {
            code: 'CLOUDFLARE_BLOCKED',
            status: 403,
            url: pageUrl
          }
        )
        return null
      }
      view = await proxyResp.text()
      status = 200
    }

    return { status, view }
  }

  async extract(url) {
    if (this.extension.isAlbumUrl(url)) {
      return this.extractPlaylist(url)
    }
    return this.extractVideo(url)
  }

  /**
   * Playlist pages (/playlist/<id>-<slug>) list their videos as /video?id=...
   * links; return them as a batch so the app downloads the whole playlist.
   */
  async extractPlaylist(url) {
    const page = await this.fetchPageWithFallback(url)
    if (!page) return

    if (page.status === 404) {
      this.extension.log('error', 'This playlist does not exist', {
        code: 'PLAYLIST_NOT_FOUND',
        status: 404,
        url
      })
      return
    }

    const ids = []
    for (const match of page.view.matchAll(/\/video\?id=(\d+)/g)) {
      if (!ids.includes(match[1])) ids.push(match[1])
    }

    if (ids.length === 0) {
      this.extension.log('error', 'No videos found in this playlist', {
        code: 'EMPTY_PLAYLIST',
        status: page.status,
        url
      })
      return
    }

    const $ = this.extension.cherrio(page.view)
    const title =
      $('meta[property="og:title"]')
        .attr('content')
        ?.replace(/\s*Porn Playlist\s*$/i, '')
        .trim() ||
      $('h1').first().text().trim() ||
      'Playlist'

    return this.extension.createResponse({
      is_batch: true,
      batch_urls: ids.map((id) => `https://${this.config.prefix_url}/video?id=${id}`),
      title,
      status: page.status
    })
  }

  async extractVideo(url) {
    const videoId = this.parseVideoId(url)

    if (!videoId) {
      this.extension.log('error', 'This link is not a video page', {
        code: 'NOT_A_VIDEO_PAGE',
        url
      })
      return
    }

    // Keep the original query (title slug) when the user pasted a full video
    // link, otherwise build the canonical page from the id alone.
    let pageUrl = `https://${this.config.prefix_url}/video?id=${videoId}`
    try {
      const parsed = new URL(url)
      if (parsed.pathname.startsWith('/video') && parsed.searchParams.get('id') === videoId) {
        pageUrl = parsed.toString()
      }
    } catch {}

    const page = await this.fetchPageWithFallback(pageUrl)
    if (!page) return

    if (page.status === 404) {
      this.extension.log('error', 'The video is deleted or does not exist', {
        code: 'VIDEO_DELETED',
        status: 404,
        url: pageUrl
      })
      return
    }

    const view = page.view
    const $ = this.extension.cherrio(view)

    // og:title looks like "<title> - @user's Sex Reel On xfree.com – TikTok Porn & Shorts"
    const rawTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || ''
    const title = rawTitle
      .split(' - @')[0]
      .replace(/\s*[-–—|]\s*xfree\.com.*$/i, '')
      .trim()

    const thumb = $('meta[property="og:image"]').attr('content') || ''
    let videoUrl =
      $('meta[property="og:video"]').attr('content') ||
      $('meta[property="og:video:secure_url"]').attr('content') ||
      $('meta[name="twitter:player:stream"]').attr('content') ||
      ''
    let duration = parseInt($('meta[property="og:video:duration"]').attr('content') || '0', 10)
    let height = parseInt($('meta[property="og:video:height"]').attr('content') || '0', 10)

    // Fallback: read the media object embedded in window.__NUXT__
    if (!videoUrl || !duration || !height) {
      const mediaIndex = view.indexOf('"media":{')
      if (mediaIndex !== -1) {
        const mediaBlock = view.slice(mediaIndex, mediaIndex + 800)
        const name = /name:"([0-9a-f-]{36})"/i.exec(mediaBlock)?.[1]
        const dur = /duration:([\d.]+)/.exec(mediaBlock)?.[1]
        const h = /height:(\d{3,4})/.exec(mediaBlock)?.[1]
        if (name && !videoUrl) videoUrl = this.buildCdnUrl(name)
        if (!duration && dur) duration = Math.round(parseFloat(dur))
        if (!height && h) height = parseInt(h, 10)
      }
    }

    if (!videoUrl) {
      this.extension.log('error', 'No playable source found for this video', {
        code: 'NO_SOURCE',
        status: page.status,
        url: pageUrl
      })
      return
    }

    const quality = height > 0 ? String(height) : '720'
    const list_quality = [{ quality, url: videoUrl }]

    return this.extension.createResponse({
      embed: `https://${this.config.prefix_url}/embed/${videoId}`,
      video_test: videoUrl,
      list_quality,
      title: title.substring(0, 230) || 'Unknown Title',
      time: duration > 0 ? this.extension.formatDuration(duration) : '',
      thumb,
      status: page.status || 200,
      force_type: 'video/mp4'
    })
  }
}
