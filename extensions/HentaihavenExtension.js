export default class HentaihavenExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'HentaiHaven',
      color: '#9B30FFb0',
      domains_support: ['hentaihaven.com', 'www.hentaihaven.com'],
      domains_includes: ['/video/'],
      embed_preview: 'video',
      prefix_url: 'hentaihaven.com',
      referer: true,
      format_support: ['mp4', 'hls'],
      proxy_method: true,
      vtt_support: true,
      quality_support: ['1080', '720', '480'],
      version: '1.0.1'
    }
    this.extension = new ExtensionExtra(this.config)
    this.fetchcookie = this.extension.fetchcookies()
  }

  rot13(str) {
    const from = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    const to   = 'NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm'
    let out = ''
    for (let i = 0; i < str.length; i++) {
      const idx = from.indexOf(str[i])
      out += idx !== -1 ? to[idx] : str[i]
    }
    return out
  }

  decodeConfig(token) {
    try {
      let e = token.replace('sha512-', '').replace(/[\s\n\r]+/g, '')
      e = this.rot13(e)
      e = atob(e)
      e = this.rot13(e)
      e = atob(e)
      e = this.rot13(e)
      e = atob(e)
      return JSON.parse(e)
    } catch (err) {
      console.error('Error decoding token:', err)
      return null
    }
  }

  async fetchPlayerData(config) {
    const formData = new FormData()
    formData.append('action', 'zarat_get_data_player_ajax')
    formData.append('a', config.en)
    formData.append('b', config.iv)

    const apiUrl = config.uri.startsWith('//') ? `https:${config.uri}` : config.uri
    const resp = await this.fetchcookie(`${apiUrl}api.php`, {
      method: 'POST',
      body: formData,
      headers: {
        ...this.extension.getDefaultHeaders(),
        Referer: `https://${this.config.prefix_url}/`
      }
    })

    if (!resp.ok) throw new Error('Error in API request')
    return await resp.json()
  }

  async cleanMasterPlaylist(masterUrl) {
    try {
      const resp = await this.fetchcookie(masterUrl, {
        headers: this.extension.getDefaultHeaders()
      })
      if (!resp.ok) return { url: masterUrl, subtitles: [], qualities: [] }

      const m3u8 = await resp.text()
      const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1)
      const lines = m3u8.split('\n')

      const subtitles = []
      const qualities = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes('TYPE=SUBTITLES') && line.includes('URI="')) {
          const langMatch = line.match(/LANGUAGE="([^"]+)"/)
          const nameMatch = line.match(/NAME="([^"]+)"/)
          const uriMatch = line.match(/URI="([^"]+)"/)
          if (langMatch && uriMatch) {
            const rawUri = uriMatch[1]
            const absUrl = rawUri.startsWith('http')
              ? rawUri
              : new URL(rawUri, baseUrl).href
            subtitles.push({
              language: langMatch[1],
              name: nameMatch ? nameMatch[1] : langMatch[1],
              url: absUrl
            })
          }
        }
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const resMatch = line.match(/RESOLUTION=(\d+x\d+)/)
          const nextLine = lines[i + 1]
          if (resMatch && nextLine && !nextLine.startsWith('#')) {
            const streamUrl = nextLine.trim().startsWith('http')
              ? nextLine.trim()
              : new URL(nextLine.trim(), baseUrl).href
            const [, h] = resMatch[1].split('x')
            qualities.push({
              url: streamUrl,
              quality: h || 'original',
              size: ''
            })
          }
        }
      }

      const cleaned = lines.filter(line =>
        !line.includes('TYPE=SUBTITLES') && !line.endsWith('.vtt')
      )

      const result = []
      for (const line of cleaned) {
        if (line.trim() === '' || line.startsWith('http')) {
          result.push(line)
        } else if (line.startsWith('#EXT-X-MEDIA:') && line.includes('URI="')) {
          const resolved = line.replace(/URI="([^"]+)"/, (match, uri) => {
            if (uri.startsWith('http')) return match
            return `URI="${new URL(uri, baseUrl).href}"`
          })
          result.push(resolved)
        } else if (!line.startsWith('#')) {
          result.push(new URL(line.trim(), baseUrl).href)
        } else {
          result.push(line)
        }
      }

      const cleanedM3u8 = result.join('\n')
      const dataUrl = 'data:application/vnd.apple.mpegurl;base64,' +
        Buffer.from(cleanedM3u8).toString('base64')

      return { url: dataUrl, m3u8Content: cleanedM3u8, subtitles, qualities }
    } catch (err) {
      console.error('[HentaiHaven] Error cleaning master playlist:', err)
      return { url: masterUrl, subtitles: [], qualities: [] }
    }
  }

  async extract(url) {
    const req = await this.fetchcookie(url, {
      headers: this.extension.getDefaultHeaders()
    })

    const html = await req.text()
    const $ = this.extension.cherrio(html)

    const title = $('meta[property="og:title"]').attr('content')?.replace(/[-|].*$/, '').trim()
      || $('title').text().split('-')[0].trim()
    const thumb = $('meta[property="og:image"]').attr('content') || ''

    // Find player-logic iframe
    let playerUrl = ''
    const playerIframe = $('iframe[src*="player-logic"]')
    if (playerIframe.length) {
      playerUrl = playerIframe.attr('src')
    }
    if (!playerUrl) {
      playerUrl = $('iframe[src*="player"]').attr('src') || $('iframe[src*="embed"]').attr('src') || ''
    }

    if (!playerUrl) {
      return this.extension.createResponse({
        embed: '',
        video_test: '',
        list_quality: [],
        title: title.replace(/[^a-zA-Z0-9 ]/g, ''),
        time: '',
        thumb,
        status: req.status
      })
    }

    let videoUrl = ''

    // Fetch player.php page to get the secure token
    if (playerUrl.includes('player.php')) {
      try {
        const playerReq = await this.fetchcookie(playerUrl, {
          headers: {
            ...this.extension.getDefaultHeaders(),
            Referer: `https://${this.config.prefix_url}/`
          }
        })
        const playerHtml = await playerReq.text()
        const $p = this.extension.cherrio(playerHtml)

        // Extract sha512 token from x-secure-token meta tag
        const secureToken = $p('meta[name="x-secure-token"]').attr('content')
          || $p('meta[name="x-secure-token"]')[0]?.attribs?.content

        if (secureToken && secureToken.startsWith('sha512-')) {
          const config = await this.decodeConfig(secureToken)
          if (config && config.en && config.iv && config.uri) {
            console.log('[HentaiHaven] Decoded config URI:', config.uri)
            const apiData = await this.fetchPlayerData(config)
            console.log('[HentaiHaven] API response:', JSON.stringify(apiData).substring(0, 500))
            if (apiData?.data?.sources?.length > 0) {
              videoUrl = apiData.data.sources[0].src
              console.log('[HentaiHaven] Video URL:', videoUrl)
            }
          }
        }

        // Fallback: try og:video meta tag
        if (!videoUrl) {
          videoUrl = $p('meta[property="og:video"]').attr('content') || ''
        }
      } catch (err) {
        console.error('HentaiHaven extraction error:', err)
      }
    }

    const cleaned = await this.cleanMasterPlaylist(videoUrl)

    const listQuality = cleaned.qualities && cleaned.qualities.length > 0
      ? cleaned.qualities
      : [{ url: videoUrl, quality: 'original', size: '' }]

    const bestQualityUrl = listQuality[0]?.url || videoUrl

    return this.extension.createResponse({
      embed: playerUrl,
      video_test: bestQualityUrl,
      list_quality: listQuality,
      subtitles: cleaned.subtitles,
      title: title.replace(/[^a-zA-Z0-9 ]/g, ''),
      time: '',
      thumb,
      status: req.status
    })
  }
}
