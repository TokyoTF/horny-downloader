export default class ThumbzillaExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Thumbzilla',
      color: '#2ECC71b0',
      domains_support: ['thumbzilla.com', 'www.thumbzilla.com'],
      domains_includes: ['/watch/', '/embed/'],
      embed_preview: 'embed',
      prefix_url: 'www.thumbzilla.com',
      referer: false,
      format_support: ['hls', 'mp4'],
      vtt_support: false,
      quality_support: ['1080', '720', '480', '360', '240'],
      version: '1.1.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    let list_quality = []

    const videoId = this.extension.extractVideoId(url)
    const videoUrl = `https://${this.config.prefix_url}/watch/${videoId}`

    const req = await fetch(videoUrl, {
      headers: this.extension.getDefaultHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      })
    })

    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const title_video = $('meta[property="og:title"]').attr('content') || $('title').text()
    const thumb_video = $('#videoWrapper link').attr('href') || ''

    const durationMeta = $('meta[property="video:duration"]').attr('content')
    let time_video = durationMeta ? this.extension.formatDuration(parseInt(durationMeta)) : ''

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

    const hlsEntry = mediaDefs.find(el => el.format === 'hls') || mediaDefs[0]
    if (hlsEntry?.videoUrl) {
      try {
        const qReq = await fetch(hlsEntry.videoUrl, {
          headers: this.extension.getDefaultHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
          })
        })
        if (qReq.ok) {
          const qualities = await qReq.json()
          if (Array.isArray(qualities)) {
            list_quality = qualities.map(q => ({
              quality: q.quality,
              url: q.videoUrl
            }))
          }
        }
      } catch {}
    }

    if (list_quality.length === 0) {
      mediaDefs.forEach((el) => {
        if (el.format === 'hls' && el.videoUrl) {
          list_quality.push({ quality: el.quality, url: el.videoUrl })
        }
      })
    }
    const video_test = list_quality.length ? list_quality[0].url : ''

    return this.extension.createResponse({
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
