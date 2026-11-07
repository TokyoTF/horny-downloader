export default class HqpornerExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Hqporner',
      color: '#ff8397b0',
      domains_support: ['hqporner.com', 'www.hqporner.com', 'm.hqporner.com'],
      domains_includes: ['/hdporn/'],
      embed_preview: '',
      prefix_url: 'hqporner.com',
      referer: true,
      format_support: ['mp4'],
      vtt_support: false,
      quality_support: ['2160', '1080', '720', '480', '360'],
      patterns: ['https://*.mydaddy.cc/*', 'https://*.bigcdn.cc/*'],
      referer_url: 'https://mydaddy.cc/',
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  /**
   * Resolve any hqporner link to the canonical video page that holds the player
   * iframe. The mobile host renders a different markup, so every hqporner sub
   * domain is rewritten to the desktop one. Share links pointing at /girls/,
   * /studio/... or /video/<slug>/<id>-x.html are rewritten too, and landing
   * links that hold no video id return null.
   * @param {string} url - Video URL
   * @returns {string|null} Video page URL or null when the link holds no video id
   */
  buildVideoPageUrl(url) {
    let canonical = url

    try {
      const parsed = new URL(url)
      const host = parsed.hostname
      if (host === this.config.prefix_url || host.endsWith(`.${this.config.prefix_url}`)) {
        parsed.hostname = this.config.prefix_url
        canonical = parsed.toString()
      }
    } catch {}

    if (/\/hdporn\/\d+/i.test(canonical)) return canonical.split('#')[0]

    const match = /(?:\/girls\/|\/porn\/|\/video\/).*?\/(\d+)-([a-z0-9-]+)\.html/i.exec(canonical)
    if (match) {
      return `https://${this.config.prefix_url}/hdporn/${match[1]}-${match[2]}.html`
    }

    return null
  }

  async extract(url) {
    const pageUrl = this.buildVideoPageUrl(url)

    if (!pageUrl) {
      this.extension.log('error', 'This link is not a video page', {
        code: 'NOT_A_VIDEO_PAGE',
        url
      })
      return
    }

    const req = await fetch(pageUrl, {
      headers: this.extension.getDefaultHeaders()
    })

    const view = await req.text()
    const $ = this.extension.cherrio(view)

    if (req.status === 404) {
      this.extension.log('error', 'The Video is Deleted', {
        code: 'VIDEO_DELETED',
        status: 404,
        url: pageUrl
      })
      return
    }

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title')
        .text()
        .replace(/\s*[-|]\s*HQporner\.com\s*$/i, '')
        .trim() ||
      $('h1.main-h1').first().text().trim() ||
      'Unknown Title'

    const description = $('meta[name="description"]').attr('content') || ''
    const durationMatch = /video duration is\s+((?:\d+\s*h)?\s*(?:\d+\s*min)?\s*\d*\s*sec)/i.exec(
      description
    )
    const time_video = durationMatch ? this.extension.parseDurationText(durationMatch[1]) : ''

    // The player is an iframe hosted on mydaddy.cc, which serves the files itself
    const iframeSrc =
      $('iframe[src*="mydaddy.cc/video/"]').attr('src') ||
      $('iframe[src*="//mydaddy.cc"]').attr('src') ||
      ''

    if (!iframeSrc) {
      this.extension.log('error', 'Could not find the player on this page', {
        code: 'PLAYER_NOT_FOUND',
        status: req.status,
        url: pageUrl
      })
      return
    }

    const embedUrl = this.extension.toAbsoluteUrl(iframeSrc)

    const playerReq = await fetch(embedUrl, {
      headers: this.extension.getDefaultHeaders({ Referer: `https://${this.config.prefix_url}/` })
    })

    const playerView = await playerReq.text()

    // mydaddy.cc injects the player html from javascript, so every quote comes escaped
    const sources = []
    const seen = new Set()
    const sourceRegex = /<source[^>]*?src=\\?"([^"\\]+)\\?"[^>]*?title=\\?"([^"\\]*)\\?"[^>]*>/gi
    let match

    while ((match = sourceRegex.exec(playerView)) !== null) {
      const sourceUrl = this.extension.toAbsoluteUrl(match[1])
      const quality = this.extension.normalizeQuality(match[2])
      if (!sourceUrl || !quality || seen.has(sourceUrl)) continue

      seen.add(sourceUrl)
      sources.push({ quality, url: sourceUrl })
    }

    if (sources.length === 0) {
      this.extension.log('error', 'No playable source found for this video', {
        code: 'NO_SOURCE',
        status: playerReq.status,
        url: embedUrl
      })
      return
    }

    const list_quality = sources.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
    const video_test = list_quality[0].url
    const thumb = this.buildThumb(video_test)

    return this.extension.createResponse({
      embed: embedUrl,
      video_test,
      list_quality,
      title: title
        .substring(0, 230)
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
      time: time_video,
      thumb,
      status: req.status,
      force_type: 'video/mp4'
    })
  }

  /**
   * mydaddy.cc exposes the poster next to the files as main.jpg.
   * @param {string} sourceUrl - Any of the video sources
   * @returns {string} Poster URL
   */
  buildThumb(sourceUrl) {
    try {
      const url = new URL(sourceUrl)
      return `${url.origin}${url.pathname.replace(/\/[^/]*$/, '/main.jpg')}`
    } catch {
      return ''
    }
  }
}
