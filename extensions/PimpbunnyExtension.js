export default class PimpbunnyExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Pimpbunny',
      color: '#FF69b4b0',
      domains_support: ['pimpbunny.com'],
      domains_includes: ['/videos/', '/embed/'],
      embed_preview: 'embed',
      prefix_url: 'pimpbunny.com',
      referer: true,
      format_support: ['mp4'],
      vtt_support: false,
      quality_support: ['1440', '1080', '720', '480', '360'],
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    const videoId = this.extension.extractVideoId(url)

    const req = await fetch(`https://${this.config.prefix_url}/videos/${videoId}`, {
      headers: this.extension.getDefaultHeaders()
    })

    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const title_video = $('meta[property="og:title"]').attr('content')
    const thumb_video = $('meta[property="og:image"]').attr('content')
    const videoId_num = thumb_video.split('/')[6]

    const scriptMatch = view.match(
      /var\s+t[0-9a-f]+\s*=\s*\{[\s\S]*?\bvideo_id\b[\s\S]*?\bvideo_url\b[\s\S]*?\};/
    )

    let objStr = scriptMatch[0].replace(/^var\s+t[0-9a-f]+\s*=\s*/, '').replace(/;\s*$/, '')
    objStr = objStr.replace(/([{,]\s*)(\w+):/g, '$1"$2":').replace(/'/g, '"')
    const playerConfig = JSON.parse(objStr)

    const license_code = playerConfig.license_code || ''
    const list_quality = []

    const qualityFields = [
      { field: 'video_url', text: 'video_url_text' },
      { field: 'video_alt_url', text: 'video_alt_url_text' },
      { field: 'video_alt_url2', text: 'video_alt_url2_text' },
      { field: 'video_alt_url3', text: 'video_alt_url3_text' },
      { field: 'video_alt_url_hd', text: 'video_alt_url_hd_text' }
    ]

    for (const q of qualityFields) {
      const videoUrl = playerConfig[q.field]
      const qualityText = playerConfig[q.text] || ''

      if (videoUrl) {
        let decodedUrl
        if (videoUrl.startsWith('function/')) {
          decodedUrl = this.kvsDecode(videoUrl, license_code)
        } else {
          decodedUrl = videoUrl
        }

        const quality = qualityText.replace('p', '')
        if (quality && decodedUrl) {
          list_quality.push({ quality, url: decodedUrl })
        }
      }
    }

    list_quality.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))

    const video_test = list_quality.length > 0 ? list_quality[0].url : ''

    const durationMeta = $('meta[property="video:duration"]').attr('content')
    let time_video = ''
    if (durationMeta) {
      time_video = this.extension.formatDuration(parseInt(durationMeta))
    }

    return this.extension.createResponse({
      embed: `https://${this.config.prefix_url}/embed/${videoId_num}`,
      video_test,
      list_quality,
      title: title_video,
      time: time_video,
      thumb: thumb_video,
      status: req.status,
      force_type: 'video/mp4'
    })
  }

  calcseed(lc, hr = '16') {
    const f = lc.replace(/\$/g, '').replace(/0/g, '1')
    const j = Math.floor(f.length / 2)
    const k = parseInt(f.slice(0, j + 1))
    const el = parseInt(f.slice(j))
    const fi = Math.abs(el - k) * 4
    const s = fi.toString()
    const i = Math.floor(parseInt(hr) / 2) + 2
    let m = ''

    for (let g2 = 0; g2 <= j; g2++) {
      for (let h = 1; h < 5; h++) {
        let n = parseInt(lc[g2 + h]) + parseInt(s[g2])
        if (n >= i) {
          n -= i
        }
        m += n.toString()
      }
    }
    return m
  }

  kvsDecode(vu, lc, hr = '16') {
    if (!vu.startsWith('function/')) {
      return vu
    }

    const vup = vu.split('/')
    const uhash = vup[7].slice(0, 2 * parseInt(hr))
    const nchash = vup[7].slice(2 * parseInt(hr))
    const seed = this.calcseed(lc, hr)

    if (seed && uhash) {
      let uhashArr = uhash.split('')
      for (let k = uhashArr.length - 1; k >= 0; k--) {
        let el = k
        for (let m = k; m < seed.length; m++) {
          el += parseInt(seed[m])
        }
        while (el >= uhashArr.length) {
          el -= uhashArr.length
        }

        const newUhash = []
        for (let o = 0; o < uhashArr.length; o++) {
          if (o === k) {
            newUhash.push(uhashArr[el])
          } else if (o === el) {
            newUhash.push(uhashArr[k])
          } else {
            newUhash.push(uhashArr[o])
          }
        }
        uhashArr = newUhash
      }
      vup[7] = uhashArr.join('') + nchash
    }

    const timestamp = Date.now()
    return vup.slice(2).join('/') + '&rnd=' + timestamp
  }
}
