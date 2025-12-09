export default class PornoneExtension {
  constructor(ExtensionExtra) {
    this.config = {
      domains_support: ['pornone.com'],
      domains_includes: ['/'],
      embed_preview: 'embed',
      prefix_url: 'pornone.com',
      referer: false,
      format_support: ['hls'],
      vtt_support: false,
      quality_support: ['4k', '1080', '720', '540', '360', '270'],
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    let list_quality = []

    const videoId = this.extension.extractVideoId(url)
    const req = await fetch(`https://${this.config.prefix_url}/${videoId}`, {
      headers: this.extension.getDefaultHeaders()
    })

    const extractVideoId = (url) => {
      const parts = url.split('/');
      return parts.filter(Boolean).pop();
    }

    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const data = JSON.parse($('script[data-react-helmet="true"][type="application/ld+json"]').text())

    const video_title = data.name
    const video_thumb = data.thumbnailUrl[0]
    const video_time = this.extension.formatDuration(data.duration.replace('P0DT', 'PT'), 'pt')

    $('#pornone-video-player source').each((_, element) => {
      list_quality.push({
        quality: $(element).attr('res'),
        url: $(element).attr('src')
      })
    })
  
    return this.extension.createResponse({
      embed: `https://${this.config.prefix_url}/${this.config.embed_preview}/${extractVideoId(url)}`,
      video_test: list_quality[0]?.url || '',
      list_quality: list_quality,
      title: video_title,
      time: video_time,
      thumb: video_thumb,
      status: req.status
    })
  }
}
