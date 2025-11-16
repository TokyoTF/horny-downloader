import Extension from './base/Extension.js'
import fetchCookie from 'fetch-cookie'
import fetch from 'node-fetch'

export default class PornhubExtension extends Extension {
  constructor() {
    super({
      domains_support: ['pornhub.com','es.pornhub.com'],
      domains_includes: ['/embed/', 'viewkey='],
      embed_preview: 'embed',
      prefix_url: 'pornhub.com',
      referer: false,
      format_support: ['hls', 'mp4'],
      vtt_support: false,
      quality_support: ['1080', '720', '480', '240']
    })

    this.fetchWithCookies = fetchCookie(fetch)
  }

  async extract(url) {
    let list_quality = []

    const videoId = this.extractVideoId(url)
    const req = await this.fetchWithCookies(
      `https://${this.config.prefix_url}/view_video.php?viewkey=${videoId}`,
      {
        redirect: 'follow',
        headers: this.getDefaultHeaders()
      }
    )

    const view = await req.text()
    const view_format = view
      .slice(view.indexOf('{"isVR":0'), view.indexOf('var player_mp4_seek'))
      .replace(';', '')

    const view_data = Function(
      `'use strict'; return (${view_format})`
    )()

    view_data.mediaDefinitions.map((n) => {
      if (n.format == 'hls') list_quality.push({ quality: n.quality, url: n.videoUrl })
    })

    return this.createResponse({
      embed: `https://${this.config.prefix_url}/${this.config.embed_preview}/${videoId}`,
      video_test: view_data.mediaDefinitions[0].videoUrl,
      list_quality,
      title: view_data.video_title,
      time: this.formatDuration(view_data.video_duration),
      thumb: view_data.image_url,
      status: req.status
    })
  }
}
