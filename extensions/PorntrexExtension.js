export default class PorntrexExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Porntrex',
      color: '#F7A81Bb0',
      domains_support: ['porntrex.com', 'www.porntrex.com'],
      domains_includes: ['/video/', '/embed/'],
      embed_preview: 'embed',
      prefix_url: 'www.porntrex.com',
      referer: true,
      format_support: ['mp4'],
      vtt_support: false,
      proxy_method: true,
      quality_support: ['2160', '1080', '720', '540', '480', '360'],
      patterns: ['https://*.porntrex.com/*', 'https://*.cdntrex.com/*'],
      referer_url: 'https://www.porntrex.com/',
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
    this.qualityFields = [
      ['video_url', 'video_url_text'],
      ['video_alt_url', 'video_alt_url_text'],
      ['video_alt_url2', 'video_alt_url2_text'],
      ['video_alt_url3', 'video_alt_url3_text'],
      ['video_alt_url4', 'video_alt_url4_text']
    ]
  }

  /**
   * Fetch a page and parse the KVS player configuration out of it.
   * @param {string} url - Page URL
   * @returns {Promise<Object|null>} Page payload or null when the request failed
   */
  async fetchPage(url) {
    const req = await fetch(url, {
      redirect: 'follow',
      headers: this.extension.getDefaultHeaders()
    })

    if (req.status === 404) return null

    const view = await req.text()
    const flashvars = this.parseFlashvars(view)

    return { req, view, flashvars }
  }

  /**
   * Read the flat `var flashvars = { ... }` object into a plain map.
   * The player embeds it next to the sources, so it survives on both the video
   * page and the bare embed page.
   * @param {string} view - Page HTML
   * @returns {Object} Player fields
   */
  parseFlashvars(view) {
    const block = /var\s+flashvars\s*=\s*\{[\s\S]*?\};/.exec(view)
    if (!block) return {}

    const fields = {}
    const pairRegex = /([A-Za-z_]\w*)\s*:\s*'((?:[^'\\]|\\.)*)'/g
    let match

    while ((match = pairRegex.exec(block[0])) !== null) {
      fields[match[1]] = match[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }

    return fields
  }

  async extract(url) {
    const page = await this.fetchPage(url)

    if (!page) {
      this.extension.log('error', 'The Video is Deleted', {
        code: 'VIDEO_DELETED',
        status: 404,
        url
      })
      return
    }

    // The bare embed page only exposes the default source: every higher quality
    // slot holds the canonical video page instead of a file, so follow it once.
    let source = page
    if (page.flashvars.embed_mode === '1') {
      const canonical =
        page.flashvars.logo_url || page.flashvars.video_click_url || page.flashvars.video_alt_url

      if (canonical && canonical.includes('/video/')) {
        const full = await this.fetchPage(canonical)
        if (full?.flashvars.video_url) source = full
      }
    }

    const flashvars = source.flashvars
    const $ = this.extension.cherrio(source.view)
    const videoId =
      flashvars.video_id || /\/embed\/(\d+)/.exec(url)?.[1] || /\/video\/(\d+)/.exec(url)?.[1] || ''

    const title =
      flashvars.video_title?.trim() ||
      $('p.title-video').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      'Unknown Title'

    const thumb = this.extension.toAbsoluteUrl(
      flashvars.preview_url || $('meta[property="og:image"]').attr('content') || ''
    )

    const $clock = $('.info-block .item i.fa-clock-o').first()
    const durationText = $clock.length ? $clock.parent().find('em.badge').first().text() : ''
    const time_video = this.extension.parseDurationText(durationText)

    if (!flashvars.video_url) {
      this.extension.log('error', 'Could not find the player on this page', {
        code: 'PLAYER_NOT_FOUND',
        status: source.req.status,
        url
      })
      return
    }

    const list_quality = []
    const seen = new Set()

    for (const [field, labelField] of this.qualityFields) {
      const fileUrl = flashvars[field]
      // On the embed page the higher slots hold the video page URL instead of a file
      if (!fileUrl || fileUrl.includes('/video/')) continue
      if (flashvars[`${field}_redirect`] === '1') continue
      if (seen.has(fileUrl)) continue

      const quality = this.extension.normalizeQuality(flashvars[labelField])
      if (!quality) continue

      seen.add(fileUrl)
      list_quality.push({ quality, url: fileUrl })
    }

    if (list_quality.length === 0) {
      this.extension.log('error', 'No playable source found for this video', {
        code: 'NO_SOURCE',
        status: source.req.status,
        url
      })
      return
    }

    list_quality.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))

    return this.extension.createResponse({
      embed: videoId ? `https://${this.config.prefix_url}/embed/${videoId}` : '',
      video_test: list_quality[0].url,
      list_quality,
      title,
      time: time_video,
      thumb,
      status: source.req.status,
      force_type: 'video/mp4'
    })
  }
}
