export default class SxyprnExtension {
  constructor(ExtensionExtra) {
    this.config = {
      domains_support: ['sxyprn.com'],
      domains_includes: ['/post/'],
      embed_preview: '',
      prefix_url: 'sxyprn.com',
      referer: true,
      format_support: ['mp4'],
      vtt_support: false,
      quality_support: ['original'],
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    const req = await fetch(url, {
      headers: this.extension.getDefaultHeaders()
    })
    const view = await req.text()


    const videoIdMatch = url.match(/\/post\/([a-z0-p]+)\.html/i)
    const videoId = videoIdMatch ? videoIdMatch[1] : null
    const vnfoMeta = view.match(/data-vnfo='([^']+)'/)


    let vnfoData = {}
    vnfoData = JSON.parse(vnfoMeta[1])

    const videoPath = vnfoData[videoId]
    const videoSrc = `https://sxyprn.com${videoPath}`
    const title = this.extension.cherrio(view)('title').text().trim()
    const thumb = this.extension.cherrio(view)('meta[property="og:image"]').attr('content') || ''

    return this.extension.createResponse({
      embed: '',
      video_test: videoSrc,
      list_quality: [{ quality: 'original', url: videoSrc }],
      title: title || 'Unknown Title',
      time: '',
      thumb: thumb,
      status: req.status,
      force_type: 'video/mp4'
    })
  }
}
