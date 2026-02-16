import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const updater = {
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
    removeUpdateAvailableListener: (callback) => ipcRenderer.removeListener('update-available', callback),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
    removeUpdateDownloadedListener: (callback) => ipcRenderer.removeListener('update-downloaded', callback),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    restartAndUpdate: () => ipcRenderer.invoke('restart-and-update')
};
const api = {
  updater: {
    ...updater
  }
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error('Failed to expose APIs:', error);
  }
} else {
  window.electron = electronAPI;
  window.api = api;
}
