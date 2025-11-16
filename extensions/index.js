import ExtensionRegistry from './ExtensionRegistry.js'

/**
 * Main extension system entry point
 */
export { ExtensionRegistry }

/**
 * Convenience function to extract video from URL
 * @param {string} url - Video URL
 * @returns {Promise<Object>} Video information
 */
export async function extractVideo(url) {
  const registry = new ExtensionRegistry()
  return await registry.extractVideo(url)
}

/**
 * Convenience function to check if URL is supported
 * @param {string} url - URL to check
 * @returns {boolean} True if supported
 */
export function isUrlSupported(url) {
  const registry = new ExtensionRegistry()
  return registry.isUrlSupported(url)
}

/**
 * Get all supported domains
 * @returns {Array} Array of supported domains
 */
export function getSupportedDomains() {
  const registry = new ExtensionRegistry()
  return registry.getSupportedDomains()
}
