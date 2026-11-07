export default class PorndigExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Porndig',
      color: '#7E57C2b0',
      domains_support: ['porndig.com'],
      domains_includes: ['/videos/'],
      embed_preview: '',
      prefix_url: 'www.porndig.com',
      referer: false,
      format_support: ['mp4'],
      vtt_support: true,
      quality_support: ['1080', '720', '540', '360'],
      version: '1.1.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    const videoId = this.extension.extractVideoId(url)
    const req = await fetch(`https://${this.config.prefix_url}/videos/${videoId}`, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Referer: 'https://www.porndig.com/'
      }
    })

    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const pre_link = $('link[rel="prefetch"][as="document"]').attr('href')
    const data = JSON.parse($('script[type="application/ld+json"]').text())

    const video_title = data.name
    const video_thumb = data.thumbnailUrl
    const video_time = this.extension.formatDuration(data.duration, 'pt')

    const res_req = await (
      await fetch(pre_link, { headers: { Referer: 'https://www.porndig.com/' } })
    ).text()

    const view_format = res_req.slice(
      res_req.indexOf('window.player_args.push(') + 'window.player_args.push('.length,
      res_req.lastIndexOf(');')
    )

    const view_data = Function(`'use strict'; return (${view_format})`)()

    if (!view_data?.src?.length) {
      return this.extension.createResponse({
        embed: '',
        video_test: '',
        list_quality: [],
        title: video_title,
        time: video_time,
        thumb: video_thumb,
        status: 404
      })
    }

    const h264Source = view_data.src.find(
      (s) => s.type === 'multi-progressive' && s.codec === 'h264'
    )

    if (h264Source?.srcSet?.length) {
      const list_quality = h264Source.srcSet.map((s) => ({
        quality: s.label.replace('p', ''),
        url: s.src
      }))

      const video_test = h264Source.srcSet.find((s) => s.active)?.src || h264Source.srcSet[0]?.src

      return this.extension.createResponse({
        embed: '',
        video_test,
        list_quality,
        title: video_title,
        time: video_time,
        thumb: video_thumb,
        status: req.status
      })
    }

    const dashSource = view_data.src.find((s) => s.type === 'application/dash+xml')
    if (dashSource?.src) {
      return this.extension.createResponse({
        embed: '',
        video_test: dashSource.src,
        list_quality: [],
        title: video_title,
        time: video_time,
        thumb: video_thumb,
        status: req.status,
        force_type: 'application/dash+xml'
      })
    }

    return this.extension.createResponse({
      embed: '',
      video_test: '',
      list_quality: [],
      title: video_title,
      time: video_time,
      thumb: video_thumb,
      status: 404
    })
  }
}
