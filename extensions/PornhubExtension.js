export default class PornhubExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Pornhub',
      color: '#FF9027b0',
      domains_support: ['pornhub.com','es.pornhub.com'],
      domains_includes: ['/embed/', 'viewkey='],
      embed_preview: 'embed',
      prefix_url: 'pornhub.com',
      referer: true,
      format_support: ['hls', 'mp4'],
      vtt_support: false,
      quality_support: ['1080', '720', '480', '240'],
      version: '1.0.1'
    }
    this.extension = new ExtensionExtra(this.config)
    this.fetchcookie = this.extension.fetchcookies()
  }

  async extract(url) {
    let list_quality = []

    const videoId = this.extension.extractVideoId(url)
    const req = await this.fetchcookie(
      `https://${this.config.prefix_url}/view_video.php?viewkey=${videoId}`,
      {
        redirect: 'follow',
        headers: this.extension.getDefaultHeaders()
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

    return this.extension.createResponse({
      embed: `https://${this.config.prefix_url}/${this.config.embed_preview}/${videoId}`,
      video_test: view_data.mediaDefinitions[0].videoUrl,
      list_quality,
      title: view_data.video_title.replace(/[^a-zA-Z0-9 ]/g, ""),
      time: this.extension.formatDuration(view_data.video_duration),
      thumb: view_data.image_url,
      status: req.status
    })
  }
}
