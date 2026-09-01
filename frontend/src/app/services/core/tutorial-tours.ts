import { type TutorialTour, type TutorialTourId } from '@models/tutorial';

/**
 * Definitions for the guided tours.
 *
 * Anchors reference existing `data-testid` attributes so tours track the same
 * selectors the e2e suite relies on. Steps for mode- or layout-dependent UI
 * (server-only buttons, collapsed sidebar) are marked optional so the tour
 * adapts to whatever is actually on screen.
 */
export const TUTORIAL_TOURS: Record<TutorialTourId, TutorialTour> = {
  home: {
    id: 'home',
    steps: [
      {
        id: 'welcome',
        titleKey: 'tutorial.home.welcomeTitle',
        bodyKey: 'tutorial.home.welcomeBody',
      },
      {
        id: 'create',
        anchorTestIds: ['create-new-project-button'],
        titleKey: 'tutorial.home.createTitle',
        bodyKey: 'tutorial.home.createBody',
      },
      {
        id: 'projects-empty',
        anchorTestIds: ['empty-state'],
        titleKey: 'tutorial.home.projectsTitle',
        bodyKey: 'tutorial.home.projectsEmptyBody',
        optional: true,
      },
      {
        id: 'projects-grid',
        anchorTestIds: ['covers-grid'],
        titleKey: 'tutorial.home.projectsTitle',
        bodyKey: 'tutorial.home.projectsGridBody',
        optional: true,
      },
      {
        id: 'sync',
        anchorTestIds: ['sync-all-btn'],
        titleKey: 'tutorial.home.syncTitle',
        bodyKey: 'tutorial.home.syncBody',
        optional: true,
      },
      {
        id: 'user-menu',
        anchorTestIds: ['user-menu-button'],
        titleKey: 'tutorial.home.userMenuTitle',
        bodyKey: 'tutorial.home.userMenuBody',
      },
    ],
  },
  project: {
    id: 'project',
    steps: [
      {
        id: 'welcome',
        titleKey: 'tutorial.project.welcomeTitle',
        bodyKey: 'tutorial.project.welcomeBody',
      },
      {
        id: 'tree',
        anchorTestIds: ['project-tree'],
        titleKey: 'tutorial.project.treeTitle',
        bodyKey: 'tutorial.project.treeBody',
        optional: true,
      },
      {
        id: 'search',
        anchorTestIds: [
          'toolbar-project-search-button',
          'collapsed-project-search-button',
        ],
        titleKey: 'tutorial.project.searchTitle',
        bodyKey: 'tutorial.project.searchBody',
        optional: true,
      },
      {
        id: 'tabs',
        anchorTestIds: ['tab-bar-container'],
        titleKey: 'tutorial.project.tabsTitle',
        bodyKey: 'tutorial.project.tabsBody',
        optional: true,
      },
      {
        id: 'media',
        anchorTestIds: ['sidebar-media-button', 'collapsed-media-button'],
        titleKey: 'tutorial.project.mediaTitle',
        bodyKey: 'tutorial.project.mediaBody',
        optional: true,
      },
      {
        id: 'publish',
        anchorTestIds: [
          'sidebar-publishing-button',
          'collapsed-publishing-button',
        ],
        titleKey: 'tutorial.project.publishTitle',
        bodyKey: 'tutorial.project.publishBody',
        optional: true,
      },
      {
        id: 'settings',
        anchorTestIds: ['sidebar-settings-button', 'collapsed-settings-button'],
        titleKey: 'tutorial.project.settingsTitle',
        bodyKey: 'tutorial.project.settingsBody',
        optional: true,
      },
      {
        id: 'shortcuts',
        titleKey: 'tutorial.project.shortcutsTitle',
        bodyKey: 'tutorial.project.shortcutsBody',
      },
    ],
  },
  canvas: {
    id: 'canvas',
    steps: [
      {
        id: 'welcome',
        titleKey: 'tutorial.canvas.welcomeTitle',
        bodyKey: 'tutorial.canvas.welcomeBody',
      },
      {
        id: 'mode',
        anchorTestIds: ['canvas-mode-toggle'],
        titleKey: 'tutorial.canvas.modeTitle',
        bodyKey: 'tutorial.canvas.modeBody',
        optional: true,
      },
      {
        id: 'layers',
        anchorTestIds: ['layers-header'],
        titleKey: 'tutorial.canvas.layersTitle',
        bodyKey: 'tutorial.canvas.layersBody',
        optional: true,
      },
      {
        id: 'pins',
        anchorTestIds: ['pin-tool', 'overflow-pin-tool'],
        titleKey: 'tutorial.canvas.pinsTitle',
        bodyKey: 'tutorial.canvas.pinsBody',
        optional: true,
      },
      {
        id: 'regions',
        anchorTestIds: ['polygon-tool', 'overflow-polygon-tool'],
        titleKey: 'tutorial.canvas.regionsTitle',
        bodyKey: 'tutorial.canvas.regionsBody',
        optional: true,
      },
      {
        id: 'links',
        titleKey: 'tutorial.canvas.linksTitle',
        bodyKey: 'tutorial.canvas.linksBody',
      },
      {
        id: 'pins-panel',
        anchorTestIds: ['pins-header'],
        titleKey: 'tutorial.canvas.pinsPanelTitle',
        bodyKey: 'tutorial.canvas.pinsPanelBody',
        optional: true,
      },
      {
        id: 'frames',
        anchorTestIds: ['frames-header'],
        titleKey: 'tutorial.canvas.framesTitle',
        bodyKey: 'tutorial.canvas.framesBody',
        optional: true,
      },
      {
        id: 'export',
        anchorTestIds: ['export-menu-button'],
        titleKey: 'tutorial.canvas.exportTitle',
        bodyKey: 'tutorial.canvas.exportBody',
        optional: true,
      },
    ],
  },
};
