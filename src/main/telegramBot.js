import { Bot, Keyboard, InlineKeyboard } from 'grammy'
import { randomUUID } from 'crypto'

let bot = null
let chatId = ''
let isRunning = false

let activeJobs = {}
let localSettings = {}
let mainWindow = null
let logger = null
let extractVideo = null
let processBatchUrls = null

let pendingDownloads = {}
let telegramQueue = []

export function init(dependencies) {
  activeJobs = dependencies.activeJobs || {}
  localSettings = dependencies.localSettings || {}
  mainWindow = dependencies.mainWindow
  logger = dependencies.logger
  extractVideo = dependencies.extractVideo || null
  processBatchUrls = dependencies.processBatchUrls || null

  telegramQueue = []

  return {
    configure: async(token, chat) => {
      chatId = chat || ''
      if (token) {
        try {
          if (bot) {
            try {
              bot.isRunning() && await bot.stop()
            } catch (e) {}
            bot = null
          }
          bot = new Bot(token)
          setupHandlers()
          isRunning = true
          logger?.info('Telegram bot configured')

          setTimeout(() => {
            if (bot && isRunning) {
              try {
                bot.start()
              } catch (e) {
                logger?.error('Start error:', e)
              }
            }
          }, 1000)
        } catch (err) {
          logger?.error('Telegram config error:', err)
          logger?.error('Failed to configure telegram bot', err)
          isRunning = false
        }
      }
    },
    start: () => {
      isRunning = true
    },
    stop: async () => {
      isRunning = false
      if (bot) {
        try {
          bot.isRunning() && await bot.stop()
        } catch {}
        bot = null
      }
    },
    isConfigured: () => !!bot,
    isRunning: () => isRunning,
    getMainWindow: () => mainWindow,
    getQueueCount: () => telegramQueue.length,
    notifyDownloadComplete: async (title, site) => {
      if (bot && chatId && isRunning) {
        try {
          await bot.api.sendMessage(chatId, `✅ Download complete!\n\n📹 ${title}\n🌐 ${site}`, {
            parse_mode: 'HTML'
          })
        } catch (e) {
          logger?.error('Failed to send completion notification:', e)
        }
      }
    }
  }
}

function buildQualityKeyboard(qualities, downloadId) {
  const keyboard = new InlineKeyboard()
  const uniqueQualities = [...new Set(qualities.map((q) => q.quality))]

  for (let i = 0; i < uniqueQualities.length; i += 2) {
    const row = []
    row.push(
      InlineKeyboard.text(uniqueQualities[i] + 'p', `dl:${uniqueQualities[i]}:${downloadId}`)
    )
    if (i + 1 < uniqueQualities.length) {
      row.push(
        InlineKeyboard.text(
          uniqueQualities[i + 1] + 'p',
          `dl:${uniqueQualities[i + 1]}:${downloadId}`
        )
      )
    }
    keyboard.row(...row)
  }
  keyboard.row(InlineKeyboard.text('Auto (Best)', `dl:auto:${downloadId}`))
  return keyboard
}

function buildStartKeyboard(queueId) {
  return new InlineKeyboard()
    .row(
      InlineKeyboard.text('480p (Slow)', `sq:480:${queueId}`),
      InlineKeyboard.text('720p (Med)', `sq:720:${queueId}`)
    )
    .row(
      InlineKeyboard.text('1080p (Fast)', `sq:1080:${queueId}`),
      InlineKeyboard.text('Max (Fastest)', `sq:max:${queueId}`)
    )
}

function setupHandlers() {
  if (!bot) return

  const menuKeyboard = () =>
    new Keyboard()
      .text('/dl')
      .text('/add')
      .row()
      .text('/queue')
      .text('/start')
      .row()
      .text('/status')
      .text('/menu')

  bot.command('menu', async (ctx) => {
    if (!chatId && ctx.from?.id) {
      chatId = ctx.from.id.toString()
    }
    await ctx.reply(
      `🎬 <b>Horny Downloader Bot</b>

/dl url - download immediately
/add url - add to queue
/start - start queue download
/queue - view queue list
/status - check downloads`,
      { parse_mode: 'HTML', reply_markup: menuKeyboard() }
    )
  })

  const showMenuReply = async (ctx) => {
    await ctx.reply(
      `🎬 <b>Horny Downloader Bot</b>

/dl url - download immediately
/add url - add to queue
/start - start queue download
/queue - view queue list
/status - check downloads`,
      { parse_mode: 'HTML', reply_markup: menuKeyboard() }
    )
  }

  bot.command('dl', async (ctx) => {
    const url = ctx.message.text.split(' ').slice(1).join(' ')
    if (!url) {
      return showMenuReply(ctx)
    }

    if (!chatId && ctx.from?.id) {
      chatId = ctx.from.id.toString()
    }

    await ctx.reply(`🔍 Fetching video info: ${url}`)

    try {
      if (!extractVideo) {
        await ctx.reply('❌ Video extraction not available')
        return
      }

      const videoInfo = await extractVideo(url)

      if (!videoInfo || !videoInfo.list_quality || videoInfo.list_quality.length === 0) {
        await ctx.reply('❌ No qualities available for this video')
        return
      }

      const qualities = videoInfo.list_quality
      const qualityLabels = qualities.map((q) => q.quality).join(', ')
      const downloadId = randomUUID().substring(0, 8)

      pendingDownloads[downloadId] = {
        type: 'single',
        videoInfo,
        url
      }

      await ctx.reply(
        `🎬 <b>${videoInfo.title || 'Video'}</b>\n\n📋 Available qualities: ${qualityLabels}\n\nSelect a quality to download:`,
        {
          parse_mode: 'HTML',
          reply_markup: buildQualityKeyboard(qualities, downloadId)
        }
      )
    } catch (err) {
      logger?.error('Error fetching video info:', err)
      await ctx.reply(`❌ Error fetching video: ${err.message || 'Unknown error'}`)
    }
  })

  bot.command('add', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const url = args.join(' ')

    if (!url) {
      await ctx.reply('❌ Provide URL: /add url')
      return
    }

    if (!chatId && ctx.from?.id) {
      chatId = ctx.from.id.toString()
    }

    telegramQueue.push(url)

    await ctx.reply(
      `✅ Added to queue\n\nQueue: ${telegramQueue.length} URLs\n\nUse /start to begin downloading`,
      { parse_mode: 'HTML' }
    )
  })

  bot.command('start', async (ctx) => {
    if (!chatId && ctx.from?.id) {
      chatId = ctx.from.id.toString()
    }

    if (telegramQueue.length === 0) {
      await ctx.reply('📭 Queue is empty. Use /add url to add videos')
      return
    }

    const queueId = randomUUID().substring(0, 8)

    pendingDownloads[queueId] = {
      type: 'queue',
      count: telegramQueue.length
    }

    await ctx.reply(
      `📥 <b>Queue ready</b>\n\n${telegramQueue.length} videos in queue\n\nSelect quality to start downloading:`,
      {
        parse_mode: 'HTML',
        reply_markup: buildStartKeyboard(queueId)
      }
    )
  })

  bot.command('clear', async (ctx) => {
    telegramQueue = []
    await ctx.reply('🗑️ Queue cleared')
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📖 <b>Commands</b>

/menu - show menu
/dl url - download immediately
/add url - add to queue
/start - start queue download
/queue - queue list
/clear - clear queue
/status - download status
/settings - current settings
/logs - recent logs
/stop - stop bot`,
      { parse_mode: 'HTML' }
    )
  })

  bot.command('status', async (ctx) => {
    const count = Object.keys(activeJobs || {}).length
    await ctx.reply(`📥 <b>Status</b>\n\nActive: ${count}\nQueue: ${telegramQueue.length}`, {
      parse_mode: 'HTML'
    })
  })

  bot.command('queue', async (ctx) => {
    if (telegramQueue.length === 0) {
      await ctx.reply('📭 Queue is empty')
      return
    }

    let message = `📋 <b>Queue (${telegramQueue.length})</b>\n\n`

    for (let i = 0; i < Math.min(telegramQueue.length, 10); i++) {
      const url = telegramQueue[i]
      const shortUrl = url.length > 50 ? url.substring(0, 47) + '...' : url
      message += `${i + 1}. ${shortUrl}\n`
    }

    if (telegramQueue.length > 10) {
      message += `\n... and ${telegramQueue.length - 10} more`
    }

    message += '\n\nUse /start to begin downloading'

    await ctx.reply(message, { parse_mode: 'HTML' })
  })

  bot.command('settings', async (ctx) => {
    const ss = localSettings || {}
    await ctx.reply(
      `⚙️ <b>Settings</b>\n\nFormat: ${ss.default_format || 'mkv'}\nConcurrent: ${ss.concurrent_downloads || 3}\nSite folder: ${ss.organize_by_site ? 'Yes' : 'No'}\nNaming: ${ss.namefile_type || 'video_title'}`,
      { parse_mode: 'HTML' }
    )
  })

  bot.command('logs', async (ctx) => {
    const logs = logger?.getRecentLogs(15) || 'No logs'
    await ctx.reply(`📝 <b>Logs</b>\n\n<pre>${logs.substring(0, 3000)}</pre>`, {
      parse_mode: 'HTML'
    })
  })

  bot.command('stop', async (ctx) => {
    isRunning = false
    await ctx.reply('👋 Bot stopped')
  })

  bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data

    if (data?.startsWith('dl:')) {
      const parts = data.split(':')
      const quality = parts[1]
      const downloadId = parts[2]

      const pending = pendingDownloads[downloadId]

      if (pending && pending.type === 'single' && mainWindow && !mainWindow.isDestroyed()) {
        let selectedQuality = quality

        if (quality === 'auto') {
          const sorted = [...pending.videoInfo.list_quality].sort(
            (a, b) => parseInt(b.quality) - parseInt(a.quality)
          )
          selectedQuality = sorted[0]?.quality || 'best'
        }

        await ctx.answerCallbackQuery(`Starting download in ${selectedQuality}p...`)

        await ctx.editMessageText(
          `⏳ Downloading <b>${pending.videoInfo.title || 'Video'}</b>\nQuality: ${selectedQuality}p\n\nStarted...`,
          { parse_mode: 'HTML' }
        )

        mainWindow.webContents.send('telegram-download-start', {
          url: pending.url,
          quality: selectedQuality,
          videoInfo: pending.videoInfo
        })

        delete pendingDownloads[downloadId]
      } else {
        await ctx.answerCallbackQuery('Download session expired')
      }
    } else if (data?.startsWith('sq:')) {
      const parts = data.split(':')
      const quality = parts[1]
      const queueId = parts[2]

      const pending = pendingDownloads[queueId]

      if (pending && pending.type === 'queue') {
        const delayMap = { 480: 8000, 720: 6000, 1080: 4000, max: 3000 }
        const delay = delayMap[quality] || 4000

        await ctx.answerCallbackQuery(`Starting with ${quality}p, delay ${delay}ms...`)

        await ctx.editMessageText(
          `⏳ <b>Starting Queue Download</b>\n\n${pending.count} videos\nQuality: ${quality}p\nDelay: ${delay}ms\n\nDownloading...`,
          { parse_mode: 'HTML' }
        )

        if (processBatchUrls && telegramQueue.length > 0) {
          processBatchUrls([...telegramQueue], quality, delay)
        }

        telegramQueue = []
        delete pendingDownloads[queueId]
      } else {
        await ctx.answerCallbackQuery('Session expired')
      }
    } else {
      await ctx.answerCallbackQuery()
    }
  })

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text
    if (text.startsWith('/')) return
    if (!chatId && ctx.from?.id) {
      chatId = ctx.from.id.toString()
    }
    await ctx.reply('Use commands or /menu', { reply_markup: menuKeyboard() })
  })

  bot.catch((err) => {
    logger?.error('Telegram bot error:', err)
    logger?.error('Telegram bot error', err)
  })
}

export default { init }
