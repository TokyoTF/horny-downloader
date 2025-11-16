import Extension from './base/Extension.js'
import { load } from 'cheerio'

export default class ThumbzillaExtension extends Extension {
  constructor() {
    super({
      domains_support: ['thumbzilla.com', 'www.thumbzilla.com'],
      domains_includes: ['/video/', '/embed/'],
      embed_preview: 'embed',
      prefix_url: 'www.thumbzilla.com',
      referer: false,
      format_support: ['hls', 'mp4'],
      vtt_support: false,
      quality_support: ['1080', '720', '480', '360', '240']
    })
  }

  async extract(url) {
    let list_quality = []

    const videoId = this.extractVideoId(url)
    const videoUrl = `https://${this.config.prefix_url}/video/${videoId}`

    const req = await fetch(videoUrl, {
      headers: this.getDefaultHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      })
    })

    const view = await req.text()
    const $ = load(view)

    const title_video = $('meta[property="og:title"]').attr('content') || $('title').text()
    const thumb_video = $('#videoPlayerPlaceholder img').attr('src') || ''

    let durIndex = view.indexOf('"video_duration"')
    let lastIndex = view.indexOf('"actionTags"')
    let time_video = this.formatDuration(
      parseInt(
        view
          .slice(durIndex, lastIndex)
          .replace('"video_duration":', '')
          .replace(',', '')
      )
    )

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

    let temp_qualitys = []
    mediaDefs.forEach((el) => {
      el.format == 'hls' &&
        temp_qualitys.push({
          quality: el.quality,
          url: el.videoUrl
        })
    })

    list_quality = temp_qualitys
    const video_test = list_quality.length ? list_quality[0].url : ''

    return this.createResponse({
      embed: '',
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
