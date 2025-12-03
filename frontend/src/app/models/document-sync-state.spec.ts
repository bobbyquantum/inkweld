import { DocumentSyncState } from './document-sync-state';

describe('DocumentSyncState enum', () => {
  it('should have Unavailable state', () => {
    expect(DocumentSyncState.Unavailable).toBe('unavailable');
  });

  it('should have Offline state', () => {
    expect(DocumentSyncState.Offline).toBe('offline');
  });

  it('should have Syncing state', () => {
    expect(DocumentSyncState.Syncing).toBe('syncing');
  });

  it('should have Synced state', () => {
    expect(DocumentSyncState.Synced).toBe('synced');
  });

  it('should be usable in switch statements', () => {
    const getStateDescription = (state: DocumentSyncState): string => {
      switch (state) {
        case DocumentSyncState.Unavailable:
          return 'Document not found in IndexedDB';
        case DocumentSyncState.Offline:
          return 'Document exists locally but not synced';
        case DocumentSyncState.Syncing:
          return 'Currently establishing connection';
        case DocumentSyncState.Synced:
          return 'Connected and synced with server';
        default:
          return 'Unknown state';
      }
    };

    expect(getStateDescription(DocumentSyncState.Unavailable)).toBe(
      'Document not found in IndexedDB'
    );
    expect(getStateDescription(DocumentSyncState.Offline)).toBe(
      'Document exists locally but not synced'
    );
    expect(getStateDescription(DocumentSyncState.Syncing)).toBe(
      'Currently establishing connection'
    );
    expect(getStateDescription(DocumentSyncState.Synced)).toBe(
      'Connected and synced with server'
    );
  });
});
