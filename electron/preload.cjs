const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  pickVideo: () => ipcRenderer.invoke('pick-video'),
  pickMedia: () => ipcRenderer.invoke('pick-media'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: (opts) => ipcRenderer.invoke('pick-files', opts || null),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  printDoc: (opts) => ipcRenderer.invoke('print-doc', opts),
  notify: (n) => ipcRenderer.invoke('notify', n),
  displays: () => ipcRenderer.invoke('displays'),
  presentOpen: (opts) => ipcRenderer.invoke('present-open', opts),
  presentClose: () => ipcRenderer.invoke('present-close'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  // Menu bar panel
  setMenuBar: (on) => ipcRenderer.invoke('set-menu-bar', on),
  openRoute: (route) => ipcRenderer.invoke('open-route', route),
  trayHide: () => ipcRenderer.invoke('tray-hide'),
  openWeb: (url, title) => ipcRenderer.invoke('open-web', { url, title }),
  onTrayShown: (cb) => { const f = () => cb(); ipcRenderer.on('tray-shown', f); return () => ipcRenderer.removeListener('tray-shown', f); },
  onGo: (cb) => { const f = (_e, route) => cb(route); ipcRenderer.on('go', f); return () => ipcRenderer.removeListener('go', f); },
});
