export enum DocumentSyncState {
  Unavailable = 'unavailable', // Document not found in IndexedDB
  Offline = 'offline', // Document exists locally but not synced
  Syncing = 'syncing', // Currently establishing connection
  Synced = 'synced', // Connected and synced with server
}
