import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { pathToFileURL } from 'url'
import ExtensionExtra from './base/Extension.js'
import { is } from '@electron-toolkit/utils'
import logger from '../src/main/logger.js'
import {
  ExtensionError,
  clearExtensionLogs,
  getExtensionLogs,
  log,
  normalizeExtensionError,
  onExtensionLog,
  runWithExtensionContext
} from './extensionLogger.js'

const documentsPath = app.getPath('documents')

/**
 * Registry for all site extensions
 */
export default class ExtensionRegistry {
  constructor() {
    this.extensions = new Map()
    this.availableExtensions = new Map() // Track available but failed extensions
    this.changeListeners = new Set()
  }

  /**
   * Subscribe to extension list changes (initial load, reload, install, update)
   * @param {Function} listener - Callback invoked when the extension list changes
   * @returns {Function} Unsubscribe function
   */
  onChange(listener) {
    if (typeof listener !== 'function') return () => {}
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  /**
   * Notify every subscriber that the extension list changed
   */
  emitChange() {
    for (const listener of this.changeListeners) {
      try {
        listener()
      } catch (error) {
        logger.error('Extension change listener failed:', error)
      }
    }
  }

  /**
   * Get the loaded extensions without waiting for the initialization
   * @returns {Array<Object>} Array of extension instances
   */
  getLoadedExtensions() {
    return Array.from(this.extensions.values())
  }

  /**
   * Reload all extensions
   */
  async reloadExtensions() {
    this.extensions = new Map()
    this.availableExtensions = new Map()
    this._initializationPromise = this.initializeExtensions()
    return this._initializationPromise
  }

  /**
   * Automatically detect and load extension files
   */
  async detectExtensionFiles() {
    const extensionsDir = is.dev
      ? path.join(process.cwd(), 'extensions')
      : path.join(documentsPath, 'horny-downloader', 'extensions')
    const files = fs.readdirSync(extensionsDir)

    const extensionFiles = files.filter(
      (file) =>
        file.endsWith('Extension.js') &&
        file !== 'Extension.js' &&
        file !== 'index.js' &&
        !file.includes('base/')
    )

    return extensionFiles.map((file) => path.parse(file).name)
  }

  /**
   * Initialize all available extensions
   */
  async initializeExtensions() {
    const detectedExtensions = await this.detectExtensionFiles()
    for (const extensionName of detectedExtensions) {
      try {
        const extensionsDir = is.dev
          ? path.join(process.cwd(), 'extensions')
          : path.join(documentsPath, 'horny-downloader', 'extensions')
        const extensionPath = path.join(extensionsDir, `${extensionName}.js`)
        const module = await import(`${pathToFileURL(extensionPath).href}?t=${Date.now()}`)
        const ExtensionClass = module.default

        const extension = new ExtensionClass(ExtensionExtra)
        this.registerExtension(extension)
      } catch (error) {
        this.availableExtensions.set(extensionName, {
          loaded: false,
          error: error.message,
          domains: extensionName
        })
        runWithExtensionContext({ extension: extensionName }, () => {
          log('error', `Failed to load ${extensionName}: ${error.message}`, {
            code: 'EXTENSION_LOAD_FAILED',
            stack: error.stack
          })
        })
        logger.warn(`Failed to load extension ${extensionName}:`, error.message)
      }
    }

    this.emitChange()
  }

  /**
   * Get all extensions with their status (loaded or failed)
   * @returns {Object} Object with loaded and failed extensions info
   */
  async getAllExtensionsStatus() {
    await this.waitForInitialization()

    const loadedExtensions = {}
    const failedExtensions = {}

    // Get loaded extensions
    for (const [domain, extension] of this.extensions) {
      const extensionName = extension.config.name
      if (!loadedExtensions[extensionName]) {
        loadedExtensions[extensionName] = {
          loaded: true,
          domains: extension.config.domains_support,
          config: extension.config
        }
      }
    }

    // Get failed extensions
    for (const [extensionName, info] of this.availableExtensions) {
      failedExtensions[extensionName] = info
    }

    return {
      loaded: loadedExtensions,
      failed: failedExtensions,
      total: Object.keys(loadedExtensions).length + Object.keys(failedExtensions).length
    }
  }

  /**
   * Wait for extensions to be initialized
   * @returns {Promise<void>}
   */
  async waitForInitialization() {
    if (this._initializationPromise) {
      return this._initializationPromise
    }

    this._initializationPromise = this.initializeExtensions()
    return this._initializationPromise
  }

  /**
   * Register an extension
   * @param {Extension} extension - Extension instance
   */
  registerExtension(extension) {
    extension.config.domains_support.forEach((domain) => {
      this.extensions.set(domain, extension)
    })
  }

  /**
   * Get extension for a URL
   * @param {string} url - URL to find extension for
   * @returns {Promise<Extension|null>} Extension instance or null if not found
   */
  async getExtensionForUrl(url) {
    await this.waitForInitialization()

    try {
      const urlObj = new URL(url)
      const domain = urlObj.hostname.replace('www.', '')

      // Check exact domain match first
      if (this.extensions.has(domain)) {
        return this.extensions.get(domain)
      }

      // Check for partial matches (for subdomains)
      for (const [key, extension] of this.extensions) {
        if (domain.includes(key) || key.includes(domain)) {
          return extension
        }
      }

      return null
    } catch (error) {
      logger.error('Invalid URL:', url)
      return null
    }
  }

  /**
   * Get all supported domains
   * @returns {Promise<Array>} Array of supported domains
   */
  async getSupportedDomains() {
    await this.waitForInitialization()
    return Array.from(this.extensions.keys())
  }

  /**
   * Get all extensions
   * @returns {Promise<Map>} Map of all extensions
   */
  async getAllExtensions() {
    await this.waitForInitialization()
    return this.extensions
  }

  /**
   * Check if a URL is supported
   * @param {string} url - URL to check
   * @returns {Promise<boolean>} True if supported, false otherwise
   */
  async isUrlSupported(url) {
    const extension = await this.getExtensionForUrl(url)
    return extension !== null
  }

  /**
   * Check for updates for all extensions
   * @param {string} branch - Branch to check updates from (default: 'main')
   * @returns {Promise<Array>} List of available updates
   */
  async getAppMajorVersion() {
    // Get the major version from package.json - hardcoded for now
    // In a real implementation, this would read from the app's version dynamically
    const appVersion = '1.2.7' // This should be read from package.json or a version file
    return parseInt(appVersion.split('.')[0]) || 0
  }

  async checkForUpdates(branch = 'main') {
    if (is.dev) return []

    await this.waitForInitialization()
    const updates = []
    const extensionsToCheck = []

    // Get all loaded extensions
    for (const [domain, extension] of this.extensions) {
      if (!extensionsToCheck.includes(extension.config.name)) {
        extensionsToCheck.push(extension.config.name)
      }
    }

    // Also check available (failed) extensions
    for (const [name] of this.availableExtensions) {
      if (!extensionsToCheck.includes(name)) {
        extensionsToCheck.push(name)
      }
    }

    const appMajorVersion = this.getAppMajorVersion()

    for (const name of extensionsToCheck) {
      try {
        const url = `https://raw.githubusercontent.com/TokyoTF/horny-downloader/${branch}/extensions/${name}Extension.js`
        const response = await fetch(url)

        if (!response.ok) {
          logger.warn(`Failed to fetch update for ${name}: ${response.statusText}`)
          continue
        }

        const remoteCode = await response.text()

        // Extract version from remote code
        const versionMatch = remoteCode.match(/version:\s*'([^']+)'/)
        if (versionMatch) {
          const remoteVersion = versionMatch[1]
          let currentVersion = '0.0.0'

          // Try to find current version
          // First check loaded extensions
          let loadedExt = null
          for (const [_, ext] of this.extensions) {
            if (ext.config.name === name) {
              loadedExt = ext
              break
            }
          }

          if (loadedExt) {
            currentVersion = loadedExt.config.version || '0.0.0'
          } else if (this.availableExtensions.has(name)) {
            // For failed extensions, we might not know the version easily without parsing the file,
            // but we can try to update anyway if it failed.
            // For now let's assume 0.0.0 for failed ones to force update if they are broken
            currentVersion = '0.0.0'
          }

          // Compare versions
          const comparison = this.compareVersions(remoteVersion, currentVersion)

          if (comparison > 0) {
            // Check if this is a breaking change (major version increment)
            const remoteMajor = parseInt(remoteVersion.split('.')[0]) || 0
            const currentMajor = parseInt(currentVersion.split('.')[0]) || 0

            // If the extension's major version increased, it's a breaking change
            // that requires the app to be updated first
            if (remoteMajor > currentMajor) {
              // Only allow the update if the app major version is >= the extension's new major version
              if (appMajorVersion >= remoteMajor) {
                updates.push({
                  name: name,
                  currentVersion: currentVersion,
                  newVersion: remoteVersion,
                  url: url
                })
              } else {
                logger.info(`Skipping extension update for ${name}: breaking change detected (extension v${remoteVersion} requires app v${remoteMajor}+, but app is v${appMajorVersion}). Update the app first.`)
              }
            } else {
              // Same major version, safe to update
              updates.push({
                name: name,
                currentVersion: currentVersion,
                newVersion: remoteVersion,
                url: url
              })
            }
          }
        }
      } catch (error) {
        logger.error(`Error checking update for ${name}:`, error)
      }
    }

    return updates
  }

  compareVersions(v1, v2) {
    const v1Parts = v1.split('.').map(Number)
    const v2Parts = v2.split('.').map(Number)

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const p1 = v1Parts[i] || 0
      const p2 = v2Parts[i] || 0
      if (p1 > p2) return 1
      if (p1 < p2) return -1
    }
    return 0
  }

  /**
   * Update a specific extension
   * @param {string} name - Name of the extension to update
   * @param {string} branch - Branch to update from (default: 'main')
   * @returns {Promise<boolean>} True if successful
   */
  async updateExtension(name, branch = 'main') {
    try {
      const url = `https://raw.githubusercontent.com/TokyoTF/horny-downloader/${branch}/extensions/${name}Extension.js`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to download extension')

      const code = await response.text()
      const extensionsDir = is.dev
        ? path.join(process.cwd(), 'extensions')
        : path.join(documentsPath, 'horny-downloader', 'extensions')
      const filePath = path.join(extensionsDir, `${name}Extension.js`)

      fs.writeFileSync(filePath, code)

      // Reload extensions to apply changes
      await this.reloadExtensions()
      return true
    } catch (error) {
      logger.error(`Failed to update extension ${name}:`, error)
      throw error
    }
  }

  /**
   * List all extensions available on GitHub that are not installed locally
   * @param {string} branch - Branch to check (default: 'main')
   * @returns {Promise<Array>} List of installable extensions
   */
  async listRemoteExtensions(branch = 'main') {
    try {
      const apiUrl = `https://api.github.com/repos/TokyoTF/horny-downloader/contents/extensions?ref=${branch}`
      const response = await fetch(apiUrl, {
        headers: { Accept: 'application/vnd.github.v3+json' }
      })
      if (!response.ok) throw new Error('Failed to fetch remote extensions')

      const files = await response.json()
      const remoteExtensions = files
        .filter(
          (f) =>
            f.name.endsWith('Extension.js') && f.name !== 'Extension.js' && f.name !== 'index.js'
        )
        .map((f) => ({
          name: f.name.replace('Extension.js', '').toLowerCase(),
          displayName: f.name.replace('Extension.js', ''),
          fileName: f.name
        }))

      return remoteExtensions
    } catch (error) {
      logger.error('Error listing remote extensions:', error)
      return []
    }
  }

  /**
   * Install an extension from GitHub
   * @param {string} name - Extension name (without Extension.js suffix)
   * @param {string} branch - Branch to install from (default: 'main')
   * @returns {Promise<boolean>} True if successful
   */
  async installExtension(name, branch = 'main') {
    try {
      const url = `https://raw.githubusercontent.com/TokyoTF/horny-downloader/${branch}/extensions/${name}Extension.js`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to download extension')

      const code = await response.text()
      const extensionsDir = is.dev
        ? path.join(process.cwd(), 'extensions')
        : path.join(documentsPath, 'horny-downloader', 'extensions')
      const filePath = path.join(extensionsDir, `${name}Extension.js`)

      fs.writeFileSync(filePath, code)
      await this.reloadExtensions()
      return true
    } catch (error) {
      logger.error(`Failed to install extension ${name}:`, error)
      throw error
    }
  }

  /**
   * Extract video information from URL
   * @param {string} url - URL to extract from
   * @returns {Promise<Object>} Video information
   * @throws {ExtensionError} When the URL is unsupported or the extension cannot
   *   resolve a playable source. The message is safe to show to the user.
   */
  async extractVideo(url) {
    const extension = await this.getExtensionForUrl(url)
    if (!extension) {
      throw new ExtensionError(`No extension found for URL: ${url}`, {
        code: 'NO_EXTENSION',
        url
      })
    }

    const extensionName = extension.config?.name || 'Unknown'

    try {
      return await runWithExtensionContext({ extension: extensionName, url }, async (context) => {
        let videoData

        try {
          videoData = await extension.extract(url)
        } catch (error) {
          throw normalizeExtensionError(error, context)
        }

        const hasValue = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(value))
        const hasPlayableSource =
          Boolean(videoData) &&
          (hasValue(videoData.video_test) ||
            hasValue(videoData.embed) ||
            videoData.batch_urls?.length > 0)

        if (!hasPlayableSource) {
          const status = videoData?.status ?? null
          const reason = status ? new Error(`No playable source found (status ${status})`) : null
          throw normalizeExtensionError(reason, context)
        }

        // Add site information from the extension
        videoData.site = String(extension.config.name).toLowerCase()

        if (extension.config.referer) {
          videoData.referer = `https://${extension.config.prefix_url}/`
        }

        if (extension.config.proxy_method) {
          videoData.proxy_method = true
        }

        return videoData
      })
    } catch (error) {
      const normalized =
        error instanceof ExtensionError
          ? error
          : normalizeExtensionError(error, { extension: extensionName, url })

      logger.error(
        `Extension ${extensionName} failed for ${url}: ${normalized.message}`,
        normalized.cause || normalized
      )
      throw normalized
    }
  }

  /**
   * Recent extension log entries (newest first), for the diagnostics panel.
   * @param {{ limit?: number, level?: string, extension?: string }} [options]
   * @returns {Array<Object>}
   */
  getLogs(options) {
    return getExtensionLogs(options)
  }

  /**
   * Clear the in-memory extension log buffer.
   */
  clearLogs() {
    clearExtensionLogs()
  }

  /**
   * Subscribe to extension log entries.
   * @param {(entry: Object) => void} listener
   * @returns {() => void} unsubscribe
   */
  onLog(listener) {
    return onExtensionLog(listener)
  }
}
