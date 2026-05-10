import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  createDefaultPublishStyles,
  type DocNodeKey,
  type DocNodeStyles,
  type FontStyle,
  type FontWeight,
  type PageSize,
  type PageStyle,
  PUBLISH_FONT_TOKENS,
  type PublishFontToken,
  type PublishStyles,
  type TextAlign,
  type TextStyle,
  type WorldbuildingLayout,
} from '@models/publish-style';
import {
  getPublishStylePreset,
  PUBLISH_STYLE_PRESETS,
} from '@models/publish-style-presets';

interface NodeSection {
  key: DocNodeKey;
  label: string;
}

/**
 * Publish style editor.
 *
 * Edits a {@link PublishStyles} value via preset picker plus collapsible
 * sections for page layout, base text, headings, blockquote, chapter title,
 * scene break, and worldbuilding. Emits a new immutable styles object on
 * every change so parent components can persist via Yjs.
 */
@Component({
  selector: 'app-publish-style-editor',
  templateUrl: './publish-style-editor.component.html',
  styleUrls: ['./publish-style-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
})
export class PublishStyleEditorComponent {
  private readonly snackBar = inject(MatSnackBar);

  @Input({ required: true }) styles!: PublishStyles;
  @Output() readonly stylesChange = new EventEmitter<PublishStyles>();

  protected readonly presets = PUBLISH_STYLE_PRESETS;
  protected readonly fontTokens = Object.entries(PUBLISH_FONT_TOKENS).map(
    ([id, mapping]) => ({
      id: id as PublishFontToken,
      label: mapping.label,
      css: mapping.css,
    })
  );
  protected readonly weights: FontWeight[] = [
    'light',
    'normal',
    'medium',
    'semibold',
    'bold',
  ];
  protected readonly fontStyles: FontStyle[] = ['normal', 'italic'];
  protected readonly aligns: TextAlign[] = [
    'left',
    'right',
    'center',
    'justify',
  ];
  protected readonly pageSizes: { id: PageSize; label: string }[] = [
    { id: 'us-letter', label: 'US Letter (8.5 x 11 in)' },
    { id: 'us-trade', label: 'US Trade (6 x 9 in)' },
    { id: 'a4', label: 'A4' },
    { id: 'a5', label: 'A5' },
    { id: 'b5', label: 'B5' },
    { id: 'pocket', label: 'Pocket (4.25 x 6.87 in)' },
  ];
  protected readonly pageNumberFormats = [
    { id: 'none', label: 'None' },
    { id: 'numeric', label: 'Numeric (1, 2, 3)' },
    { id: 'roman', label: 'Roman (i, ii, iii)' },
  ] as const;
  protected readonly worldbuildingLayouts: {
    id: WorldbuildingLayout;
    label: string;
  }[] = [
    { id: 'card', label: 'Card' },
    { id: 'compact', label: 'Compact' },
    { id: 'detail', label: 'Detail' },
    { id: 'appendix', label: 'Appendix' },
  ];

  protected readonly nodeSections: NodeSection[] = [
    { key: 'heading1', label: 'Heading 1' },
    { key: 'heading2', label: 'Heading 2' },
    { key: 'heading3', label: 'Heading 3' },
    { key: 'blockquote', label: 'Blockquote' },
  ];

  protected readonly currentPresetLabel = (): string => {
    const id = this.styles?.preset;
    if (!id) return 'Custom';
    const p = getPublishStylePreset(id);
    return p?.label ?? 'Custom';
  };

  /**
   * Apply a preset by id, replacing the entire styles object.
   */
  selectPreset(id: string): void {
    const preset = getPublishStylePreset(id);
    if (!preset) return;
    const next = preset.build();
    next.preset = id;
    this.emit(next);
    this.snackBar.open(`Applied preset: ${preset.label}`, 'OK', {
      duration: 2000,
    });
  }

  /** Reset to the default styles. */
  resetToDefaults(): void {
    this.emit(createDefaultPublishStyles());
  }

  // ---- Page ----

  updatePage<K extends keyof PageStyle>(key: K, value: PageStyle[K]): void {
    this.emit({
      ...this.styles,
      preset: undefined,
      page: { ...this.styles.page, [key]: value },
    });
  }

  // ---- Base text ----

  updateBaseText<K extends keyof TextStyle>(key: K, value: TextStyle[K]): void {
    this.emit({
      ...this.styles,
      preset: undefined,
      baseText: { ...this.styles.baseText, [key]: value },
    });
  }

  // ---- Per-node text ----

  getNodeText(key: DocNodeKey): TextStyle {
    return this.styles.nodes[key]?.text ?? {};
  }

  updateNodeText<K extends keyof TextStyle>(
    nodeKey: DocNodeKey,
    key: K,
    value: TextStyle[K]
  ): void {
    const nodes: DocNodeStyles = { ...this.styles.nodes };
    const existing = nodes[nodeKey] ?? {};
    nodes[nodeKey] = {
      ...existing,
      text: { ...existing.text, [key]: value },
    };
    this.emit({ ...this.styles, preset: undefined, nodes });
  }

  // ---- Chapter title ----

  updateChapterText<K extends keyof TextStyle>(
    key: K,
    value: TextStyle[K]
  ): void {
    this.emit({
      ...this.styles,
      preset: undefined,
      structure: {
        ...this.styles.structure,
        chapterTitle: {
          ...this.styles.structure.chapterTitle,
          text: { ...this.styles.structure.chapterTitle.text, [key]: value },
        },
      },
    });
  }

  updateChapterPageBreak(value: boolean): void {
    this.emit({
      ...this.styles,
      preset: undefined,
      structure: {
        ...this.styles.structure,
        chapterTitle: {
          ...this.styles.structure.chapterTitle,
          pageBreakBefore: value,
        },
      },
    });
  }

  // ---- Scene break ----

  updateSceneBreakText<K extends keyof TextStyle>(
    key: K,
    value: TextStyle[K]
  ): void {
    this.emit({
      ...this.styles,
      preset: undefined,
      structure: {
        ...this.styles.structure,
        sceneBreak: {
          ...this.styles.structure.sceneBreak,
          text: { ...this.styles.structure.sceneBreak.text, [key]: value },
        },
      },
    });
  }

  // ---- Worldbuilding ----

  updateWorldbuildingLayout(value: WorldbuildingLayout): void {
    this.emit({
      ...this.styles,
      preset: undefined,
      worldbuilding: { ...this.styles.worldbuilding, defaultLayout: value },
    });
  }

  updateWorldbuildingEntryTitle<K extends keyof TextStyle>(
    key: K,
    value: TextStyle[K]
  ): void {
    this.emit({
      ...this.styles,
      preset: undefined,
      worldbuilding: {
        ...this.styles.worldbuilding,
        entryTitle: { ...this.styles.worldbuilding.entryTitle, [key]: value },
      },
    });
  }

  // ---- Helpers ----

  /** Bound callbacks for ngTemplateOutlet (preserves `this`). */
  protected readonly updateBaseTextBound = <K extends keyof TextStyle>(
    key: K,
    value: TextStyle[K]
  ): void => this.updateBaseText(key, value);

  protected readonly updateChapterTextBound = <K extends keyof TextStyle>(
    key: K,
    value: TextStyle[K]
  ): void => this.updateChapterText(key, value);

  protected readonly updateSceneBreakTextBound = <K extends keyof TextStyle>(
    key: K,
    value: TextStyle[K]
  ): void => this.updateSceneBreakText(key, value);

  protected readonly updateWorldbuildingEntryTitleBound = <
    K extends keyof TextStyle,
  >(
    key: K,
    value: TextStyle[K]
  ): void => this.updateWorldbuildingEntryTitle(key, value);

  /** Build a per-node text updater bound for a specific node key. */
  makeNodeUpdater(nodeKey: DocNodeKey) {
    return <K extends keyof TextStyle>(key: K, value: TextStyle[K]): void =>
      this.updateNodeText(nodeKey, key, value);
  }

  /** Coerce an `<input type="number">` value to a finite number or undefined. */
  parseNumber(event: Event): number | undefined {
    const raw = (event.target as HTMLInputElement).value;
    if (raw === '' || raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  /**
   * Coerce a numeric input to a finite, non-negative number. Returns
   * `undefined` for blank, invalid, or negative input so the caller can
   * fall back to the previous value rather than persisting `0` (which
   * would silently break page-margin or font-size styling).
   */
  parsePositiveNumber(event: Event): number | undefined {
    const n = this.parseNumber(event);
    if (n === undefined || n < 0) return undefined;
    return n;
  }

  /** Coerce an `<input type="text">` color value to a string or undefined. */
  parseColor(event: Event): string | undefined {
    const raw = (event.target as HTMLInputElement).value.trim();
    return raw || undefined;
  }

  private emit(next: PublishStyles): void {
    this.stylesChange.emit(next);
  }
}
