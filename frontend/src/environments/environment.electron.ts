export const environment = {
  production: true,
  version: '0.1.0',
  apiUrl: 'http://localhost:8333',
  wssUrl: 'ws://localhost:8333',
  electron: true,
  /**
   * Cloud Sync provider app keys. These are public OAuth client identifiers
   * (they ship in the browser bundle). An empty key hides that provider from
   * the Cloud Sync setup option. Self-hosters register their own apps and set
   * their keys here or at runtime in the connection settings.
   */
  cloudSync: {
    dropbox: { appKey: '' },
  },
};
