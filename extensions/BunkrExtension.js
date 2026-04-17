export default class BunkrExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'Bunkr',
      color: '#00cc99b0',
      domains_support: ['bunkr.cr', 'bunkr.site', 'bunkr.si'],
      domains_includes: ['/f/'],
      domains_includes_album: ['/a/'],
      embed_preview: '',
      prefix_url: 'bunkr.cr',
      referer: true,
      format_support: ['mp4'],
      vtt_support: false,
      quality_support: ['original'],
      version: '1.0.3'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    const isAlbum = url.includes('/a/')
    const isAlbumAdvanced = url.includes('?advanced=1') || url.includes('&advanced=1')
    if (isAlbum) {
      const albumUrl = isAlbumAdvanced
        ? url
        : url + (url.includes('?') ? '&advanced=1' : '?advanced=1')
      return this.extractAlbum(albumUrl)
    }

    return this.extractVideo(url)
  }

  async extractAlbum(url) {
    const req = await fetch(url)
    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const title_video =
      $('h1.text-3xl').text().trim() || $('meta[property="og:title"]').attr('content')
    const albumTitle = this.transliterate(title_video) || 'Album'

    const videoUrls = []

    const scriptMatch = view.match(/window\.albumFiles\s*=\s*(\[[\s\S]*?\]);/m)
    if (scriptMatch && scriptMatch[1]) {
      try {
        let jsonStr = scriptMatch[1]
        jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')
        const albumFiles = JSON.parse(jsonStr)
        for (const file of albumFiles) {
          if (file.cdnEndpoint) {
            let fullUrl = `https://bunkr.cr/f${file.cdnEndpoint}`
            fullUrl = fullUrl.replace(/\\\\/g, '\\').replace(/\\'/g, "'")
            if (!videoUrls.includes(fullUrl)) {
              videoUrls.push(fullUrl)
            }
          }
        }
      } catch (e) {
        this.extension.logger.error('Failed to parse albumFiles:', e)
      }
    }

    return this.extension.createResponse({
      is_batch: true,
      batch_urls: videoUrls,
      title: albumTitle,
      status: req.status
    })
  }

  async extractVideo(url) {
    let list_quality = []

    const videoId = this.extension.extractVideoId(url)

    const req = await fetch(url)
    const view = await req.text()
    const $ = this.extension.cherrio(view)

    const title_video =
      $('h1.text-3xl').text().trim() || $('meta[property="og:title"]').attr('content')
    const thumb_video = $('video').attr('poster') || $('meta[property="og:image"]').attr('content')

    const apiReq = await fetch('https://bunkr.cr/api/vs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: videoId })
    })
    const apiData = await apiReq.json()

    let video_src = apiData.url
    if (apiData.encrypted) {
      const key = 'SECRET_KEY_' + Math.floor(apiData.timestamp / 3600)
      video_src = this.decryptUrl(video_src, key)
    }

    if (video_src) {
      list_quality.push({ quality: 'original', url: video_src })
    }

    const duration = await this.extension.getDurationUrl(video_src)

    return this.extension.createResponse({
      embed: '',
      video_test: video_src,
      list_quality,
      title: this.transliterate(title_video) || 'Unknown Title',
      time: duration,
      thumb: thumb_video,
      status: req.status,
      force_type: 'video/mp4'
    })
  }

  base64ToBytes(base64String) {
    const binaryString = atob(base64String)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  }

  xorDecrypt(data, key) {
    const keyBytes = new TextEncoder().encode(key)
    const decrypted = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) {
      decrypted[i] = data[i] ^ keyBytes[i % keyBytes.length]
    }
    return new TextDecoder().decode(decrypted)
  }

  decryptUrl(encryptedBase64, key) {
    const bytes = this.base64ToBytes(encryptedBase64)
    return this.xorDecrypt(bytes, key)
  }

  transliterate(text) {
    if (!text) return ''
    const cyrillicToLatin = {
      а: 'a',
      б: 'b',
      в: 'v',
      г: 'g',
      д: 'd',
      е: 'e',
      ё: 'yo',
      ж: 'zh',
      з: 'z',
      и: 'i',
      й: 'y',
      к: 'k',
      л: 'l',
      м: 'm',
      н: 'n',
      о: 'o',
      п: 'p',
      р: 'r',
      с: 's',
      т: 't',
      у: 'u',
      ф: 'f',
      х: 'kh',
      ц: 'ts',
      ч: 'ch',
      ш: 'sh',
      щ: 'sch',
      ъ: '',
      ы: 'y',
      ь: '',
      э: 'e',
      ю: 'yu',
      я: 'ya',
      А: 'A',
      Б: 'B',
      В: 'V',
      Г: 'G',
      Д: 'D',
      Е: 'E',
      Ё: 'Yo',
      Ж: 'Zh',
      З: 'Z',
      И: 'I',
      Й: 'Y',
      К: 'K',
      Л: 'L',
      М: 'M',
      Н: 'N',
      О: 'O',
      П: 'P',
      Р: 'R',
      С: 'S',
      Т: 'T',
      У: 'U',
      Ф: 'F',
      Х: 'Kh',
      Ц: 'Ts',
      Ч: 'Ch',
      Ш: 'Sh',
      Щ: 'Sch',
      Ъ: '',
      Ы: 'Y',
      Ь: '',
      Э: 'E',
      Ю: 'Yu',
      Я: 'Ya'
    }
    return text
      .split('')
      .map((char) => cyrillicToLatin[char] || char)
      .join('')
      .replace(/[^\x00-\x7F]/g, '')
  }
}
