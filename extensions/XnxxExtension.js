import Extension from './base/Extension.js'
import { load } from 'cheerio'

export default class XnxxExtension extends Extension {
  constructor() {
    super({
      domains_support: ['xnxx.com', 'xnxx.es'],
      domains_includes: ['/video-', '/embedframe/'],
      embed_preview: 'embedframe',
      prefix_url: 'xnxx.com',
      referer: false,
      format_support: ['hls'],
      vtt_support: false,
      quality_support: ['1080', '720', '692', '480', '360', '250']
    })
  }

  async extract(url) {
    let list_quality = []

    const videoId = this.extractVideoId(url)
    const req = await fetch(`https://${this.config.prefix_url}/video-${videoId}`, {
      headers: this.getDefaultHeaders({
        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 8.0; Windows; U; Windows NT 6.1; Win64; x64 Trident/4.0)'
      })
    })

    const view = await req.text()
    const $ = load(view)

    const title_video = $('.video-title-container .video-title strong').text()
    const thumb_video = $('meta[property="og:image"]').attr('content')
    const time_video = this.formatDuration(
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

    const res = await this.parseResolutions(
      res_req,
      view_data.replace('hls.m3u8', '')
    )

    list_quality = res

    return this.createResponse({
      embed: '',
      video_test: view_data,
      list_quality,
      title: title_video,
      time: time_video,
      thumb: thumb_video,
      status: req.status
    })
  }
}
