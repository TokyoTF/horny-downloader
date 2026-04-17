import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import {format} from 'date-and-time'

const logsDir = path.join(app.getPath('documents'), 'horny-downloader', 'logs')

function ensureLogsDir() {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }
}

function getLogFileName() {
  const now = new Date()
  return `debug_${format(now, 'YYYYMMDD')}.log`
}

function formatMessage(level, message, data = null) {
  const timestamp = format(new Date(), 'YYYY-MM-DD HH:mm:ss.SSS')
  let log = `[${timestamp}] [${level}] ${message}`
  if (data) {
    if (data instanceof Error) {
      log += `\n  Error: ${data.message}\n  Stack: ${data.stack}`
    } else if (typeof data === 'object') {
      try {
        log += `\n  Data: ${JSON.stringify(data, null, 2)}`
      } catch {
        log += `\n  Data: [Object cannot be stringified]`
      }
    } else {
      log += `\n  Data: ${data}`
    }
  }
  return log
}

function writeLog(level, message, data = null) {
  ensureLogsDir()
  const logFile = path.join(logsDir, getLogFileName())
  const formatted = formatMessage(level, message, data)

  fs.appendFileSync(logFile, formatted + '\n')

  if (level === 'ERROR') {
    console.error(formatted)
  } else if (level === 'DEBUG') {
    console.debug(formatted)
  } else {
    console.log(formatted)
  }
}

export const logger = {
  info: (msg, data) => writeLog('INFO', msg, data),
  warn: (msg, data) => writeLog('WARN', msg, data),
  error: (msg, data) => writeLog('ERROR', msg, data),
  debug: (msg, data) => writeLog('DEBUG', msg, data),

  getLogsPath: () => logsDir,

  getRecentLogs: (lines = 100) => {
    const logFile = path.join(logsDir, getLogFileName())
    if (!fs.existsSync(logFile)) return ''

    const content = fs.readFileSync(logFile, 'utf-8')
    const allLines = content.split('\n')
    return allLines.slice(-lines).join('\n')
  }
}

export default logger
