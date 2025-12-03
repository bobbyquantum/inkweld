import {
  PublishFormat,
  PublishPlanItemType,
  SeparatorStyle,
  FrontmatterType,
  BackmatterType,
  ChapterNumbering,
  PublishPhase,
  DEFAULT_PUBLISH_OPTIONS,
  DEFAULT_PUBLISH_METADATA,
  createDefaultPublishPlan,
  createQuickExportPlan,
} from './publish-plan';

describe('publish-plan models', () => {
  describe('PublishFormat enum', () => {
    it('should have EPUB format', () => {
      expect(PublishFormat.EPUB).toBe('EPUB');
    });

    it('should have PDF_SIMPLE format', () => {
      expect(PublishFormat.PDF_SIMPLE).toBe('PDF_SIMPLE');
    });

    it('should have MARKDOWN format', () => {
      expect(PublishFormat.MARKDOWN).toBe('MARKDOWN');
    });

    it('should have HTML format', () => {
      expect(PublishFormat.HTML).toBe('HTML');
    });
  });

  describe('PublishPlanItemType enum', () => {
    it('should have all item types', () => {
      expect(PublishPlanItemType.Element).toBe('element');
      expect(PublishPlanItemType.Separator).toBe('separator');
      expect(PublishPlanItemType.TableOfContents).toBe('toc');
      expect(PublishPlanItemType.Frontmatter).toBe('frontmatter');
      expect(PublishPlanItemType.Backmatter).toBe('backmatter');
      expect(PublishPlanItemType.Worldbuilding).toBe('worldbuilding');
    });
  });

  describe('SeparatorStyle enum', () => {
    it('should have all separator styles', () => {
      expect(SeparatorStyle.PageBreak).toBe('page-break');
      expect(SeparatorStyle.SceneBreak).toBe('scene-break');
      expect(SeparatorStyle.ChapterBreak).toBe('chapter-break');
    });
  });

  describe('FrontmatterType enum', () => {
    it('should have all frontmatter types', () => {
      expect(FrontmatterType.TitlePage).toBe('title-page');
      expect(FrontmatterType.Copyright).toBe('copyright');
      expect(FrontmatterType.Dedication).toBe('dedication');
      expect(FrontmatterType.Epigraph).toBe('epigraph');
      expect(FrontmatterType.Custom).toBe('custom');
    });
  });

  describe('BackmatterType enum', () => {
    it('should have all backmatter types', () => {
      expect(BackmatterType.Glossary).toBe('glossary');
      expect(BackmatterType.Index).toBe('index');
      expect(BackmatterType.AboutAuthor).toBe('about-author');
      expect(BackmatterType.Acknowledgments).toBe('acknowledgments');
      expect(BackmatterType.Custom).toBe('custom');
    });
  });

  describe('ChapterNumbering enum', () => {
    it('should have all numbering styles', () => {
      expect(ChapterNumbering.None).toBe('none');
      expect(ChapterNumbering.Numeric).toBe('numeric');
      expect(ChapterNumbering.Roman).toBe('roman');
      expect(ChapterNumbering.Written).toBe('written');
    });
  });

  describe('PublishPhase enum', () => {
    it('should have all publish phases', () => {
      expect(PublishPhase.Initializing).toBe('initializing');
      expect(PublishPhase.SyncingDocuments).toBe('syncing-documents');
      expect(PublishPhase.SyncingAssets).toBe('syncing-assets');
      expect(PublishPhase.ConvertingContent).toBe('converting-content');
      expect(PublishPhase.Packaging).toBe('packaging');
      expect(PublishPhase.Finalizing).toBe('finalizing');
      expect(PublishPhase.Complete).toBe('complete');
      expect(PublishPhase.Error).toBe('error');
    });
  });

  describe('DEFAULT_PUBLISH_OPTIONS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_PUBLISH_OPTIONS.chapterNumbering).toBe(
        ChapterNumbering.None
      );
      expect(DEFAULT_PUBLISH_OPTIONS.sceneBreakText).toBe('* * *');
      expect(DEFAULT_PUBLISH_OPTIONS.includeWordCounts).toBe(false);
      expect(DEFAULT_PUBLISH_OPTIONS.includeToc).toBe(true);
      expect(DEFAULT_PUBLISH_OPTIONS.includeCover).toBe(true);
      expect(DEFAULT_PUBLISH_OPTIONS.fontFamily).toBe('Georgia, serif');
      expect(DEFAULT_PUBLISH_OPTIONS.fontSize).toBe(12);
      expect(DEFAULT_PUBLISH_OPTIONS.lineHeight).toBe(1.5);
    });
  });

  describe('DEFAULT_PUBLISH_METADATA', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_PUBLISH_METADATA.title).toBe('');
      expect(DEFAULT_PUBLISH_METADATA.author).toBe('');
      expect(DEFAULT_PUBLISH_METADATA.language).toBe('en');
    });
  });

  describe('createDefaultPublishPlan', () => {
    it('should create a plan with the provided title and author', () => {
      const plan = createDefaultPublishPlan('My Novel', 'John Doe');

      expect(plan.metadata.title).toBe('My Novel');
      expect(plan.metadata.author).toBe('John Doe');
    });

    it('should have EPUB as default format', () => {
      const plan = createDefaultPublishPlan('Title', 'Author');

      expect(plan.format).toBe(PublishFormat.EPUB);
    });

    it('should have "Default Export" as name', () => {
      const plan = createDefaultPublishPlan('Title', 'Author');

      expect(plan.name).toBe('Default Export');
    });

    it('should have an empty items array', () => {
      const plan = createDefaultPublishPlan('Title', 'Author');

      expect(plan.items).toEqual([]);
    });

    it('should include default options', () => {
      const plan = createDefaultPublishPlan('Title', 'Author');

      expect(plan.options.includeToc).toBe(true);
      expect(plan.options.includeCover).toBe(true);
    });

    it('should generate a unique id', () => {
      const plan1 = createDefaultPublishPlan('Title', 'Author');
      const plan2 = createDefaultPublishPlan('Title', 'Author');

      expect(plan1.id).not.toBe(plan2.id);
    });

    it('should set createdAt and updatedAt timestamps', () => {
      const plan = createDefaultPublishPlan('Title', 'Author');

      expect(plan.createdAt).toBeDefined();
      expect(plan.updatedAt).toBeDefined();
      expect(new Date(plan.createdAt).getTime()).not.toBeNaN();
      expect(new Date(plan.updatedAt).getTime()).not.toBeNaN();
    });
  });

  describe('createQuickExportPlan', () => {
    it('should create a plan named "Quick Export"', () => {
      const plan = createQuickExportPlan('My Novel', 'John Doe', []);

      expect(plan.name).toBe('Quick Export');
    });

    it('should include a title page as first item', () => {
      const plan = createQuickExportPlan('Title', 'Author', []);

      expect(plan.items.length).toBeGreaterThanOrEqual(2);
      expect(plan.items[0].type).toBe(PublishPlanItemType.Frontmatter);
    });

    it('should include a table of contents', () => {
      const plan = createQuickExportPlan('Title', 'Author', []);

      const tocItem = plan.items.find(
        (item) => item.type === PublishPlanItemType.TableOfContents
      );
      expect(tocItem).toBeDefined();
    });

    it('should include all provided element IDs as chapters', () => {
      const elementIds = ['doc-1', 'doc-2', 'doc-3'];
      const plan = createQuickExportPlan('Title', 'Author', elementIds);

      const elementItems = plan.items.filter(
        (item) => item.type === PublishPlanItemType.Element
      );
      expect(elementItems.length).toBe(3);
    });

    it('should mark elements as chapters', () => {
      const plan = createQuickExportPlan('Title', 'Author', ['doc-1']);

      const elementItem = plan.items.find(
        (item) => item.type === PublishPlanItemType.Element
      );
      expect((elementItem as any).isChapter).toBe(true);
    });

    it('should not include children for elements', () => {
      const plan = createQuickExportPlan('Title', 'Author', ['doc-1']);

      const elementItem = plan.items.find(
        (item) => item.type === PublishPlanItemType.Element
      );
      expect((elementItem as any).includeChildren).toBe(false);
    });
  });
});
