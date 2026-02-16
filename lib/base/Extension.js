import { load } from 'cheerio'
import fetchCookie from 'fetch-cookie'
import nodeFetch from 'node-fetch'
import tool_class from '../tools.class.js'

const tool = new tool_class()

/**
 * Base class for all site extensions
 */
export default class Extension {
  constructor(config) {
    this.config = config
    this.tool = tool
    this.cherrio = load
  }

  /**
   * Cherrio function for requests
   * @returns {Object} Cherrio function
   */

  cherrio(){
    return this.cherrio
  }

  fetchcookies() {
    const cookie = fetchCookie.default || fetchCookie
    const fetch = nodeFetch.default || nodeFetch
    return cookie(fetch)
  }

  /**
   * Get video duration by fetching partial buffer and parsing MP4 moov/mvhd atom
   * @param {string} url - Direct video URL
   * @param {Object} headers - Optional extra headers for the request
   * @returns {Promise<string|null>} Formatted duration or null if not found
   */
  async getDurationUrl(url, headers = {}) {
    try {
      const reqHeaders = this.getDefaultHeaders(headers)
      const CHUNK = 10 * 1024 * 1024 // 10MB

      const head = await fetch(url, { method: 'HEAD', headers: reqHeaders })
      const size = parseInt(head.headers.get('content-length'), 10)

      const tailStart = Math.max(0, size - CHUNK)
      const tail = await fetch(url, {
        headers: { ...reqHeaders, Range: `bytes=${tailStart}-${size - 1}` }
      })
      const tailBuf = Buffer.from(await tail.arrayBuffer())
      let duration = this.parseMp4Duration(tailBuf)

      if (duration === null && tailStart > 0) {
        const headReq = await fetch(url, {
          headers: { ...reqHeaders, Range: `bytes=0-${CHUNK - 1}` }
        })
        const headBuf = Buffer.from(await headReq.arrayBuffer())
        duration = this.parseMp4Duration(headBuf)
      }

      if (duration === null) return null
      return this.formatDuration(duration)
    } catch {
      return null
    }
  }

  /**
   * Parse MP4 buffer to find mvhd atom and extract duration
   * @param {Buffer} buffer - MP4 file buffer
   * @returns {number|null} Duration in seconds or null
   */
  parseMp4Duration(buffer) {
    const mvhdIndex = buffer.indexOf('mvhd')
    if (mvhdIndex === -1) return null
    const version = buffer.readUInt8(mvhdIndex + 4)

    let timescale, duration

    if (version === 0) {
      timescale = buffer.readUInt32BE(mvhdIndex + 16)
      duration = buffer.readUInt32BE(mvhdIndex + 20)
    } else {
      timescale = buffer.readUInt32BE(mvhdIndex + 24)
      duration = buffer.readUInt32BE(mvhdIndex + 32)
    }

    if (!timescale || !duration) return null
    return Math.floor(duration / timescale)
  }

  /**
   * Extract video ID from URL
   * @param {string} url - Video URL
   * @returns {string} Video ID
   */
  extractVideoId(url) {
    return this.tool.includes_search(url, this.config)
  }

  /**
   * Default headers for requests
   * @param {Object} extra - Additional headers
   * @returns {Object} Headers object
   */
  getDefaultHeaders(extra = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ...extra
    }

    if (this.config.referer) {
      headers.Referer = `https://${this.config.prefix_url}/`
    }

    return headers
  }

  /**
   * Parse resolutions from HLS manifest
   * @param {string} manifestData - HLS manifest content
   * @param {string} prefixUrl - Base URL for video segments
   * @param {Object} options - Additional options
   * @returns {Array} Array of quality objects
   */
  async parseResolutions(manifestData, prefixUrl, options = {}) {
    return await this.tool.resolutions({
      active: true,
      data: manifestData,
      prefixUrl,
      part_special: options.part_special || false,
      ...options
    })
  }

  /**
   * Format video duration
   * @param {number} seconds - Duration in seconds
   * @param {string} format - Format of time
   * @param {boolean} reverse - Reverse the time use format 00:00:00 and converts it to seconds and converts it back to 00:00:00 to avoid errors
   * @returns {string} Formatted time string
   */
  formatDuration(seconds, format, reverse) {
    return this.tool.secondsToTime(seconds, format, reverse)
  }

  /**
   * Create standard video response object
   * @param {Object} data - Video data
   * @returns {Object} Standardized response
   */
  createResponse(data) {
    return {
      embed: data.embed || '',
      video_test: data.video_test || '',
      list_quality: data.list_quality || [],
      title: data.title || '',
      time: data.time || '',
      thumb: data.thumb || '',
      status: data.status || 200,
      force_type: data.force_type || 'application/x-mpegurl'
    }
  }

  /**
   * Abstract method to be implemented by extensions
   * @returns {Promise<Object>} Video information
   */
  async extract() {
    throw new Error('extract method must be implemented by extension')
  }
}
