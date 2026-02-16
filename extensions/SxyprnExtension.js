export default class SxyprnExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Sxyprn',
      color: '#a7aec1',
      domains_support: ['sxyprn.com'],
      domains_includes: ['/post/'],
      embed_preview: '',
      prefix_url: 'sxyprn.com',
      referer: true,
      format_support: ['mp4'],
      vtt_support: false,
      quality_support: ['original'],
      version: '1.0.2'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  decryptPath(parts) {
    parts[5] -= this.sumDigits(parts[6]) + this.sumDigits(parts[7]);
    return parts;
  }

  sumDigits(input) {
    return String(input)
      .replace(/\D/g, '')
      .split('')
      .reduce((acc, digit) => acc + parseInt(digit, 10), 0);
  }

  createToken(start, end) {
    const map = {
      '+': '-',
      '/': '_',
      '=': '.'
    };
    return btoa(`${start}-${this.config.prefix_url}-${end}`).replace(/[+/=]/g, char => map[char]);
  }
  

  async extract(url) {
    const req = await fetch(url, {
      headers: this.extension.getDefaultHeaders()
    })
    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const videoIdMatch = url.match(/\/post\/([a-z0-p]+)\.html/i)
    const videoId = videoIdMatch ? videoIdMatch[1] : null
    const vnfoMeta = view.match(/data-vnfo='([^']+)'/)

    let vnfoData = {}
    vnfoData = JSON.parse(vnfoMeta[1])

    let segments = vnfoData[videoId].split("/");

    segments[1] += "8/" + this.createToken(this.sumDigits(segments[6]), this.sumDigits(segments[7]));
    segments = this.decryptPath(segments);

    const video_path = segments.join("/");
    const video_src = `https://sxyprn.com${video_path}`
    const title_video = $('title').text().trim()
    const timeMeta = view.match(/Video Info.*?duration:<b>(.*?)<\/b>/)
    const time_video = timeMeta ? this.extension.formatDuration(timeMeta[1],'',true) : ''
    const thumb_video = $('meta[property="og:image"]').attr('content') || ''

    return this.extension.createResponse({
      embed: '',
      video_test: video_src,
      list_quality: [{ quality: 'original', url: video_src }],
      title: title_video.substring(0, 230).replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, ' ')|| 'Unknown Title',
      time: time_video,
      thumb: thumb_video,
      status: req.status,
      force_type: 'video/mp4'
    })
  }
}
