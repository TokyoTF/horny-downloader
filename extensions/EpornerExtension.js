export default class EpornerExtension {
  constructor(ExtensionExtra) {

    this.config = {
      domains_support: ['eporner.com', 'www.eporner.com'],
      domains_includes: ['/video-', '/embed/'],
      embed_preview: 'embed',
      prefix_url: 'www.eporner.com',
      referer: true,
      format_support: ['hls'],
      vtt_support: false,
      quality_support: ['2160', '1440', '1080', '720', '480', '360'],
      version: '1.0.0'
    }

    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    const videoId = this.extension.extractVideoId(url)
    const videoIdClean = videoId.slice(0, videoId.indexOf('/'))
    
    const reqApi = await fetch(
      `https://www.eporner.com/api/v2/video/id/?id=${videoIdClean}&thumbsize=big&format=json`
    )
    const viewApi = await reqApi.json()

    const title = viewApi.title
    const thumb = viewApi.default_thumb?.src || ''
    const duration = viewApi.length_sec || 0
    const time_video = this.extension.formatDuration(duration)

    const reqhash = await fetch(`https://www.eporner.com/embed/${videoIdClean}/`, {
      headers: this.extension.getDefaultHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) horny-downloader/1.0.0 Chrome/140.0.7339.133 Electron/38.2.2 Safari/537.36'
      })
    })

    const view = await reqhash.text()
    const view_format = view
      .slice(view.indexOf('EP.video.player.hash'), view.indexOf('EP.video.player.url'))
      .replace('EP.video.player.hash=', '')
      .replace('EP.video.player.hash = ','')
      .replace(';', '')

    const get_hash = Function(`'use strict'; return (${view_format})`)()

    const conver_hash =
      parseInt(get_hash.substring(0, 8), 16).toString(36) +
      parseInt(get_hash.substring(8, 16), 16).toString(36) +
      parseInt(get_hash.substring(16, 24), 16).toString(36) +
      parseInt(get_hash.substring(24, 32), 16).toString(36)

    const req_video = await fetch(
      `https://www.eporner.com/xhr/video/${videoIdClean}?hash=${conver_hash}&supportedFormats=hls&fallback=false&embed=false&_=${new Date().getTime()}`,
      {
        headers: this.extension.getDefaultHeaders({
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) horny-downloader/1.0.0 Chrome/140.0.7339.133 Electron/38.2.2 Safari/537.36'
        })
      }
    )
   
    const view_video = await req_video.json()
    const video_test = view_video.sources.hls.auto.src

    const req_video_test = await fetch(video_test, {
      headers: this.extension.getDefaultHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) horny-downloader/1.0.0 Chrome/140.0.7339.133 Electron/38.2.2 Safari/537.36'
      })
    })
    const req_video_result= await req_video_test.text()
 
    const res = await this.extension.parseResolutions(req_video_result, '', { part_special: true })

    return this.extension.createResponse({
      embed: `https://${this.config.prefix_url}/${this.config.embed_preview}/${videoIdClean}`,
      video_test,
      list_quality: res,
      title: title,
      time: time_video,
      thumb: thumb,
      status: reqApi.status
    })
  }
}
