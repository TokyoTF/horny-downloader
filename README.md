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


## screenshots
<img width="338" height="739" alt="Capt222ura" src="https://github.com/user-attachments/assets/bb4afb77-6681-4779-bf35-662c8afd9713" />

<img width="331" height="732" alt="Catttptura" src="https://github.com/user-attachments/assets/0cf52c37-7b88-48ef-bb63-c515088713dd" />


## 💾 Data Storage

- All application data is stored locally using **SQLite** in a `data.db` file
- Thumbnails and temporary files are stored in the `temp` folder

## 📦 Extensions

This application uses a modular extension system to support different video sites. Extensions are located in the `extensions/` folder and are automatically loaded when the application starts.

### 🔧 Adding New Extensions from GitHub

You can easily add new extensions by downloading them from GitHub and placing them in the extensions folder.

#### 📦 Method 1: Download Individual Extension Files

1. **Find the extension** on GitHub that you want to add
2. **Navigate to the extension file** (usually ends with `Extension.js`)
3. **Click the "Download Raw File" button** to view the raw file content
5. **Place the file** in your `extensions/` folder
6. **Restart the application** to load the new extension



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
      name: 'NewSite',
      color: '#000000',
      domains_support: ['example.com'],
      domains_includes: ['/video/', '/watch/'],
      embed_preview: 'embed',
      prefix_url: 'example.com',
      referer: false,
      format_support: ['mp4'],
      vtt_support: false,
      quality_support: ['1080', '720', '480'],
      version:'1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    // Your extraction logic here
    return this.extension.createResponse({
      embed: 'https://example.com/embed/video123',
      video_test: 'https://example.com/video.mp4',
      list_quality: [
        { quality: '720', url: 'https://example.com/video720.mp4' }
      ],
      title: 'Video Title',
      time: '10:30',
      thumb: 'https://example.com/thumb.jpg',
      status: 200
    })
  }
}
```

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
- Beeg
- Eporner
- Sxyprn
- Bunkr

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
