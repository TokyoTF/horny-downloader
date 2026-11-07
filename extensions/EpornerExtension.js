export default class EpornerExtension {
  constructor(ExtensionExtra) {

    this.config = {
      name: 'Eporner',
      color: '#ff5454b0',
      domains_support: ['eporner.com', 'www.eporner.com'],
      domains_includes: ['/video-', '/embed/'],
      embed_preview: 'embed',
      prefix_url: 'www.eporner.com',
      referer: true,
      format_support: ['hls'],
      vtt_support: false,
      quality_support: ['2160', '1440', '1080', '720', '480', '360'],
      patterns: ['https://*.eporner.com/*', 'http://*.eporner.com/*'],
      referer_url: 'https://www.eporner.com/',
      referer_extra: [{ name: 'Origin', value: 'https://www.eporner.com' }],
      version: '2.1.1'
    }

    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    const videoId = this.extension.extractVideoId(url)
    const videoIdClean = videoId.slice(0, videoId.indexOf('/'))
    
    const reqApi = await fetch(
      `https://www.eporner.com/api/v2/video/id/?id=${videoIdClean}&thumbsize=big&format=json`
    )

    if (reqApi.status === 404) {
      log('error', 'The Video is Deleted', { code: 'VIDEO_DELETED', status: 404 })
      return
    }

    if (!reqApi.ok) {
      log('error', `Eporner API request failed (status ${reqApi.status})`, {
        code: 'API_REQUEST_FAILED',
        status: reqApi.status
      })
      return
    }

    const viewApi = await reqApi.json().catch(() => null)

    if (!viewApi || Array.isArray(viewApi) || typeof viewApi !== 'object' || !viewApi.title) {
      log('error', 'The Video is Deleted', { code: 'VIDEO_DELETED', status: 410 })
      return
    }

    const title = viewApi.title
    const thumb = viewApi.default_thumb?.src || ''
    const duration = viewApi.length_sec || 0
    const time_video = this.extension.formatDuration(duration)

    const reqhash = await fetch(`https://www.eporner.com/embed/${videoIdClean}/`, {
      headers: this.extension.getDefaultHeaders()
    })

    const view = await reqhash.text()
    const hashStart = view.indexOf('EP.video.player.hash')
    const hashEnd = view.indexOf('EP.video.player.url')

    if (hashStart === -1 || hashEnd === -1 || hashEnd <= hashStart) {
      log('error', 'Could not read the Eporner player hash', { code: 'PLAYER_HASH_NOT_FOUND' })
      return
    }

    const view_format = view
      .slice(hashStart, hashEnd)
      .replace('EP.video.player.hash=', '')
      .replace('EP.video.player.hash = ', '')
      .replace(';', '')

    let get_hash
    try {
      get_hash = Function(`'use strict'; return (${view_format})`)()
    } catch {
      log('error', 'Invalid Eporner player hash', { code: 'INVALID_PLAYER_HASH' })
      return
    }

    if (typeof get_hash !== 'string' || get_hash.length < 32) {
      log('error', 'Invalid Eporner player hash', { code: 'INVALID_PLAYER_HASH' })
      return
    }

    const conver_hash =
      parseInt(get_hash.substring(0, 8), 16).toString(36) +
      parseInt(get_hash.substring(8, 16), 16).toString(36) +
      parseInt(get_hash.substring(16, 24), 16).toString(36) +
      parseInt(get_hash.substring(24, 32), 16).toString(36)

    const req_video = await fetch(
      `https://www.eporner.com/xhr/video/${videoIdClean}?hash=${conver_hash}&supportedFormats=hls&fallback=false&embed=false&_=${new Date().getTime()}`,
      {
        headers: this.extension.getDefaultHeaders()
      }
    )
   
    const view_video = await req_video.json().catch(() => null)
    const video_test = view_video?.sources?.hls?.auto?.src

    if (!video_test) {
      log('error', 'No playable source found for this video', {
        code: 'NO_SOURCE',
        status: req_video.status
      })
      return
    }

    const req_video_test = await fetch(video_test, {
      headers: this.extension.getDefaultHeaders()
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
