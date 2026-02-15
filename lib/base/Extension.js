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
