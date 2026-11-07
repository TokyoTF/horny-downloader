<img src="./resources/icon.png" alt="App Logo" width="70">

# Horny Downloader

A powerful desktop application for downloading videos from various adult content websites with a clean, user-friendly interface.

#### 📄 List of extensions

[Horny Downloader Extensions](https://github.com/TokyoTF/horny-downloader/tree/main/extensions)

## ✨ Features

- 🚀 Fast and efficient video downloads
- 🎥 Supports multiple video qualities
- 📁 Organized download history
- 🔄 Concurrent downloads support
- 🎨 Modern and intuitive interface
- 💾 Save videos in different formats
- ⚡ Quick preview of videos before downloading
- 🌐 Site filter dropdown to filter downloads by site
- 📥 Drag & drop URLs or .txt files to start batch downloads
- 📤 Export download history to CSV/JSON
- 📂 Organize downloads by site (subfolders)
- 📑 Multiple naming patterns: Video Title, Site - Title, Title - Site, Date - Title, Random UUID
- 🔔 Windows native notifications on download completion
- 📝 Detailed logging system
- 🤖 Telegram bot for remote control and notifications

## screenshots

<img width="338" height="270" alt="screenshot1" src="https://github.com/user-attachments/assets/cfab9e59-159f-4cf4-820c-e4218d067b2d" />

<img width="331" height="270" alt="screenshot2" src="https://github.com/user-attachments/assets/0cf52c37-7b88-48ef-bb63-c515088713dd" />

## 💾 Data Storage

- All application data is stored locally using **SQLite** in a `data.db` file
- Thumbnails and temporary files are stored in the `temp` folder
- Downloaded videos are saved in the `downloads` folder (or custom path)
- Logs are stored in `Documents/horny-downloader/logs/`

## 📦 Extensions

This application uses a modular extension system to support different video sites. Extensions are located in the `extensions/` folder and are automatically loaded when the application starts.

### 🔧 Adding New Extensions from GitHub

You can easily add new extensions by downloading them from GitHub and placing them in the extensions folder.

#### 📦 Method 1: Download Individual Extension Files

1. **Find the extension** on GitHub that you want to add
2. **Navigate to the extension file** (usually ends with `Extension.js`)
3. **Click the "Download Raw File" button** to view the raw file content
4. **Place the file** in your `extensions/` folder
5. **Restart the application** to load the new extension

#### Extension File Requirements

Extension files must:

- Be named with `Extension.js` suffix (e.g., `NewSiteExtension.js`)
- Export a default class
- Include proper configuration in the constructor

#### Example Extension Structure

```javascript
export default class NewSiteExtension {
  constructor(ExtensionExtra) {
    this.config = {
      // Display name. Shown in the UI, and lowercased to key the history /
      // "organize by site" subfolders.
      name: 'NewSite',
      // Badge color used for this site in the UI.
      color: '#000000',
      // Domains this extension answers for (matched against the URL host).
      domains_support: ['example.com'],
      // URL path fragments that identify a video page (e.g. '/video/').
      // URLs on a supported domain without any of these are ignored.
      domains_includes: ['/video/', '/watch/'],
      // Optional: path fragments that identify an album/gallery page.
      // When matched, extract() should return is_batch + batch_urls.
      // domains_includes_album: ['/album/'],
      // Path segment used to build the embed URL for the in-app preview
      // (https://<prefix_url>/<embed_preview>/<id>).
      embed_preview: 'embed',
      // Bare host (no protocol). Used to build absolute URLs and, when
      // `referer` is true, the Referer sent to the media servers.
      prefix_url: 'example.com',
      // If true, the app sends `Referer: https://<prefix_url>/` on the media
      // requests (preview and download).
      referer: false,
      // If true, the file is downloaded through Chromium's network stack
      // instead of ffmpeg directly. Needed for CDNs that reject ffmpeg's
      // TLS fingerprint. HLS is always downloaded this way.
      // proxy_method: false,
      // Container formats the site can serve ('mp4', 'hls', 'dash', ...).
      format_support: ['mp4'],
      // Whether the site provides WebVTT subtitles.
      vtt_support: false,
      // Quality labels offered in the quality dropdown.
      quality_support: ['1080', '720', '480'],
      // URL patterns of the media hosts, used by the request interceptor to
      // attach Referer/headers to media requests (see "Media request headers").
      patterns: ['https://*.cdn.example.com/*'],
      referer_url: 'https://example.com/',
      referer_extra: [{ name: 'Origin', value: 'https://example.com' }],
      // Semver string, used by the extension updater.
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    // Your extraction logic here
    return this.extension.createResponse({
      // Embed/player URL used for the in-app preview.
      embed: 'https://example.com/embed/video123',
      // Direct media URL used to test/preview the video.
      video_test: 'https://example.com/video.mp4',
      // Selectable qualities. `quality` MUST be a numeric string ('720'),
      // because the UI sorts them numerically.
      list_quality: [{ quality: '720', url: 'https://example.com/video720.mp4' }],
      // Optional: [{ url, language }] when vtt_support is true.
      // subtitles: [{ url: 'https://example.com/subs.vtt', language: 'en' }],
      title: 'Video Title',
      // Duration as mm:ss or hh:mm:ss.
      time: '10:30',
      thumb: 'https://example.com/thumb.jpg',
      // HTTP-like status. Anything other than 200 is shown as an error.
      status: 200
      // force_type: MIME type hint for the player (defaults to HLS)
      // is_batch / batch_urls: for album pages, list of video page URLs
    })
  }
}
```

#### `config` fields

| Field                    | Type                       | Description                                                                                                                                                               |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                   | `string`                   | Display name. Lowercased to key history entries and the "organize by site" subfolders.                                                                                    |
| `color`                  | `string`                   | Hex color of the site badge in the UI.                                                                                                                                    |
| `domains_support`        | `Array<string>`            | Domains this extension answers for (matched against the URL host).                                                                                                        |
| `domains_includes`       | `Array<string>`            | URL path fragments that identify a video page. URLs on a supported domain without any of these are ignored.                                                               |
| `domains_includes_album` | `Array<string>` (optional) | Path fragments that identify an album/gallery page; `extract()` should then return `is_batch: true` with `batch_urls`.                                                    |
| `embed_preview`          | `string`                   | Path segment used to build the embed URL for the in-app preview (`https://<prefix_url>/<embed_preview>/<id>`).                                                            |
| `prefix_url`             | `string`                   | Bare host (no protocol) used to build absolute URLs and the `Referer`.                                                                                                    |
| `referer`                | `boolean`                  | If true, sends `Referer: https://<prefix_url>/` on media requests (preview and download).                                                                                 |
| `proxy_method`           | `boolean` (optional)       | If true, downloads through Chromium's network stack instead of ffmpeg directly — needed for CDNs that reject ffmpeg's TLS fingerprint. HLS is always downloaded this way. |
| `format_support`         | `Array<string>`            | Container formats the site can serve (`'mp4'`, `'hls'`, `'dash'`, ...).                                                                                                   |
| `vtt_support`            | `boolean`                  | Whether the site provides WebVTT subtitles.                                                                                                                               |
| `quality_support`        | `Array<string>`            | Quality labels shown in the dropdown. Use numeric strings (`'720'`) so sorting works.                                                                                     |
| `patterns`               | `Array<string \| Object>`  | Media host URL patterns for the request interceptor (see "Media request headers" below).                                                                                  |
| `referer_url`            | `string`                   | `Referer` sent on matching media requests.                                                                                                                                |
| `referer_extra`          | `Array<{ name, value }>`   | Extra headers (`Origin`, ...) sent on matching media requests.                                                                                                            |
| `version`                | `string`                   | Semver string used by the extension updater.                                                                                                                              |

#### `createResponse` fields

| Field                     | Type                                   | Description                                                                                       |
| ------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `embed`                   | `string`                               | Embed/player URL used for the in-app preview.                                                     |
| `video_test`              | `string`                               | Direct media URL used to test/preview playback.                                                   |
| `list_quality`            | `Array<{ quality, url }>`              | Selectable qualities. `quality` must be a **numeric string** (`'720'`), the UI sorts numerically. |
| `subtitles`               | `Array<{ url, language }>` (optional)  | WebVTT subtitles when `vtt_support` is true.                                                      |
| `title`                   | `string`                               | Video title.                                                                                      |
| `time`                    | `string`                               | Duration as `mm:ss` or `hh:mm:ss`.                                                                |
| `thumb`                   | `string`                               | Thumbnail URL.                                                                                    |
| `status`                  | `number`                               | HTTP-like status; anything other than 200 is shown as an error.                                   |
| `force_type`              | `string` (optional)                    | MIME type hint for the player (defaults to `application/x-mpegurl`).                              |
| `is_batch` / `batch_urls` | `boolean` / `Array<string>` (optional) | For album pages: list of video page URLs to download as a batch.                                  |

#### Base class helpers (`this.extension.*`)

`ExtensionExtra` in the constructor is the base `Extension` class. Besides `config`,
`logger`, `log`/`fail` (see below) and `this.tool` (low level: `includes_search`,
`secondsToTime`, `resolutions`, `bytesToSize`), every extension can use:

| Helper                                                           | Description                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `this.extension.extractVideoId(url)`                             | Extracts the video id from a URL using `domains_includes` (e.g. `/video/` → everything after it).                                                |
| `this.extension.toAbsoluteUrl(url)`                              | Turns protocol relative URLs into absolute ones (`//cdn.example.com/x.mp4` → `https://cdn.example.com/x.mp4`).                                   |
| `this.extension.normalizeQuality(label)`                         | Normalises a player quality label to a numeric height (`'720p HD'` → `'720'`, `'4K'` → `'2160'`).                                                |
| `this.extension.parseDurationText(raw)`                          | Parses textual durations (`'22min 21sec'`, `'1h 5min 3sec'`) into `HH:MM:SS`.                                                                    |
| `this.extension.formatDuration(seconds, format?, reverse?)`      | Seconds → `'HH:MM:SS'`. With `format='pt'` it parses an ISO 8601 period (`'PT17M13S'`); with `reverse=true` it parses an `'HH:MM:SS'` string.    |
| `this.extension.getDefaultHeaders(extra?)`                       | Default request headers: browser `User-Agent`, plus `Referer: https://<prefix_url>/` when `config.referer` is true. Merge your own with `extra`. |
| `this.extension.cherrio` / `this.extension.cherrio()`            | Cheerio `load` — parse HTML with `const $ = this.extension.cherrio(html)`.                                                                       |
| `this.extension.fetchcookies()`                                  | Returns a `fetch` wrapped with a cookie jar (`fetch-cookie` + `node-fetch`) — use it when the site needs session cookies.                        |
| `this.extension.cloudflareFetch(url)`                            | Fetches a page through a hidden Chromium window (bypasses Cloudflare "Just a moment"). Returns `{ status, ok, text() }`.                         |
| `this.extension.getDurationUrl(url, headers?)`                   | Reads the duration of a direct mp4 via `Range` requests and the `mvhd` atom. Returns `'HH:MM:SS'` or `null`.                                     |
| `this.extension.parseMp4Duration(buffer)`                        | Parses the `mvhd` atom of an mp4 `Buffer` → duration in seconds (or `null`).                                                                     |
| `this.extension.parseResolutions(manifest, prefixUrl, options?)` | Parses an HLS master (or DASH) manifest into `[{ quality, url }]`.                                                                               |
| `this.extension.isAlbumUrl(url)`                                 | True when the URL matches `domains_includes_album`.                                                                                              |
| `this.extension.createResponse(data)`                            | Builds the standard response object (see the table above).                                                                                       |

#### Error reporting and logging

Every extension gets a global `log(level, message, options?)` helper, also available as
`this.extension.log`. Use it to report what happened instead of failing with an opaque error:

```javascript
async extract(url) {
  const page = await fetch(url).then((r) => r.text())

  if (page.includes('This video has been deleted')) {
    // Records the error. Returning nothing makes it the failure reason.
    log('error', 'The Video is Deleted', { code: 'VIDEO_DELETED', status: 410 })
    return
  }

  if (!page.includes('player')) {
    // Records the error and throws immediately (no point in continuing).
    log.fail('Could not find the player on this page', { code: 'PLAYER_NOT_FOUND' })
  }

  log('warn', 'Using the mobile API', { code: 'MOBILE_API' })
  // ...
}
```

| API                                                               | Description                                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `log('debug' \| 'info' \| 'warn' \| 'error', message, options?)`  | Stores a log entry. An `error` becomes the failure reason when the extraction cannot return a playable source. |
| `log.error(message, options?)` (and `.debug` / `.info` / `.warn`) | Same as above with the level preset.                                                                           |
| `log.fail(message, options?)`                                     | Stores an `error` entry and throws an `ExtensionError` immediately.                                            |
| `this.extension.log(...)` / `this.extension.fail(...)`            | The same helpers exposed by the base extension.                                                                |

`options` accepts `{ code, status, url, details }`. When an extraction fails, the last message
logged with `log('error', ...)` becomes the message shown to the user (the original exception is
kept as the cause in the log file). Entries are visible in **Settings → Extension Errors** and in
the daily file under `Documents/horny-downloader/logs`.

#### Media request headers

The app intercepts the requests fired by the preview player (and by the proxy downloader) so
the media servers accept them. Every extension declares that behaviour in its own config, so
supporting a new CDN never requires touching the main process.

| Option          | Type                      | Description                                                                                                                                                   |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patterns`      | `Array<string \| Object>` | URL patterns of the media hosts of the site. A plain string inherits the extension wide headers, an object (`{ url, headers }`) overrides them for that host. |
| `referer_url`   | `string`                  | Value sent as `Referer` on the matching requests. Omit it to send no `Referer` at all.                                                                        |
| `referer_extra` | `Array<{ name, value }>`  | Any additional header (`Origin`, `Range`, ...) sent on the matching requests.                                                                                 |

Both `referer_url` and `referer_extra` are applied to every pattern of the extension, and a
pattern with its own `headers` overrides them for that host only:

```javascript
// The site serves its files from a different host per mirror
patterns: [
  {
    url: 'https://*.cdn.example.com/*',
    headers: { Referer: 'https://example.com/', Origin: 'https://example.com/' }
  },
  { url: 'https://*.cdn2.example.com/*', headers: { Referer: 'https://example.com/' } },
  'https://*.static.example.com/*' // plain string: inherits the extension wide headers
]
```

The patterns are also the filter used by `session.webRequest`, so a host that is not listed
never gets its headers rewritten.

## 🌐 Supported Sites

- PornHub
- XHamster
- XVideos
- XNXX
- YouPorn
- RedTube
- SpankBang
- Tube8
- ThumbZilla
- PornOne
- Porndig
- Beeg
- Eporner
- Erome
- Sxyprn
- Bunkr
- Pimpbunny
- Hentaihaven
- Hentaila
- HQporner
- PornTrex
- Tnaflix
- Xfree

## 🛠️ Installation for dev

### Prerequisites

- Windows 10/11 (64-bit)
- Node.js (v16 or higher)
- npm or yarn
- [FFmpeg](https://github.com/BtbN/FFmpeg-Builds/releases) (installation needed)
- Git (optional)

### Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/TokyoTF/horny-downloader.git
   cd horny-downloader
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn
   ```

3. Start the application:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

## ⚠️ Windows Only

This application is currently only supported on Windows operating systems. Support for other platforms may be added in the future.

## 🤖 Telegram Bot

You can enable the Telegram bot in Settings to receive notifications and control downloads remotely.

### Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) on Telegram and get token
2. Enable Telegram Bot in Settings and enter your Bot Token

### Commands

- `/start` - Show bot menu
- `/status` - Show download status
- `/dl` - Download direct
- `/queue` - Show queue information
- `/add <url>` - Add a URL to download
- `/settings` - Show current settings
- `/logs` - Show recent logs
- `/stop` - Stop the bot

## 🚀 Building for Production

To build for Windows:

```bash
npm run build:win
```

## 🔧 Technologies Used

[![Electron][Electron]][Electron-url] [![Svelte][Svelte]][Svelte-url] [![Vite][Vite]][Vite-url]

> Based on [Electron Vite](https://electron-vite.org/) template

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This software is intended for personal use only. The developers are not responsible for any misuse of this application. Please respect the terms of service of the websites you download from and ensure you have the right to download and use the content.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Contact

For any inquiries or support, please open an issue on the GitHub repository.

[Electron]: https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white
[Electron-url]: https://electronjs.org/
[Svelte]: https://img.shields.io/badge/Svelte-4A4A55?style=for-the-badge&logo=svelte&logoColor=FF3E00
[Svelte-url]: https://svelte.dev/
[Vite]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
