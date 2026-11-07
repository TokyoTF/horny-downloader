export default class BeegExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'BEEG',
      color: '#FFCC00b0',
      domains_support: ['beeg.com'],
      domains_includes: ['/-0', '/-1'],
      embed_preview: '',
      prefix_url: 'beeg.com',
      referer: true,
      format_support: ['hls', 'mp4'],
      vtt_support: false,
      quality_support: ['4k', '1080', '720', '480', '360', '240'],
      patterns: [
        'https://*.externulls.com/*',
        'https://*.ahcdn.com/*',
        'https://*.ahacdn.me/*',
        'https://*.beeg.com/*'
      ],
      referer_url: 'https://beeg.com/',
      version: '1.2.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  /**
   * Beeg ids are numeric and prefixed with a dash, e.g. https://beeg.com/-0561505387022245
   * The leading zero is not part of the real file id (the API rejects it with a 400).
   * @param {string} url - Video URL
   * @returns {string} Numeric video id without leading zeros
   */
  extractVideoId(url) {
    const match = /-(\d{6,})/.exec(url)
    if (match) return match[1].replace(/^0+/, '')
    return this.extension.extractVideoId(url)
  }

  async extract(url) {
    const videoId = this.extractVideoId(url)
    const headers = this.extension.getDefaultHeaders()
    const BEEG_CDN = 'https://video.beeg.com'
    const BEEG_API = 'https://store.externulls.com'
    
    const factsReq = await fetch(`${BEEG_API}/facts/file/${videoId}?tag=27173`, {
      redirect: 'follow',
      headers
    })
    if (!factsReq.ok) {
      throw new Error(`Beeg metadata request failed with status ${factsReq.status}`)
    }
    const view = await factsReq.json()

    // Signed path of the HLS master playlist, valid for a limited time
    const playReq = await fetch(`${BEEG_API}/video/play_url/${videoId}?tag=27173`, {
      redirect: 'follow',
      headers
    })
    if (!playReq.ok) {
      throw new Error(`Beeg play_url request failed with status ${playReq.status}`)
    }
    const playPath = (await playReq.text()).trim()
    if (!playPath.startsWith('key=')) {
      throw new Error('Unexpected response from Beeg play_url endpoint')
    }

    const video_test = `${BEEG_CDN}/${playPath}`

    const manifest = await (await fetch(video_test, { headers })).text()

    // Variant playlists are absolute paths served by the same CDN host
    const list_quality = await this.extension.parseResolutions(manifest, BEEG_CDN, {
      part_special: true
    })

    const title =
      view.file?.data?.[0]?.cd_value?.replace(/&period;/g, '.') || `Beeg ${videoId}`
    const time = this.extension.formatDuration(parseInt(view.file?.fl_duration) || 0)

    const thumbs = view.fc_facts?.[0]?.fc_thumbs || []
    const thumb = thumbs.length
      ? `https://thumbs.externulls.com/videos/${videoId}/${
          thumbs[Math.floor(Math.random() * thumbs.length)]
        }.webp?size=900x470`
      : ''

    return this.extension.createResponse({
      embed: '',
      video_test,
      list_quality,
      title,
      time,
      thumb,
      status: factsReq.status,
      force_type: 'application/x-mpegurl'
    })
  }
}
