export default class XvideosExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'XVideos',
      color: '#EA0000b0',
      domains_support: ['xvideos.com'],
      domains_includes: ['/video.', '/embedframe/'],
      embed_preview: 'embedframe',
      prefix_url: 'www.xvideos.com',
      referer: false,
      format_support: ['hls'],
      vtt_support: false,
      quality_support: ['1080', '720', '480', '360', '250'],
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    const videoId = this.extension.extractVideoId(url)
    const req = await fetch(`https://${this.config.prefix_url}/video.${videoId}`, {
      headers: this.extension.getDefaultHeaders({
        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 8.0; Windows; U; Windows NT 6.1; Win64; x64 Trident/4.0)'
      })
    })

    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const title_video = $('h2.page-title').text().replace($('span.duration').text(), '')
    const thumb_video = $('meta[property="og:image"]').attr('content')
    const time_video = this.extension.formatDuration(
      parseInt($('meta[property="og:duration"]').attr('content'))
    )

    const view_format = view
      .slice(
        view.indexOf('html5player.setVideoHLS(') + 'html5player.setVideoHLS('.length,
        view.indexOf('html5player.setThumbUrl(')
      )
      .replace(';', '')
      .replace(')', '')

    const view_data = Function(`'use strict'; return (${view_format})`)()
    const res_req = await (await fetch(view_data)).text()

    const res = await this.extension.parseResolutions(
      res_req,
      view_data.replace('hls.m3u8', '')
    )

    return this.extension.createResponse({
      embed: `https://${this.config.prefix_url}/embedframe/${videoId.split('/')[0]}`,
      video_test: view_data,
      list_quality: res,
      title: title_video,
      time: time_video,
      thumb: thumb_video,
      status: req.status
    })
  }
}
