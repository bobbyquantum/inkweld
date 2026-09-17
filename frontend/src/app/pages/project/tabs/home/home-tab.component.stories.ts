import { signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { type Element, ElementType, type Project } from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import { ElementNavigationService } from '@services/project/element-navigation.service';
import { ProjectService } from '@services/project/project.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RecentFilesService } from '@services/project/recent-files.service';
import { type Meta, moduleMetadata, type StoryObj } from '@storybook/angular';

import { HomeTabComponent } from './home-tab.component';

/* ────────────────────────────────────────────────────────────────────────────
 * Fixtures
 *
 * The home tab reads everything it renders from ProjectStateService and
 * RecentFilesService, so the stories stub just those two (plus the handful of
 * services ProjectCoverComponent pulls in) rather than booting the whole
 * project shell. No backend, no IndexedDB, no Yjs.
 * ──────────────────────────────────────────────────────────────────────────── */

const SHORT_TITLE = 'The Weaving';
const LONG_TITLE =
  'The Cartographer of Unremembered Coastlines and Other Improbable Voyages';
const SHORT_DESCRIPTION =
  'A shipwright inherits a map of a sea that has not been discovered yet.';
const LONG_DESCRIPTION =
  'A shipwright inherits a map of a sea that has not been discovered yet, and ' +
  'spends thirty years building the vessel it implies. Notes, drafts, timelines ' +
  'and the small cruelties of the harbour town that watches her work — every ' +
  'thread of it lives in this project, and most of it contradicts the rest.';

/** A cover image that needs no network: a flat gradient with the title on it. */
const COVER_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="640">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2b3a55"/>
          <stop offset="1" stop-color="#7d5a50"/>
        </linearGradient>
      </defs>
      <rect width="400" height="640" fill="url(#g)"/>
      <circle cx="200" cy="250" r="90" fill="none" stroke="#f0e3d0" stroke-width="3"/>
      <text x="200" y="520" fill="#f0e3d0" font-family="Georgia,serif"
            font-size="34" text-anchor="middle">Cover</text>
    </svg>`
  );

const makeProject = (title: string, description: string): Project =>
  ({
    id: 'story-project',
    username: 'inkweld',
    slug: 'the-weaving',
    title,
    description,
  }) as Project;

const makeElement = (id: string, name: string): Element =>
  ({ id, name, type: ElementType.Item }) as Element;

const PINNED_ELEMENTS = [
  makeElement('e1', 'Outline'),
  makeElement('e2', 'Chapter 1 — The Harbour'),
  makeElement('e3', 'Cast of characters'),
  makeElement('e4', 'Timeline of the crossing'),
];

const RECENT_FILES = [
  { id: 'e2', name: 'Chapter 1 — The Harbour', type: ElementType.Item },
  { id: 'e5', name: 'Chapter 2 — Low Water', type: ElementType.Item },
  { id: 'e6', name: 'harbour-sketch.png', type: 'IMAGE' },
  { id: 'e3', name: 'Cast of characters', type: ElementType.Item },
  { id: 'e7', name: 'Research — tide tables', type: ElementType.Item },
];

interface StubOptions {
  title?: string;
  description?: string;
  hasCover?: boolean;
  pinned?: Element[];
  recent?: typeof RECENT_FILES;
  canWrite?: boolean;
}

const noop = () => undefined;

function stubProviders(options: StubOptions = {}) {
  const {
    title = SHORT_TITLE,
    description = SHORT_DESCRIPTION,
    hasCover = true,
    pinned = PINNED_ELEMENTS,
    recent = RECENT_FILES,
    canWrite = true,
  } = options;

  const project = makeProject(title, description);
  const elements = [...pinned];

  const projectState = {
    project: signal(project),
    elements: signal(elements),
    coverMediaId: signal(hasCover ? 'story-cover' : undefined),
    pinnedElementIds: signal(pinned.map(element => element.id)),
    canWrite: signal(canWrite),
    showEditProjectDialog: noop,
  };

  const localStorage = {
    getMediaUrl: () => Promise.resolve(hasCover ? COVER_DATA_URL : null),
    getProjectCoverUrl: () => Promise.resolve(null),
    saveMedia: () => Promise.resolve(),
  };

  return [
    { provide: ProjectStateService, useValue: projectState },
    {
      provide: RecentFilesService,
      useValue: { getRecentFilesForProject: () => recent },
    },
    { provide: ElementNavigationService, useValue: { openElement: noop } },
    { provide: LocalStorageService, useValue: localStorage },
    {
      provide: SetupService,
      useValue: { getMode: () => 'local', getServerUrl: () => '' },
    },
    { provide: MediaSyncService, useValue: { mediaSyncVersion: signal(0) } },
    // Injected by the component but only reached from the cover-generation
    // path, which nothing in this tab triggers.
    { provide: ProjectService, useValue: {} },
    { provide: DialogGatewayService, useValue: {} },
    { provide: MatSnackBar, useValue: { open: noop } },
  ];
}

/**
 * The tab renders against the project shell's height variables. Stories aren't
 * inside that shell, so the wrapper supplies them — `-50` is the desktop offset
 * the component reads, and the mobile toolbar's 48px is stood in for by the
 * padding so the phone stories show the real amount of usable space.
 */
const shell = (mobile: boolean) => `
  <div style="--app-height: 100dvh;
              --app-height-offset-50: calc(100dvh - ${mobile ? 48 : 50}px);
              height: 100dvh;
              ${mobile ? 'padding-top: 48px; box-sizing: border-box;' : ''}
              overflow: hidden;">
    <app-home-tab></app-home-tab>
  </div>
`;

const meta: Meta<HomeTabComponent> = {
  title: 'Project/Home Tab',
  component: HomeTabComponent,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<HomeTabComponent>;

/** Desktop, the common case: a cover, a handful of pins, a handful of recents. */
export const Desktop: Story = {
  decorators: [moduleMetadata({ providers: stubProviders() })],
  render: () => ({ template: shell(false) }),
};

/** Desktop with a title long enough to wrap, and a description that overruns. */
export const DesktopLongTitle: Story = {
  name: 'Desktop / Long title',
  decorators: [
    moduleMetadata({
      providers: stubProviders({
        title: LONG_TITLE,
        description: LONG_DESCRIPTION,
      }),
    }),
  ],
  render: () => ({ template: shell(false) }),
};

/** No custom cover: the default cover carries the author and title instead. */
export const DesktopNoCover: Story = {
  name: 'Desktop / No cover',
  decorators: [
    moduleMetadata({ providers: stubProviders({ hasCover: false }) }),
  ],
  render: () => ({ template: shell(false) }),
};

/** No custom cover at phone size, where the drawn title has least room. */
export const MobileNoCover: Story = {
  name: 'Mobile / No cover',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  decorators: [
    moduleMetadata({ providers: stubProviders({ hasCover: false }) }),
  ],
  render: () => ({ template: shell(true) }),
};

/** Phone-sized: the header has to leave room for both lists. */
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  decorators: [moduleMetadata({ providers: stubProviders() })],
  render: () => ({ template: shell(true) }),
};

export const MobileLongTitle: Story = {
  name: 'Mobile / Long title',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  decorators: [
    moduleMetadata({
      providers: stubProviders({
        title: LONG_TITLE,
        description: LONG_DESCRIPTION,
      }),
    }),
  ],
  render: () => ({ template: shell(true) }),
};

/** Small phone with no cover, nothing pinned and nothing opened yet. */
export const MobileEmpty: Story = {
  name: 'Mobile / Empty',
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  decorators: [
    moduleMetadata({
      providers: stubProviders({
        hasCover: false,
        pinned: [],
        recent: [],
      }),
    }),
  ],
  render: () => ({ template: shell(true) }),
};

/** Read-only member: no edit affordance on the header. */
export const DesktopReadOnly: Story = {
  name: 'Desktop / Read-only',
  decorators: [
    moduleMetadata({ providers: stubProviders({ canWrite: false }) }),
  ],
  render: () => ({ template: shell(false) }),
};
