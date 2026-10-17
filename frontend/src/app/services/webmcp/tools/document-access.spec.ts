import { Injector } from '@angular/core';
import { YDocAccessService } from '@services/cloud-sync/ydoc-access.service';
import { SetupService } from '@services/core/setup.service';
import { DocumentService } from '@services/project/document.service';
import { LiveDocumentRegistryService } from '@services/project/live-document-registry.service';
import {
  applyXmlToFragment,
  xmlFragmentToXmlString,
} from '@utils/yjs-xml-serializer';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { DocumentAccess } from './document-access';

const DOC_ID = 'alice:novel:ch1';

function docWith(xml: string): Y.Doc {
  const doc = new Y.Doc();
  if (xml) applyXmlToFragment(doc, doc.getXmlFragment('prosemirror'), xml);
  return doc;
}

const xmlOf = (doc: Y.Doc): string =>
  xmlFragmentToXmlString(doc.getXmlFragment('prosemirror'));

describe('DocumentAccess', () => {
  let live: Map<string, Y.Doc>;
  let localEdits: string[];
  let mode: 'local' | 'server' | 'cloud';
  let headless: Y.Doc;
  let exists: boolean;
  let acquiredLive: boolean;
  let flush: ReturnType<typeof vi.fn>;
  let release: ReturnType<typeof vi.fn>;
  let syncDocumentToServer: ReturnType<typeof vi.fn>;
  let access: DocumentAccess;

  beforeEach(() => {
    live = new Map();
    localEdits = [];
    mode = 'local';
    headless = docWith('<paragraph>Stored</paragraph>');
    exists = true;
    acquiredLive = false;
    flush = vi.fn().mockResolvedValue(undefined);
    release = vi.fn().mockResolvedValue(undefined);
    syncDocumentToServer = vi.fn().mockResolvedValue('digest');
    const localEdit$ = new Subject<string>();
    localEdit$.subscribe(id => localEdits.push(id));

    const injector = Injector.create({
      providers: [
        {
          provide: LiveDocumentRegistryService,
          useValue: {
            getConnectedYDoc: (id: string) => live.get(id) ?? null,
            localEdit$,
          },
        },
        { provide: SetupService, useValue: { getMode: () => mode } },
        { provide: DocumentService, useValue: { syncDocumentToServer } },
        {
          provide: YDocAccessService,
          useValue: {
            documentExists: () => Promise.resolve(exists),
            acquireDocument: () =>
              Promise.resolve({
                doc: headless,
                live: acquiredLive,
                flush,
                release,
              }),
          },
        },
      ],
    });
    access = new DocumentAccess(injector);
  });

  describe('with an open editor', () => {
    it('reads and writes the live doc without syncing', async () => {
      const doc = docWith('<paragraph>On screen</paragraph>');
      live.set(DOC_ID, doc);

      expect(await access.readXml(DOC_ID)).toBe(
        '<paragraph>On screen</paragraph>'
      );
      await access.writeXml(DOC_ID, '<paragraph>Edited</paragraph>');

      expect(xmlOf(doc)).toBe('<paragraph>Edited</paragraph>');
      expect(syncDocumentToServer).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    });
  });

  describe('without an editor', () => {
    it('reads the stored copy', async () => {
      expect(await access.readXml(DOC_ID)).toBe(
        '<paragraph>Stored</paragraph>'
      );
      expect(release).toHaveBeenCalled();
      expect(syncDocumentToServer).not.toHaveBeenCalled();
    });

    it('reads an unknown document as empty without creating it', async () => {
      exists = false;
      expect(await access.readXml(DOC_ID)).toBe('');
      expect(release).not.toHaveBeenCalled();
    });

    it('asks for an imported document to be opened once', async () => {
      headless = new Y.Doc();
      headless
        .getMap('importedContent')
        .set('content', [{ type: 'paragraph' }]);
      await expect(access.readXml(DOC_ID)).rejects.toThrow('open_element');
    });

    it('writes, flushes and reports a local edit', async () => {
      headless.getMap('importedContent').set('content', [{ type: 'x' }]);

      await access.writeXml(DOC_ID, '<paragraph>New</paragraph>');

      expect(xmlOf(headless)).toBe('<paragraph>New</paragraph>');
      expect(headless.getMap('importedContent').get('content')).toBeUndefined();
      expect(flush).toHaveBeenCalled();
      expect(release).toHaveBeenCalled();
      expect(localEdits).toEqual([DOC_ID]);
    });

    it('leaves reporting to an editor that opened meanwhile', async () => {
      acquiredLive = true;
      await access.writeXml(DOC_ID, '<paragraph>New</paragraph>');
      expect(localEdits).toEqual([]);
    });
  });

  describe('on a server profile', () => {
    beforeEach(() => {
      mode = 'server';
    });

    it('pulls before reading', async () => {
      await access.readXml(DOC_ID);
      expect(syncDocumentToServer).toHaveBeenCalledWith(DOC_ID, 20000);
    });

    it('pulls before and pushes after writing', async () => {
      await access.writeXml(DOC_ID, '<paragraph>New</paragraph>');
      expect(syncDocumentToServer).toHaveBeenCalledTimes(2);
    });

    it('falls back to the local copy when the server is unreachable', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      syncDocumentToServer.mockRejectedValue(new Error('offline'));

      expect(await access.readXml(DOC_ID)).toBe(
        '<paragraph>Stored</paragraph>'
      );
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
