export default class HentailaExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'HentaiLa',
      color: '#FF0000b0',
      domains_support: ['hentaila.com', 'www5.hentaila.com', 'www.hentaila.com'],
      domains_includes: ['/media/'],
      embed_preview: 'media',
      prefix_url: 'hentaila.com',
      referer: true,
      format_support: ['hls','mp4'],
      proxy_method: true,
      vtt_support: false,
      quality_support: ['1080', '720', '480'],
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
    this.fetchcookie = this.extension.fetchcookies()
  }

  async extract(url) {
    const req = await this.fetchcookie(url, {
      headers: this.extension.getDefaultHeaders()
    })

    const html = await req.text()
    const $ = this.extension.cherrio(html)

    const title = $('meta[property="og:title"]').attr('content')?.replace(/\|.*$/, '').trim() || $('title').text().split('|')[0].trim()
    const thumb = $('meta[property="og:image"]').attr('content') || ''

    let embedUrl = ''
    let list_quality = []

    const scriptMatch = html.match(/kit\.start\(app,\s*element,\s*(\{[\s\S]*?\})\s*\)/)
    if (scriptMatch) {
      try {
        const dataObj = Function(`'use strict'; return (${scriptMatch[1]})`)()
        const dataArray = dataObj.data
        const episodeData = dataArray.find(d => d?.data?.embeds)

        if (episodeData) {
          const embeds = episodeData.data.embeds?.SUB || episodeData.data.embeds
          if (Array.isArray(embeds) && embeds.length > 0) {
            const vipEmbed = embeds.find(e => e.server === 'VIP') || embeds[0]
            embedUrl = vipEmbed.url
          }
        }
      } catch {
        // fallback to iframe extraction
      }
    }

    if (!embedUrl) {
      const iframe = $('iframe[src*="hvidserv"]').attr('src') ||
                     $('iframe[src*="embed"]').attr('src') || ''
      embedUrl = iframe
    }

    const durationText = $('meta[property="og:video:duration"]').attr('content')

    const m3u8Url = embedUrl ? embedUrl.replace('/play/','/m3u8/') : ''

    return this.extension.createResponse({
      embed: embedUrl,
      video_test: m3u8Url,
      list_quality: m3u8Url ? [{ url: m3u8Url, quality: 'original', size: '' }] : list_quality,
      title: title.replace(/[^a-zA-Z0-9 ]/g, ''),
      time: durationText ? this.extension.formatDuration(parseInt(durationText)) : '',
      thumb,
      status: req.status
    })
  }
}
