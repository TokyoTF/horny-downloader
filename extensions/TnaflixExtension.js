export default class TnaflixExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Tnaflix',
      color: '#1D7DBDb0',
      domains_support: ['tnaflix.com', 'www.tnaflix.com'],
      domains_includes: ['/hd-videos/', '/video', '/hd-video/'],
      embed_preview: 'video',
      prefix_url: 'www.tnaflix.com',
      referer: true,
      format_support: ['mp4'],
      vtt_support: false,
      quality_support: ['2160', '1080', '720', '480', '360', '240', '144'],
      patterns: ['https://*.tnaflix.com/*', 'https://player.tnaflix.com/*'],
      referer_url: 'https://www.tnaflix.com/',
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    // Base helper reads the id from domains_includes; the regex is a fallback
    // for /hd-videos/<slug>/video<id> layouts where the slug confuses it
    const videoId =
      String(this.extension.extractVideoId(url) || '').replace(/\D/g, '') ||
      /\/video(\d+)/i.exec(url)?.[1] ||
      ''
    if (!videoId) {
      this.extension.log('error', 'Could not read the video id from this link', {
        code: 'INVALID_URL',
        url
      })
      return
    }

    const req = await fetch(url, {
      redirect: 'follow',
      headers: this.extension.getDefaultHeaders()
    })

    const view = await req.text()
    const $ = this.extension.cherrio(view)

    if (req.status === 404) {
      this.extension.log('error', 'The Video is Deleted', {
        code: 'VIDEO_DELETED',
        status: 404,
        url
      })
      return
    }

    const $player = $('#video-player').length ? $('#video-player') : $('video').first()
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $player.attr('data-vid') ||
      $('h1').first().text().trim() ||
      'Unknown Title'

    const thumb =
      $('meta[itemprop="image"]').attr('content') ||
      $('meta[property="og:image"]').attr('content') ||
      $player.attr('poster') ||
      ''

    // The schema block carries the duration as an ISO 8601 period, e.g. PT00H17M13S
    let schema = null
    try {
      schema = JSON.parse($('script[type="application/ld+json"]').first().text())
    } catch {}

    const time_video = schema?.duration ? this.extension.formatDuration(schema.duration, 'pt') : ''

    const list_quality = []
    const seen = new Set()

    $player.find('source').each((_, source) => {
      const src = $(source).attr('src')
      const size = $(source).attr('size')
      if (!src || !size || seen.has(src)) return

      seen.add(src)
      list_quality.push({ quality: String(size), url: src })
    })

    if (list_quality.length === 0) {
      this.extension.log('error', 'No playable source found for this video', {
        code: 'NO_SOURCE',
        status: req.status,
        url
      })
      return
    }

    list_quality.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))

    return this.extension.createResponse({
      embed: `https://player.tnaflix.com/video/${videoId}`,
      video_test: list_quality[0].url,
      list_quality,
      title,
      time: time_video,
      thumb,
      status: req.status,
      force_type: 'video/mp4'
    })
  }
}
