import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { pathToFileURL } from 'url'
import ExtensionExtra from './base/Extension.js'
import { is } from '@electron-toolkit/utils'

const documentsPath = app.getPath('documents')

/**
 * Registry for all site extensions
 */
export default class ExtensionRegistry {
  constructor() {
    this.extensions = new Map()
    this.availableExtensions = new Map() // Track available but failed extensions
  }

  /**
   * Reload all extensions
   */
  async reloadExtensions() {
    this.extensions = new Map()
    this.availableExtensions = new Map()
    this._initializationPromise = null
    return this.initializeExtensions()
  }

  /**
   * Automatically detect and load extension files
   */
  async detectExtensionFiles() {
    const extensionsDir = is.dev 
      ? path.join(process.cwd(), 'extensions')
      : path.join(documentsPath, 'horny-downloader', 'extensions')
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
        console.warn(`❌ Failed to load extension ${extensionName}:`, error.message)
      }
    }
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
   * Check for updates for all extensions
   * @param {string} branch - Branch to check updates from (default: 'main')
   * @returns {Promise<Array>} List of available updates
   */
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

    for (const name of extensionsToCheck) {
      try {
        const url = `https://raw.githubusercontent.com/TokyoTF/horny-downloader/${branch}/extensions/${name}Extension.js`
        const response = await fetch(url)
        
        if (!response.ok) {
            console.warn(`Failed to fetch update for ${name}: ${response.statusText}`)
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
          for(const [_, ext] of this.extensions) {
             if(ext.config.name === name) {
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

          if (this.compareVersions(remoteVersion, currentVersion) > 0) {
            updates.push({
              name: name,
              currentVersion: currentVersion,
              newVersion: remoteVersion,
              url: url
            })
          }
        }
      } catch (error) {
        console.error(`Error checking update for ${name}:`, error)
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
          console.error(`Failed to update extension ${name}:`, error)
          throw error
      }
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
      let videoData = await extension.extract(url)
      
      // Add site information from the extension
      videoData.site = String(extension.config.name).toLowerCase()
      
      if (extension.config.referer) {
        videoData.referer = `https://${extension.config.prefix_url}/`
      }

      return videoData
    } catch (error) {
      console.error(`Error extracting video from ${url}:`, error)
      throw error
    }
  }
}
