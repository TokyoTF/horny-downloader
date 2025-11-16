import Extension from './base/Extension.js'
import { load } from 'cheerio'
import fetchCookie from 'fetch-cookie'
import fetch from 'node-fetch'

export default class SpankbangExtension extends Extension {
  constructor() {
    super({
      domains_support: ['spankbang.com','la.spankbang.com'],
      domains_includes: ['/embed', '/'],
      embed_preview: 'embed',
      prefix_url: 'spankbang.com',
      referer: true,
      format_support: ['hls', 'mp4'],
      vtt_support: false,
      quality_support: ['4k', '1080', '720', '480', '240']
    })

    this.fetchWithCookies = fetchCookie(fetch)
  }

  async extract(url) {
    let list_quality = []
    let view_data = {}

    const videoId = this.extractVideoId(url, true)
    const req = await this.fetchWithCookies(`https://${this.config.prefix_url}/${videoId}`, {
      headers:  {
        'User-Agent':'Mozilla/5.0 (compatible; MSIE 8.0; Windows; U; Windows NT 6.1; Win64; x64 Trident/4.0)'
      }
    })
   
    const view = await req.text()
    const $ = load(view)

    const title_video = $('.main_content_title').attr('title')
    const durationMeta = $('meta[property="og:video:duration"]').attr('content') || $('meta[property="og:duration"]').attr('content')
    const time_video = durationMeta ? this.formatDuration(parseInt(durationMeta)) : ''

    const view_format = view
      .slice(
        view.indexOf('var stream_data =') + 'var stream_data ='.length,
        view.lastIndexOf('var live_keywords')
      )
      .replace(';', '')

    if (req.status == 200) {
      view_data = Function(`'use strict'; return (${view_format})`)()
    }

    this.config.quality_support.map((n) => {
      let qua = !n.includes('k') ? n + 'p' : n
      if (view_data[qua] && view_data[qua][0]) {
        list_quality.push({ quality: n, url: view_data[qua][0] })
      }
    })

    return this.createResponse({
      embed: `https://${this.config.prefix_url}/${videoId}/${this.config.embed_preview}`,
      video_test: view_data.m3u8[0],
      list_quality,
      title: title_video,
      time: time_video,
      thumb: view_data.cover_image,
      status: req.status
    })
  }
}
