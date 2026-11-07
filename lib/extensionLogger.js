import { AsyncLocalStorage } from 'node:async_hooks'
import logger from '../src/main/logger.js'

/**
 * Extension error / logging system.
 *
 * Extensions can call the global `log` helper from anywhere inside `extract()`:
 *
 *   log('error', 'The video is deleted')
 *   log('warn', 'Falling back to the mobile API', { code: 'MOBILE_FALLBACK' })
 *   log.fail('This album is private', { code: 'ALBUM_PRIVATE' }) // logs + throws
 *
 * An error logged with `log('error', ...)` marks the current extraction as failed:
 * if `extract()` then returns nothing (or the generic parsing error is thrown later),
 * that message is what the user sees instead of an obscure stack trace.
 */

const LEVEL_WEIGHT = { debug: 10, info: 20, warn: 30, error: 40 }
const LEVELS = new Set(Object.keys(LEVEL_WEIGHT))
const MAX_ENTRIES = 250
const MAX_MESSAGE_LENGTH = 1000
const RESERVED_KEYS = new Set(['code', 'extension', 'url', 'status', 'details', 'stack'])

const storage = new AsyncLocalStorage()
const entries = []
const listeners = new Set()
let sequence = 0

function clip(value, max = MAX_MESSAGE_LENGTH) {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (value instanceof Error) {
    return { name: value.name, message: clip(value.message), stack: value.stack || null }
  }
  if (typeof value !== 'object') {
    return typeof value === 'string' ? clip(value) : value
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    if (depth >= 2) return `[Array(${value.length})]`
    return value.slice(0, 20).map((item) => sanitize(item, depth + 1))
  }
  if (depth >= 2) return '[Object]'

  const result = {}
  let keys = 0
  for (const [key, item] of Object.entries(value)) {
    if (keys >= 25) break
    result[key] = sanitize(item, depth + 1)
    keys++
  }
  return result
}

function normalizeOptions(input) {
  if (!input) return {}
  if (input instanceof Error) {
    return {
      stack: input.stack || null,
      details: { name: input.name, message: clip(input.message) }
    }
  }
  if (typeof input !== 'object') {
    return { details: { value: clip(input) } }
  }

  const extra = {}
  for (const [key, value] of Object.entries(input)) {
    if (!RESERVED_KEYS.has(key)) extra[key] = value
  }

  const extraDetails = Object.keys(extra).length ? sanitize(extra) : null
  const explicitDetails = input.details ? sanitize(input.details) : null

  let details = null
  if (explicitDetails && extraDetails) details = { ...explicitDetails, ...extraDetails }
  else details = explicitDetails || extraDetails

  return {
    code: input.code,
    extension: input.extension,
    url: input.url,
    status: input.status,
    details,
    stack: input.stack || null
  }
}

/**
 * Error type used by every extension failure. It keeps useful metadata so the
 * renderer can show a clear message instead of a raw exception.
 */
export class ExtensionError extends Error {
  constructor(message, options = {}) {
    super(message || 'Unknown extension error')
    this.name = 'ExtensionError'
    this.code = options.code || 'EXTENSION_ERROR'
    this.extension = options.extension || ''
    this.url = options.url || ''
    this.status = options.status ?? null
    this.details = options.details || null
    if (options.cause) this.cause = options.cause
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      extension: this.extension,
      url: this.url,
      status: this.status,
      details: this.details
    }
  }
}

/**
 * Run a function with the extension context attached, so every `log()` call made
 * inside it (including nested async calls) knows which extension and URL it belongs to.
 *
 * @template T
 * @param {{ extension?: string, url?: string, requestId?: string|null }} info
 * @param {(context: Object) => T} fn
 * @returns {T}
 */
export function runWithExtensionContext(info, fn) {
  const context = {
    extension: info?.extension || '',
    url: info?.url || '',
    requestId: info?.requestId || null,
    startedAt: Date.now(),
    errors: []
  }
  return storage.run(context, () => fn(context))
}

/**
 * Current extension context, if any.
 */
export function getExtensionContext() {
  return storage.getStore() || null
}

function persist(entry) {
  const prefix = entry.extension ? `[extension:${entry.extension}] ` : '[extension] '
  const data = {}
  if (entry.url) data.url = entry.url
  if (entry.code) data.code = entry.code
  if (entry.status != null) data.status = entry.status
  if (entry.details) data.details = entry.details
  if (entry.stack) data.stack = entry.stack

  const write = typeof logger[entry.level] === 'function' ? logger[entry.level] : logger.info
  try {
    write(`${prefix}${entry.message}`, Object.keys(data).length > 0 ? data : undefined)
  } catch {
    // Logging must never break an extraction.
  }
}

function publish(entry) {
  for (const listener of listeners) {
    try {
      listener(entry)
    } catch (error) {
      logger.error('Extension log listener failed:', error)
    }
  }
}

/**
 * Record a log entry. Never throws, so extensions can use it at any point.
 *
 * Accepted forms:
 *   log('error', 'The video is deleted')
 *   log('warn', 'Message', { code: 'CODE', status: 404 })
 *   log('Info message')                       // defaults to info
 *   log.error('Message', { url })
 *
 * @returns {Object} the stored entry
 */
function extensionLog(level, message, options) {
  let nextLevel = typeof level === 'string' ? level.toLowerCase() : ''
  let nextMessage = message
  let nextOptions = options

  if (!LEVELS.has(nextLevel)) {
    nextOptions = message
    nextMessage = level
    nextLevel = 'info'
  }

  if (nextMessage instanceof Error) {
    nextOptions = nextMessage
    nextMessage = nextMessage.message
  }

  const context = storage.getStore() || null
  const opts = normalizeOptions(nextOptions)

  const entry = {
    id: ++sequence,
    time: new Date().toISOString(),
    level: nextLevel,
    message: clip(String(nextMessage ?? '').trim() || '(no message)'),
    code: opts.code ? String(opts.code) : null,
    extension: opts.extension || context?.extension || '',
    url: opts.url || context?.url || '',
    status: opts.status ?? null,
    details: opts.details || null,
    stack: opts.stack || null
  }

  persist(entry)
  publish(entry)

  entries.push(entry)
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES)
  }

  if (entry.level === 'error' && Array.isArray(context?.errors)) {
    context.errors.push(entry)
  }

  return entry
}

extensionLog.debug = (message, options) => extensionLog('debug', message, options)
extensionLog.info = (message, options) => extensionLog('info', message, options)
extensionLog.warn = (message, options) => extensionLog('warn', message, options)
extensionLog.error = (message, options) => extensionLog('error', message, options)

/**
 * Log an error and throw an `ExtensionError` immediately, for branches where the
 * extraction cannot continue (deleted video, private album, geo-block, ...).
 *
 * @param {string} message - Message shown to the user
 * @param {Object} [options] - code, status, url, details...
 */
export function fail(message, options = {}) {
  extensionLog('error', message, options)
  throw new ExtensionError(message, {
    code: options?.code || 'EXTENSION_FAILED',
    extension: options?.extension,
    url: options?.url,
    status: options?.status,
    details: options?.details
  })
}

extensionLog.fail = fail

/**
 * Last error explicitly logged inside a context (through `log('error', ...)`).
 * @param {Object} [context]
 * @returns {Object|null}
 */
export function getLastLoggedError(context) {
  const errors = context?.errors
  if (!Array.isArray(errors) || errors.length === 0) return null
  return errors[errors.length - 1]
}

/**
 * Convert any thrown value into an `ExtensionError`, giving priority to the last
 * error logged by the extension. That way `log('error', 'The video is deleted')`
 * wins over a later, meaningless `Cannot read properties of undefined`.
 *
 * @param {unknown} error
 * @param {Object} [context]
 * @returns {ExtensionError}
 */
export function normalizeExtensionError(error, context = {}) {
  if (error instanceof ExtensionError) {
    if (!error.extension && context.extension) error.extension = context.extension
    if (!error.url && context.url) error.url = context.url
    return error
  }

  const logged = getLastLoggedError(context)
  const internalMessage = error instanceof Error ? error.message : String(error || '')
  const message =
    logged?.message || internalMessage || 'The extension returned no playable video source'

  const details = {}
  if (logged && internalMessage && internalMessage !== message) {
    details.internalError = clip(internalMessage)
  }

  return new ExtensionError(message, {
    code: logged?.code || 'EXTENSION_ERROR',
    extension: logged?.extension || context.extension || '',
    url: logged?.url || context.url || '',
    status: logged?.status ?? null,
    details: Object.keys(details).length > 0 ? details : null,
    cause: error instanceof Error ? error : null
  })
}

/**
 * Recent entries, newest first.
 *
 * @param {{ limit?: number, level?: 'debug'|'info'|'warn'|'error', extension?: string }} [options]
 *   `level` acts as a minimum severity (error returns only errors).
 * @returns {Array<Object>}
 */
export function getExtensionLogs(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), MAX_ENTRIES)
  const level = options.level ? String(options.level).toLowerCase() : ''
  const minWeight = LEVEL_WEIGHT[level] || 0
  const extension = options.extension ? String(options.extension).toLowerCase() : ''

  return entries
    .filter((entry) => {
      if (minWeight && LEVEL_WEIGHT[entry.level] < minWeight) return false
      if (extension && entry.extension.toLowerCase() !== extension) return false
      return true
    })
    .slice(-limit)
    .reverse()
}

/**
 * Remove every stored entry. File logs are untouched.
 */
export function clearExtensionLogs() {
  entries.length = 0
}

/**
 * Subscribe to new entries (used for live diagnostics).
 * @param {(entry: Object) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onExtensionLog(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Plain object with the error data, safe to send through IPC.
 */
export function serializeExtensionError(error) {
  if (!error) return null
  if (error instanceof ExtensionError) return error.toJSON()
  return {
    name: error.name || 'Error',
    code: error.code || 'EXTENSION_ERROR',
    message: error.message || String(error),
    extension: error.extension || '',
    url: error.url || '',
    status: error.status ?? null,
    details: error.details || null
  }
}

export const log = extensionLog

// Make the helper available to extension files as a global, exactly as requested:
// `log('error', 'The Video is Deleted')`.
if (typeof globalThis.log !== 'function') {
  globalThis.log = extensionLog
}
globalThis.extensionLog = extensionLog
