import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const updater = {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  onUpdateAvailable: (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },
  onDownloadProgress: (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  onUpdateError: (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },
  restartAndUpdate: () => ipcRenderer.send('restart-and-update')
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
