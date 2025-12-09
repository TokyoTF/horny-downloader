export default class Tube8Extension {
  constructor(ExtensionExtra) {
    this.config = {
      domains_support: ['tube8.com', 'www.tube8.com'],
      domains_includes: ['/embed/', '/porn-video/'],
      embed_preview: 'embed',
      prefix_url: 'www.tube8.com',
      referer: false,
      format_support: ['hls', 'mp4'],
      vtt_support: false,
      quality_support: ['1080', '720', '480', '360', '240'],
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    let list_quality = []

    const videoId = this.extension.extractVideoId(url)
    const req = await fetch(`https://${this.config.prefix_url}/porn-video/${videoId}`, {
      headers: this.extension.getDefaultHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      })
    })

    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const title_video = $('meta[property="og:title"]').attr('content').replace(' Porn Videos - Tube8', '')
    const thumb_video = $('meta[property="og:image"]').attr('content') || ''
    const durationMeta = $('meta[property="video:duration"]').attr('content') || $('meta[property="og:duration"]').attr('content')
    const time_video = durationMeta ? this.extension.formatDuration(parseInt(durationMeta)) : ''

    let mediaDefs = []
    let mdIndex = view.indexOf('"mediaDefinition"')
    if (mdIndex === -1) mdIndex = view.indexOf('mediaDefinition')

    if (mdIndex !== -1) {
      try {
        const after = view.slice(mdIndex)
        const startArr = after.indexOf('[')
        if (startArr !== -1) {
          let depth = 0
          let endPos = -1
          for (let i = startArr; i < after.length; i++) {
            const ch = after[i]
            if (ch === '[') depth++
            else if (ch === ']') {
              depth--
              if (depth === 0) {
                endPos = i
                break
              }
            }
          }
          if (endPos !== -1) {
            const arrText = after.slice(startArr, endPos + 1)
            mediaDefs = JSON.parse(arrText)
          }
        }
      } catch {}
    }

    const res_req = await (await fetch(mediaDefs[0].videoUrl)).json()

    let temp_qualitys = []
    res_req.forEach((el) => {
      temp_qualitys.push({
        quality: el.quality,
        url: el.videoUrl
      })
    })

    list_quality = temp_qualitys
    const video_test = list_quality.length ? list_quality[0].url : ''

    return this.extension.createResponse({
      embed: `https://${this.config.prefix_url}/embed/${videoId}`,
      video_test,
      list_quality,
      title: title_video || '',
      time: time_video,
      thumb: thumb_video,
      url,
      status: req.status
    })
  }
}
