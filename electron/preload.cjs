const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  pickVideo: () => ipcRenderer.invoke('pick-video'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  printDoc: (opts) => ipcRenderer.invoke('print-doc', opts),
});
