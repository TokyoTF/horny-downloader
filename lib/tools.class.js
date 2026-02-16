import { Parser } from 'm3u8-parser'

import mpdParser from 'mpd-parser'

export default class Sites {
  constructor() { }

  includes_search(url, list, reverse) {
    let sel = ''
    let intsel = ''
    let part = url.slice(url.indexOf('/') + 2, url.length)

    list.domains_includes.forEach((el) => {
      if (part.includes(el)) sel = el
    })
    list.domains_support.forEach((el) => {
      if (reverse && part.includes(el)) {
        intsel = part.slice(part.indexOf(el) + (el.length + 1), part.indexOf(sel))
      } else {
        intsel = part.slice(part.indexOf(sel) + sel.length, part.length)
      }
    })

    return intsel
  }

  bytesToSize(bytes) {
    var sizes = ['B', 'K', 'M', 'G', 'T', 'P']
    for (var i = 0; i < sizes.length; i++) {
      if (bytes <= 1024) {
        return bytes + ' ' + sizes[i]
      } else {
        bytes = parseFloat(bytes / 1024).toFixed(2)
      }
    }
    return bytes + ' P'
  }
  async resolutions(option) {
    let object = {}
    object.resolutions = []

    if (option.active) {
      let parser = new Parser()
      parser.push(option.data)
      parser.end()

      let formatParse = parser.manifest.playlists

      for (let index = 0; index < formatParse.length; index++) {
        const el = formatParse[index]

        let fileurl = !option.prefixUrl.directurl
          ? option.prefixUrl + el.uri
          : option.prefixUrl.directurl

        let format = {
          quality: option.part_special
            ? String(el.attributes.RESOLUTION.height)
            : el.attributes.NAME.replace('p', ''),
          url: fileurl
        }

        object.resolutions.push(format)
      }
    } else if (option.mpd) {
      let formatParse = mpdParser.parse(option.mpd)

      for (let index = 0; index < formatParse.playlists.length; index++) {
        const el = formatParse.playlists[index]
        let format = {
          quality: String(el.attributes.RESOLUTION.height),
          url: option.prefixUrl
        }
        if (option.codecForce && el.attributes.CODECS.includes(option.codecForce)) {

          object.resolutions.push(format)
        }

      }
    }
    return object.resolutions
  }
  secondsToTime(seconds, format, reverse) {
    let l_time = seconds
    if (reverse && typeof seconds === 'string' && seconds.includes(':')) {
      const parts = seconds.split(':').reverse()
      let sec = 0
      if (parts[0]) sec += parseInt(parts[0], 10)
      if (parts[1]) sec += parseInt(parts[1], 10) * 60
      if (parts[2]) sec += parseInt(parts[2], 10) * 3600
      l_time = sec
    }

    if (format == "pt") {
      const dur = seconds
      const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(dur)
      l_time = m
        ? (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + (parseInt(m[3] || '0', 10))
        : 0
    }
    const hours = Math.floor(l_time / 3600)
    const minutes = Math.floor((l_time % 3600) / 60)
    const remainingSeconds = Math.floor(l_time % 60)

    const h = hours < 10 ? '0' + hours : hours
    const m = minutes < 10 ? '0' + minutes : minutes
    const s = remainingSeconds < 10 ? '0' + remainingSeconds : remainingSeconds

    return `${h}:${m}:${s}`
  }

  headersDefault(extra) {
    let object = extra ? extra : {}
    object['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

    return JSON.stringify(object)
  }

}
