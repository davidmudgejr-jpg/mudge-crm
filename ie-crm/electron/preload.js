const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('iecrm', {
  // Database
  db: {
    query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
    status: () => ipcRenderer.invoke('db:status'),
    schema: () => ipcRenderer.invoke('db:schema'),
  },

  // Claude AI
  claude: {
    chat: (messages, systemPrompt, options) => ipcRenderer.invoke('claude:chat', messages, systemPrompt, options),
    status: () => ipcRenderer.invoke('claude:status'),
  },

  // File parsing
  file: {
    parse: (arrayBuffer, fileName) => ipcRenderer.invoke('file:parse', arrayBuffer, fileName),
  },

  // Airtable
  airtable: {
    fetch: (tableName, offset) => ipcRenderer.invoke('airtable:fetch', tableName, offset),
    test: (tableName) => ipcRenderer.invoke('airtable:test', tableName),
    status: () => ipcRenderer.invoke('airtable:status'),
  },

  // Settings
  settings: {
    getEnv: (key) => ipcRenderer.invoke('settings:getEnv', key),
  },

  // Theme
  theme: {
    onChange: (callback) => {
      ipcRenderer.on('theme:changed', (_event, mode) => callback(mode));
    },
  },
});
