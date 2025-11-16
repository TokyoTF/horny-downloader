import fs from 'fs'
import path from 'path'

/**
 * Registry for all site extensions
 */
export default class ExtensionRegistry {
  constructor() {
    this.extensions = new Map()
    this.availableExtensions = new Map() // Track available but failed extensions
  }

  /**
   * Automatically detect and load extension files
   */
  async detectExtensionFiles() {
    // Use the current file's directory since ExtensionRegistry.js is in the extensions folder
    const extensionsDir = path.join('extensions')
    const files = fs.readdirSync(extensionsDir)

    const extensionFiles = files.filter(file => 
      file.endsWith('Extension.js') && 
      file !== 'Extension.js' && 
      file !== 'index.js' &&
      !file.includes('base/')
    )

    return extensionFiles.map(file => path.parse(file).name)
  }

  /**
   * Initialize all available extensions
   */
  async initializeExtensions() {
    const detectedExtensions = await this.detectExtensionFiles()
    for (const extensionName of detectedExtensions) {
      try {
        const module = await import(`file:///${__dirname}/../../extensions/${extensionName}.js`)
        const ExtensionClass = module.default
        const extension = new ExtensionClass()
        this.registerExtension(extension)
        console.log(`✅ Loaded extension: ${extensionName}`)
      } catch (error) {
        // Track failed extensions for frontend display
        this.availableExtensions.set(extensionName, {
          loaded: false,
          error: error.message,
          domains: this.getDomainsFromConfig(extensionName)
        })
        console.warn(`❌ Failed to load extension ${extensionName}:`, error.message)
      }
    }
  }

  /**
   * Get domains support from config for extensions that failed to load
   */
  getDomainsFromConfig(extensionName) {
    // Map extension names to their config keys
    const nameToConfigKey = {
      'BeegExtension': 'beeg',
      'EpornerExtension': 'eporner',
      'PornhubExtension': 'pornhub',
      'XnxxExtension': 'xnxx',
      'XvideosExtension': 'xvideos',
      'XhamsterExtension': 'xhamster',
      'SpankbangExtension': 'spankbang',
      'PorndigExtension': 'porndig',
      'PornoneExtension': 'pornone',
      'RedtubeExtension': 'redtube',
      'YoupornExtension': 'youporn',
      'Tube8Extension': 'tube8',
      'ThumbzillaExtension': 'thumbzilla'
    }
    
    const configKey = nameToConfigKey[extensionName]
    return configKey ? [configKey] : []
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
      const extensionName = extension.constructor.name
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
    extension.config.domains_support.forEach(domain => {
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
      console.error('Invalid URL:', url)
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
   * Extract video information from URL
   * @param {string} url - URL to extract from
   * @returns {Promise<Object|null>} Video information or null if not supported
   */
  async extractVideo(url) {
    const extension = await this.getExtensionForUrl(url)
    if (!extension) {
      throw new Error(`No extension found for URL: ${url}`)
    }

    try {
      const videoData = await extension.extract(url)
      
      // Add site information from the extension
      videoData.site = this.getDomainsFromConfig(extension.constructor.name)[0]

      return videoData
    } catch (error) {
      console.error(`Error extracting video from ${url}:`, error)
      throw error
    }
  }
}
