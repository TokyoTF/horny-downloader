<img src="./resources/icon.png" alt="App Logo" width="70">

# Horny Downloader

A powerful desktop application for downloading videos from various adult content websites with a clean, user-friendly interface.


## ✨ Features

- 🚀 Fast and efficient video downloads
- 🎥 Supports multiple video qualities
- 📁 Organized download history
- 🔄 Concurrent downloads support
- 🎨 Modern and intuitive interface
- 💾 Save videos in different formats
- ⚡ Quick preview of videos before downloading

## 💾 Data Storage

- All application data is stored locally using **SQLite** in a `data.db` file
- Thumbnails and temporary files are stored in the `temp` folder

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
- Eporner (in development)

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
   git clone https://github.com/yourusername/horny-downloader.git
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