import Extension from './base/Extension.js'
import { load } from 'cheerio'

export default class PorndigExtension extends Extension {
  constructor() {
    super({
      domains_support: ['porndig.com'],
      domains_includes: ['/videos/'],
      embed_preview: '',
      prefix_url: 'www.porndig.com',
      referer: false,
      format_support: ['hls', 'mpd'],
      vtt_support: true,
      quality_support: ['4k', '1080', '720', '540', '360', '270']
    })
  }

  async extract(url) {
    let list_quality = []

    const videoId = this.extractVideoId(url)
    const req = await fetch(`https://${this.config.prefix_url}/videos/${videoId}`, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Referer: 'https://www.porndig.com/'
      }
    })

    const view = await req.text()
    const $ = load(view)

    const pre_link = $('link[rel="prefetch"][as="document"]').attr('href')
    const data = JSON.parse($('script[type="application/ld+json"]').text())

    const video_title = data.name
    const video_thumb = data.thumbnailUrl
    const video_time = this.formatDuration(data.duration, 'pt')

    const res_req = await (
      await fetch(pre_link, { headers: { Referer: 'https://www.porndig.com/' } })
    ).text()

    const view_format = res_req.slice(
      res_req.indexOf('window.player_args.push(') + 'window.player_args.push('.length,
      res_req.lastIndexOf(');')
    )

    const view_data = Function(`'use strict'; return (${view_format})`)()

    const res_req_prelink = await (
      await fetch(view_data.src[0].src, { headers: { Referer: 'https://www.porndig.com/' } })
    ).text()

    const res = await this.parseResolutions(res_req_prelink, view_data.src[0].src, {
      mpd: res_req_prelink,
      prefixUrl: view_data.src[0].src,
      codecForce: 'avc1'
    })

    list_quality = res

    return this.createResponse({
      embed: '',
      video_test: view_data.src[0].src,
      list_quality,
      title: video_title,
      time: video_time,
      thumb: video_thumb,
      status: req.status,
      force_type: 'application/dash+xml'
    })
  }
}
