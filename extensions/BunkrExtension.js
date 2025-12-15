export default class BunkrExtension {
  constructor(ExtensionExtra) {
    this.config = {
      domains_support: ['bunkr.cr', 'bunkr.site','bunkr.si'],
      domains_includes: ['/v/', '/d/', '/i/'],
      embed_preview: '',
      prefix_url: 'bunkr.cr',
      referer: true,
      format_support: ['mp4'],
      vtt_support: false,
      quality_support: ['original'],
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    let list_quality = []

    const req = await fetch(url)
    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const title_video = $('h1.text-3xl').text().trim() || $('meta[property="og:title"]').attr('content')
    const thumb_video = $('video').attr('poster') || $('meta[property="og:image"]').attr('content')
    
    let video_src = $('video source').attr('src')
    if (!video_src) {
        video_src = $('video').attr('src')
    }

    if (!video_src) {
        $('a').each((i, el) => {
            const href = $(el).attr('href')
            if (href && (href.includes('.mp4') || href.includes('download='))) {
                video_src = href
                return false
            }
        })
    }

    if (video_src && !video_src.startsWith('http')) {
        if (video_src.startsWith('/')) {
            const urlObj = new URL(url)
            video_src = urlObj.origin + video_src
        }
    }

    if (video_src) {
      list_quality.push({ quality: 'original', url: video_src })
    }

    return this.extension.createResponse({
      embed: '',
      video_test: video_src,
      list_quality,
      title: title_video || 'Unknown Title',
      time: '',
      thumb: thumb_video,
      status: req.status
    })
  }
}
