import logger from '../src/main/logger.js'

/**
 * User agent forced on every intercepted request so CDNs answer with the same
 * fingerprint the extensions use when they talk to the site from the main process.
 */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

/**
 * Headers applied to every intercepted request, before the per-site rules.
 * The empty Origin keeps CDNs that check for a missing/cross origin request happy.
 */
const BASE_REQUEST_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  Origin: ''
}

/**
 * Escape a string so it can be embedded inside a regular expression.
 * @param {string} value
 * @returns {string}
 */
export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Convert a Chromium/Electron URL pattern into a regular expression.
 *
 * Supported syntax:
 *  - scheme: '*' or an explicit one ('https', 'http', ...)
 *  - host:   '*', '*.example.com' (matches example.com and any subdomain) or an exact host
 *  - path:   any path, '*' acts as a wildcard
 *
 * @param {string} pattern - URL pattern, e.g. 'https://*.bunkr.cr/*'
 * @returns {RegExp|null} Compiled matcher or null when the pattern is invalid
 */
export function patternToRegExp(pattern) {
  if (typeof pattern !== 'string' || !pattern.trim()) return null

  const match = /^(\*|[a-z][a-z0-9+.-]*):\/\/([^/]*)(\/.*)?$/i.exec(pattern.trim())
  if (!match) return null

  const [, scheme, host, path = '/'] = match

  let hostSource
  if (host === '*') {
    hostSource = '[^/]+'
  } else if (host.startsWith('*.')) {
    hostSource = `(.+\\.)?${escapeRegExp(host.slice(2))}`
  } else {
    hostSource = escapeRegExp(host)
  }

  const pathSource = escapeRegExp(path).replace(/\\\*/g, '.*')
  const schemeSource = scheme === '*' ? '[a-z][a-z0-9+.-]*' : escapeRegExp(scheme)

  try {
    return new RegExp(`^${schemeSource}://${hostSource}${pathSource}`, 'i')
  } catch {
    return null
  }
}

/**
 * Normalize the different accepted shapes of a header definition into a plain map.
 *
 * Accepted inputs:
 *  - ['Origin', 'value'] / { name: 'Origin', value: 'value' }
 *  - { Origin: 'value' }
 *
 * @param {Array|Object|null|undefined} extra
 * @returns {Object} Map of header name to value
 */
export function normalizeHeaders(extra) {
  const headers = {}
  if (!extra) return headers

  if (Array.isArray(extra)) {
    for (const entry of extra) {
      if (!entry) continue
      if (Array.isArray(entry) && entry.length >= 2) {
        headers[String(entry[0])] =
          entry[1] === undefined || entry[1] === null ? '' : String(entry[1])
      } else if (entry.name) {
        headers[String(entry.name)] =
          entry.value === undefined || entry.value === null ? '' : String(entry.value)
      }
    }
    return headers
  }

  if (typeof extra === 'object') {
    for (const [name, value] of Object.entries(extra)) {
      headers[name] = value === undefined || value === null ? '' : String(value)
    }
  }

  return headers
}

/**
 * Build the interceptor rules declared by a single extension.
 *
 * An extension declares its media hosts through `config.patterns`. Every entry is either:
 *  - a plain URL pattern string, which inherits the extension wide headers, or
 *  - an object `{ url, headers }` to override them for that specific host.
 *
 * The extension wide headers are:
 *  - `config.referer_url`  -> the Referer sent for the media requests
 *  - `config.referer_extra`-> any other header (Origin, Range, ...)
 *
 * @param {Object} extension - Loaded extension instance
 * @returns {Array<Object>} List of rules
 */
export function buildExtensionRules(extension) {
  const config = (extension && extension.config) || {}
  const patterns = Array.isArray(config.patterns) ? config.patterns : []
  if (!patterns.length) return []

  const baseHeaders = {}
  if (config.referer_url) baseHeaders['Referer'] = String(config.referer_url)
  Object.assign(baseHeaders, normalizeHeaders(config.referer_extra))

  const rules = []
  for (const entry of patterns) {
    let pattern = null
    let headers = {}

    if (typeof entry === 'string') {
      pattern = entry
    } else if (entry && typeof entry === 'object') {
      pattern = entry.url || entry.pattern || null
      headers = normalizeHeaders(entry.headers || entry.referer_extra)
    }

    if (!pattern) continue

    const matcher = patternToRegExp(pattern)
    if (!matcher) {
      logger.warn(`[interceptor] Invalid URL pattern ignored: ${pattern}`)
      continue
    }

    rules.push({
      pattern,
      matcher,
      name: config.name || 'unknown',
      headers: { ...baseHeaders, ...headers }
    })
  }

  return rules
}

/**
 * Applies the headers declared by the extensions to the requests fired by the
 * renderer (preview player) and by the proxy downloader.
 *
 * The whole behaviour is driven by the extension configuration, so adding support
 * for a new site does not require touching the main process anymore.
 */
export default class RequestInterceptor {
  /**
   * @param {Object} registry - ExtensionRegistry instance
   * @param {Object} targetSession - Electron session to intercept
   */
  constructor(registry, targetSession) {
    this.registry = registry
    this.session = targetSession
    this.rules = []
    this.filterUrls = []
    this.unsubscribe = null
  }

  /**
   * Subscribe to the registry and register the webRequest listeners.
   * Safe to call it more than once, only the first call has an effect.
   * @returns {Promise<void>}
   */
  async attach() {
    if (this.unsubscribe) return

    this.unsubscribe = this.registry.onChange(() => this.refresh())

    try {
      await this.registry.waitForInitialization()
    } catch (error) {
      logger.error('[interceptor] Could not initialize extensions:', error)
    }

    this.refresh()
  }

  /**
   * Stop listening for extension changes.
   */
  detach() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }

  /**
   * Rebuild the rules from the currently loaded extensions and re-register the listeners.
   */
  refresh() {
    this.buildRules()
    this.register()
  }

  /**
   * Collect the rules of every loaded extension.
   */
  buildRules() {
    const extensions = this.registry.getLoadedExtensions()
    const rules = []
    const urls = []

    const sorted = [...extensions].sort((a, b) =>
      String(a.config?.name || '').localeCompare(String(b.config?.name || ''))
    )

    for (const extension of sorted) {
      for (const rule of buildExtensionRules(extension)) {
        rules.push(rule)
        if (!urls.includes(rule.pattern)) urls.push(rule.pattern)
      }
    }

    this.rules = rules
    this.filterUrls = urls
  }

  /**
   * Register (or replace) the webRequest listeners using the current filter.
   */
  register() {
    if (!this.session || !this.session.webRequest) return

    const filter = { urls: this.filterUrls }

    this.session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      if (!details || !details.requestHeaders) {
        callback({ cancel: false })
        return
      }

      const headers = details.requestHeaders

      headers['Access-Control-Allow-Origin'] = BASE_REQUEST_HEADERS['Access-Control-Allow-Origin']
      headers['Origin'] = BASE_REQUEST_HEADERS['Origin']
      headers['User-Agent'] = DEFAULT_USER_AGENT

      for (const rule of this.rules) {
        if (!rule.matcher.test(details.url)) continue

        for (const [name, value] of Object.entries(rule.headers)) {
          headers[name] = value
        }
        break
      }

      callback({ requestHeaders: headers })
    })

    this.session.webRequest.onHeadersReceived(filter, (details, callback) => {
      if (!details || !details.responseHeaders) {
        callback({ cancel: false })
        return
      }

      const headers = details.responseHeaders

      delete headers['access-control-allow-origin']
      delete headers['Access-Control-Allow-Origin']
      delete headers['access-control-allow-methods']
      delete headers['Access-Control-Allow-Methods']
      delete headers['access-control-allow-headers']
      delete headers['Access-Control-Allow-Headers']

      headers['Access-Control-Allow-Origin'] = ['*']
      headers['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS']
      headers['Access-Control-Allow-Headers'] = ['*']

      callback({ responseHeaders: headers })
    })

    logger.debug(
      `[interceptor] Registered ${this.rules.length} header rules for ${this.filterUrls.length} patterns`
    )
  }
}
