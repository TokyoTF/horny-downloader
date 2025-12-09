export default class XhamsterExtension {
  constructor(ExtensionExtra) {
    this.config = {
      domains_support: ['xhamster.com'],
      domains_includes: ['/videos/', '/embed/'],
      embed_preview: 'embed',
      prefix_url: 'xhamster.com',
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
    const req = await fetch(`https://${this.config.prefix_url}/videos/${videoId}`, {
      headers: this.extension.getDefaultHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
      })
    })

    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const title_video = $('meta[property="og:title"]').attr('content')
    const thumb_video = $('link[rel="preload"][as="image"]').attr('href')

    const get_time = view.slice(
      view.indexOf('xplayerSettings'),
      view.indexOf('"debug":false')
    )
    const time_video = this.extension.formatDuration(
      parseInt(
        get_time
          .slice(get_time.indexOf('"duration":'), get_time.indexOf('"debug":false'))
          .replace('"duration":', '')
      )
    )

    const view_data = $('link[rel="preload"][as="fetch"]').attr('href')
    const res_req = await (await fetch(view_data)).text()

    const res = await this.extension.parseResolutions(
      res_req,
      view_data.replace('_TPL_.av1.mp4.m3u8', ''),
      { part_special: true }
    )

    const cvid = videoId.split('-')

    return this.extension.createResponse({
      embed: `https://${this.config.prefix_url}/embed/${cvid[cvid.length - 1]}`,
      video_test: view_data,
      list_quality: res,
      title: title_video,
      time: time_video,
      thumb: thumb_video,
      status: req.status
    })
  }
}
