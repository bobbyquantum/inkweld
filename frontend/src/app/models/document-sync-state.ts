export enum DocumentSyncState {
  Unavailable = 'unavailable', // Document not found in IndexedDB
  Local = 'local', // Document exists locally but not synced
  Syncing = 'syncing', // Currently establishing connection
  Synced = 'synced', // Connected and synced with server
}
