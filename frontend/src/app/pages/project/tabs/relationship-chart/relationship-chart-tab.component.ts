import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';
import { firstValueFrom } from 'rxjs';

// Register Cytoscape layout extensions
cytoscape.use(fcose);
cytoscape.use(dagre);

import {
  Element,
  ElementsService,
  ElementType,
} from '../../../../../api-client';
import { environment } from '../../../../../environments/environment';
import { RelationshipTypeDefinition } from '../../../../components/element-ref/element-ref.model';
import {
  ElementPickerDialogComponent,
  ElementPickerDialogResult,
} from '../../../../dialogs/element-picker-dialog/element-picker-dialog.component';
import {
  ChartGraphData,
  ChartLayout,
  ChartMode,
} from '../../../../models/relationship-chart.model';
import { ProjectStateService } from '../../../../services/project/project-state.service';
import { RelationshipService } from '../../../../services/relationship/relationship.service';
import { RelationshipChartService } from '../../../../services/relationship-chart/relationship-chart.service';

/** Color palette for node categories */
const CATEGORY_COLORS: Record<string, string> = {
  Character: '#5B8FF9',
  Location: '#5AD8A6',
  Document: '#E8684A',
  Faction: '#6DC8EC',
  Event: '#9270CA',
  Note: '#78D3F8',
};

const DEFAULT_NODE_COLOR = '#B0BEC5';

/** Auto-hide node labels when graph is larger than this */
const AUTO_LABEL_NODE_THRESHOLD = 50;
/** Auto-hide edge labels when graph is larger than this */
const AUTO_LABEL_EDGE_THRESHOLD = 30;
/** Delay (ms) after sidebar toggle before telling Cytoscape to resize */
const SIDEBAR_RESIZE_DELAY_MS = 250;

@Component({
  selector: 'app-relationship-chart-tab',
  templateUrl: './relationship-chart-tab.component.html',
  styleUrls: ['./relationship-chart-tab.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  providers: [
    // Each chart tab gets its own service instance so config never bleeds
    // between multiple open charts.
    RelationshipChartService,
  ],
})
export class RelationshipChartTabComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly projectState = inject(ProjectStateService);
  private readonly chartService = inject(RelationshipChartService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly elementsService = inject(ElementsService);
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  /** Reference to the chart container <div> */
  private readonly chartContainer =
    viewChild<ElementRef<HTMLDivElement>>('chartContainer');

  protected readonly elementId = signal<string>('');
  protected readonly elementName = signal<string>('Relationship Chart');

  /** Current layout mode */
  protected readonly layout = signal<ChartLayout>('force');

  /** Resolved image URLs for nodes (elementId → displayable URL) */
  protected readonly nodeImages = signal<Map<string, string>>(new Map());

  /** Blob URLs that need revoking on destroy */
  private readonly blobUrls: string[] = [];

  /** Incremented on each loadNodeImages call; stale async results are discarded */
  private imageLoadGeneration = 0;

  /** Whether the chart has any data to show */
  protected readonly hasData = computed(() => {
    const data = this.chartService.graphData();
    return data !== null && data.nodes.length > 0;
  });

  /** Whether the sidebar panel is open (persisted in localStorage) */
  protected readonly sidebarOpen = signal(
    localStorage.getItem('chartSidebarOpen') !== 'false'
  );

  /** Current chart mode */
  protected readonly mode = computed<ChartMode>(() => {
    const config = this.chartService.activeConfig();
    return config?.filters.mode ?? 'curated';
  });

  /** Currently focused element ID (drives BFS depth filter) */
  protected readonly focusElementId = signal<string | null>(null);

  /** Max BFS depth when focus mode is active */
  protected readonly maxDepth = signal<number>(3);

  /** Display name of the focused element */
  protected readonly focusElementName = computed<string>(() => {
    const id = this.focusElementId();
    if (!id) return '';
    return this.projectState.elements().find(e => e.id === id)?.name ?? id;
  });

  /** User label-visibility override; null = auto-decide from graph size */
  protected readonly showLabelsOverride = signal<boolean | null>(null);

  /** Effective show-labels value (user override or auto threshold) */
  protected readonly effectiveShowLabels = computed<boolean>(() => {
    const override = this.showLabelsOverride();
    if (override !== null) return override;
    return (
      (this.chartService.graphData()?.nodes.length ?? 0) <=
      AUTO_LABEL_NODE_THRESHOLD
    );
  });

  /** Whether orphans are currently shown */
  protected readonly showOrphans = computed<boolean>(
    () => this.chartService.activeConfig()?.filters.showOrphans ?? false
  );

  /** Worldbuilding schema IDs available in the project (for 'all' mode filter) */
  protected readonly availableSchemas = computed<string[]>(() => {
    const schemas = new Set<string>();
    for (const el of this.projectState.elements()) {
      if (el.type === ElementType.Worldbuilding && el.schemaId) {
        schemas.add(el.schemaId);
      }
    }
    return Array.from(schemas).sort();
  });

  /** Currently active schema filter IDs (empty = all schemas shown) */
  protected readonly activeSchemaIds = computed<Set<string>>(
    () => new Set(this.chartService.activeConfig()?.filters.schemaIds ?? [])
  );

  /** Elements currently included in curated mode */
  protected readonly includedElements = computed<Element[]>(() => {
    const config = this.chartService.activeConfig();
    const allElements = this.projectState.elements();
    if (!config?.filters.includedElementIds?.length) return [];
    const idSet = new Set(config.filters.includedElementIds);
    return allElements.filter(e => idSet.has(e.id));
  });

  /**
   * Relationship types that actually appear on the current chart's elements.
   * Computed from raw relationships (ignoring type filter) so that toggling
   * a type off doesn't remove it from the sidebar.
   */
  protected readonly allRelationshipTypes = computed<
    RelationshipTypeDefinition[]
  >(() => {
    const allTypes = this.relationshipService.allTypes();
    const allRelationships = this.relationshipService.relationships();
    const config = this.chartService.activeConfig();
    if (!config || allRelationships.length === 0) return [];

    // Determine the set of element IDs currently on the chart
    const elements = this.projectState.elements();
    let elementIdSet: Set<string>;
    if (config.filters.mode === 'curated') {
      elementIdSet = new Set(config.filters.includedElementIds ?? []);
    } else {
      // 'all' mode: every non-folder, non-chart element
      elementIdSet = new Set(
        elements
          .filter(
            e =>
              e.type !== ElementType.Folder &&
              e.type !== ElementType.RelationshipChart
          )
          .map(e => e.id)
      );
    }

    // Collect type IDs from relationships where both endpoints are on the chart
    const relevantTypeIds = new Set<string>();
    for (const rel of allRelationships) {
      if (
        elementIdSet.has(rel.sourceElementId) &&
        elementIdSet.has(rel.targetElementId)
      ) {
        relevantTypeIds.add(rel.relationshipTypeId);
      }
    }

    return allTypes.filter(t => relevantTypeIds.has(t.id));
  });

  /** Currently active relationship type filter IDs */
  protected readonly activeRelTypeIds = computed<Set<string>>(() => {
    const config = this.chartService.activeConfig();
    return new Set(config?.filters.relationshipTypeIds ?? []);
  });

  /** Whether a relationship type is included (empty filter = all included) */
  protected isRelTypeActive(typeId: string): boolean {
    const ids = this.activeRelTypeIds();
    return ids.size === 0 || ids.has(typeId);
  }

  /** The Cytoscape core instance */
  private cy: cytoscape.Core | null = null;

  /** Track if chart has been initialized at least once */
  private initialized = false;

  /**
   * Whether config has been successfully loaded from element metadata.
   * Used by the elements-watcher effect to know when to stop retrying.
   * On page refresh, elements load asynchronously after the component inits,
   * so the initial loadConfig may miss saved metadata. The effect below
   * retries when elements arrive.
   */
  private configLoadedFromMetadata = false;

  constructor() {
    // Re-load chart config when elements become available.
    // Handles cold-start / page-refresh where loadProject() is async and the
    // initial loadConfig() in ngOnInit fires before elements are populated.
    effect(() => {
      const elements = this.projectState.elements();
      const id = this.elementId();
      if (!id || elements.length === 0 || this.configLoadedFromMetadata) return;

      const element = elements.find(e => e.id === id);
      if (!element) return;

      // Update element name (may not have been available on first attempt)
      this.elementName.set(element.name);

      // If the element has saved chart config metadata, re-load it
      if (element.metadata?.['chartConfig']) {
        const config = this.chartService.loadConfig(id);
        this.layout.set(config.layout);
        // Sync focus state from restored config
        if (config.filters.focusElementId) {
          this.focusElementId.set(config.filters.focusElementId);
          this.maxDepth.set(config.filters.maxDepth ?? 3);
        }
        this.configLoadedFromMetadata = true;
      }
    });

    // React to graph data changes and rebuild the Cytoscape graph.
    // Reading chartContainer() ensures this effect re-runs when the DOM
    // element appears (e.g. when hasData flips from false to true).
    effect(() => {
      const graphData = this.chartService.graphData();
      const container = this.chartContainer();
      const currentLayout = this.layout();
      const images = this.nodeImages();
      const showLabels = this.effectiveShowLabels();

      if (graphData && container) {
        const id = this.elementId();
        const saved = id ? this.chartService.loadLocalState(id) : null;
        this.renderGraph(
          graphData,
          currentLayout,
          images,
          showLabels,
          saved?.nodePositions ?? {}
        );
      }
    });

    // Load element images when graph data changes
    effect(() => {
      const graphData = this.chartService.graphData();
      if (graphData) {
        void this.loadNodeImages(graphData);
      }
    });

    // Cleanup blob URLs on destroy
    this.destroyRef.onDestroy(() => {
      for (const url of this.blobUrls) {
        URL.revokeObjectURL(url);
      }
      this.blobUrls.length = 0;
    });
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tabId = params.get('tabId') || '';
        this.elementId.set(tabId);
        this.initialized = false;
        this.configLoadedFromMetadata = false;

        // Reset per-chart UI state
        this.focusElementId.set(null);
        this.maxDepth.set(3);
        this.showLabelsOverride.set(null);

        // Destroy previous Cytoscape instance
        this.destroyCytoscape();

        // Find element name
        const element = this.projectState.elements().find(e => e.id === tabId);
        if (element) {
          this.elementName.set(element.name);
        }

        // Load chart config
        const config = this.chartService.loadConfig(tabId);
        this.layout.set(config.layout);

        // Sync focus state from persisted config
        if (config.filters.focusElementId) {
          this.focusElementId.set(config.filters.focusElementId);
          this.maxDepth.set(config.filters.maxDepth ?? 3);
        }

        // Track whether we loaded from saved metadata (vs. getting defaults)
        if (element?.metadata?.['chartConfig']) {
          this.configLoadedFromMetadata = true;
        }
      });
  }

  ngOnDestroy(): void {
    // Save node positions before the Cytoscape instance is torn down
    this.saveLocalState();

    // Release active config so a future chart tab starts clean
    this.chartService.clearActiveConfig();

    // Destroy the Cytoscape instance
    this.destroyCytoscape();
  }

  /** Switch layout mode */
  protected onLayoutChange(layout: ChartLayout): void {
    this.layout.set(layout);
    this.chartService.setLayout(layout);
    // Clear saved positions — they're layout-specific and would misplace nodes
    // if, say, force-layout coords were applied to a circular layout.
    const id = this.elementId();
    if (id) this.chartService.saveLocalState(id, { nodePositions: {} });
  }

  /** Toggle orphan visibility */
  protected toggleOrphans(): void {
    const config = this.chartService.activeConfig();
    if (!config) return;
    this.chartService.setFilters({
      ...config.filters,
      showOrphans: !config.filters.showOrphans,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sidebar: Element & Relationship Type Management
  // ─────────────────────────────────────────────────────────────────────────

  /** Toggle sidebar visibility */
  protected toggleSidebar(): void {
    this.sidebarOpen.update(v => {
      const next = !v;
      localStorage.setItem('chartSidebarOpen', String(next));
      return next;
    });
    // Let Cytoscape know the container resized
    setTimeout(() => this.cy?.resize(), SIDEBAR_RESIZE_DELAY_MS);
  }

  /** Switch between curated and all mode */
  protected onModeChange(mode: ChartMode): void {
    this.chartService.setMode(mode);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Focus Mode
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set the focus element for BFS depth-limited display.
   * Clicking the same node a second time clears focus.
   */
  protected setFocusElement(elementId: string): void {
    if (this.focusElementId() === elementId) {
      this.clearFocus();
      return;
    }
    this.focusElementId.set(elementId);
    this.chartService.setFocusElement(elementId, this.maxDepth());
  }

  /** Clear focus mode and show all elements again */
  protected clearFocus(): void {
    this.focusElementId.set(null);
    this.chartService.setFocusElement(null);
  }

  /** Update the BFS traversal depth while in focus mode */
  protected onMaxDepthChange(event: Event): void {
    const depth = parseInt((event.target as HTMLInputElement).value, 10);
    this.maxDepth.set(depth);
    const focusId = this.focusElementId();
    if (focusId) {
      this.chartService.setFocusElement(focusId, depth);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Label Visibility
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Toggle label visibility between on, off, and auto (default).
   * Auto shows labels when the graph has ≤ AUTO_LABEL_NODE_THRESHOLD nodes.
   */
  protected toggleLabels(): void {
    const current = this.showLabelsOverride();
    // Cycle: auto → on → off → auto
    if (current === null) {
      this.showLabelsOverride.set(true);
    } else if (current === true) {
      this.showLabelsOverride.set(false);
    } else {
      this.showLabelsOverride.set(null);
    }
  }

  /** Human-readable label for the current label-display state */
  protected get labelsButtonLabel(): string {
    const override = this.showLabelsOverride();
    if (override === null) return 'Labels: Auto';
    return override ? 'Labels: On' : 'Labels: Off';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Schema Filters ('all' mode)
  // ─────────────────────────────────────────────────────────────────────────

  /** Convert a schema ID like 'character-v1' to 'Character' */
  protected getSchemaLabel(schemaId: string): string {
    return schemaId
      .replace(/-v\d+$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /** Whether a schema is included (empty filter = all schemas shown) */
  protected isSchemaActive(schemaId: string): boolean {
    const ids = this.activeSchemaIds();
    return ids.size === 0 || ids.has(schemaId);
  }

  /** Toggle a worldbuilding schema filter */
  protected toggleSchema(schemaId: string): void {
    const config = this.chartService.activeConfig();
    if (!config) return;
    const current = config.filters.schemaIds ?? [];
    const included = current.includes(schemaId);
    this.chartService.setFilters({
      ...config.filters,
      schemaIds: included
        ? current.filter(id => id !== schemaId)
        : [...current, schemaId],
    });
  }

  /** Clear all schema filters (show all schemas) */
  protected clearSchemaFilters(): void {
    const config = this.chartService.activeConfig();
    if (!config) return;
    this.chartService.setFilters({ ...config.filters, schemaIds: [] });
  }

  /** Open the element picker dialog to add elements */
  protected openAddElements(): void {
    const config = this.chartService.activeConfig();
    const existingIds = config?.filters.includedElementIds ?? [];

    const dialogRef = this.dialog.open(ElementPickerDialogComponent, {
      width: '480px',
      maxHeight: '80vh',
      data: {
        title: 'Add Elements to Chart',
        subtitle: 'Select elements to include in this relationship chart.',
        maxSelections: 100,
        excludeIds: existingIds,
        excludeTypes: [ElementType.Folder, ElementType.RelationshipChart],
      },
    });

    dialogRef.afterClosed().subscribe((result: ElementPickerDialogResult) => {
      if (result?.elements?.length) {
        this.chartService.addElements(result.elements.map(e => e.id));
      }
    });
  }

  /** Remove an element from the curated list */
  protected removeElement(elementId: string): void {
    this.chartService.removeElement(elementId);
  }

  /** Toggle a relationship type in the filter */
  protected toggleRelType(typeId: string): void {
    this.chartService.toggleRelationshipType(typeId);
  }

  /** Show all relationship types (clear the filter) */
  protected showAllRelTypes(): void {
    const config = this.chartService.activeConfig();
    if (!config) return;
    this.chartService.setFilters({
      ...config.filters,
      relationshipTypeIds: [],
    });
  }

  /** Get the schema icon for an element */
  protected getElementIcon(element: Element): string {
    if (element.metadata?.['icon']) return element.metadata['icon'];
    if (!element.schemaId) {
      if (element.type === ElementType.Item) return 'description';
      return 'category';
    }
    const schema = element.schemaId.replace(/-v\d+$/, '').toLowerCase();
    switch (schema) {
      case 'character':
        return 'person';
      case 'location':
        return 'place';
      case 'item':
      case 'wb-item':
        return 'inventory_2';
      case 'faction':
        return 'groups';
      case 'event':
        return 'event';
      case 'concept':
        return 'lightbulb';
      default:
        return 'category';
    }
  }

  /** Export chart as PNG */
  protected exportAsPng(): void {
    if (!this.cy) return;
    const dataUrl = this.cy.png({
      full: true,
      scale: 2,
      bg: '#fff',
    });
    const link = document.createElement('a');
    link.download = `${this.elementName()}.png`;
    link.href = dataUrl;
    link.click();
  }

  /** Export chart as high-resolution PNG (3x scale) */
  protected exportAsHighResPng(): void {
    if (!this.cy) return;
    const dataUrl = this.cy.png({
      full: true,
      scale: 3,
      bg: '#fff',
    });
    const link = document.createElement('a');
    link.download = `${this.elementName()}-highres.png`;
    link.href = dataUrl;
    link.click();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cytoscape Graph Rendering
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Render the Cytoscape graph. Destroys the old instance and creates fresh.
   */
  private renderGraph(
    data: ChartGraphData,
    layout: ChartLayout,
    images: Map<string, string>,
    showLabels: boolean,
    savedPositions: Record<string, { x: number; y: number }>
  ): void {
    const container = this.chartContainer()?.nativeElement;
    if (!container) return;

    const hasSavedPositions = Object.keys(savedPositions).length > 0;
    const showEdgeLabels =
      showLabels && data.edges.length <= AUTO_LABEL_EDGE_THRESHOLD;

    // Build Cytoscape elements
    const maxRelCount = Math.max(
      1,
      ...data.nodes.map(n => n.relationshipCount)
    );

    const cyNodes: cytoscape.ElementDefinition[] = data.nodes.map(node => {
      const savedPos = savedPositions[node.id];
      const color = CATEGORY_COLORS[node.category] || DEFAULT_NODE_COLOR;
      const imageUrl = images.get(node.id);
      const size = this.getNodeSize(node.relationshipCount, maxRelCount);

      return {
        group: 'nodes' as const,
        data: {
          id: node.id,
          label: node.name,
          category: node.category,
          color,
          ...(imageUrl ? { imageUrl } : {}),
          size,
          relationshipCount: node.relationshipCount,
          type: node.type,
        },
        position: savedPos ? { x: savedPos.x, y: savedPos.y } : undefined,
      };
    });

    const cyEdges: cytoscape.ElementDefinition[] = data.edges.map(edge => ({
      group: 'edges' as const,
      data: {
        id: `${edge.source}-${edge.target}-${edge.relationshipId}`,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        color: edge.color || '#999',
        note: edge.note || '',
      },
    }));

    // Stylesheet
    const style: cytoscape.StylesheetStyle[] = [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          width: 'data(size)',
          height: 'data(size)',
          label: showLabels ? 'data(label)' : '',
          'font-size': '11px',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 6,
          color: '#333',
          'text-outline-color': '#fff',
          'text-outline-width': 2,
          'text-max-width': '100px',
          'text-wrap': 'ellipsis',
          'border-width': 0,
          'overlay-padding': '4px',
        },
      },
      {
        selector: 'node[imageUrl]',
        style: {
          'background-image': 'data(imageUrl)',
          'background-fit': 'cover',
          'background-clip': 'node',
          'border-width': 2,
          'border-color': 'data(color)',
        },
      },
      {
        selector: 'edge',
        style: {
          width: 1.5,
          'line-color': 'data(color)',
          'target-arrow-color': 'data(color)',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.8,
          label: showEdgeLabels ? 'data(label)' : '',
          'font-size': '10px',
          'text-rotation': 'autorotate',
          color: '#666',
          'text-outline-color': '#fff',
          'text-outline-width': 2,
          opacity: 0.7,
        },
      },
      {
        selector: 'node:active, node:selected',
        style: {
          'border-width': 3,
          'border-color': '#333',
          'overlay-opacity': 0.1,
        },
      },
      {
        selector: '.dimmed',
        style: {
          opacity: 0.15,
        },
      },
      {
        selector: '.highlighted',
        style: {
          opacity: 1,
          'z-index': 10,
        },
      },
    ];

    // Destroy old instance and create fresh
    this.destroyCytoscape();

    try {
      this.cy = cytoscape({
        container,
        elements: [...cyNodes, ...cyEdges],
        style,
        layout: { name: 'preset' },
        minZoom: 0.1,
        maxZoom: 5,
      });
    } catch (e) {
      // Cytoscape requires a real canvas renderer; degrade gracefully in
      // environments where canvas is unavailable (e.g. jsdom/unit tests).
      console.warn('Cytoscape initialization failed:', e);
      return;
    }

    // Run layout (unless restoring saved positions)
    if (hasSavedPositions) {
      this.cy.fit(undefined, 40);
    } else {
      const layoutOpts = this.getLayoutOptions(layout, data.nodes.length);
      this.cy.layout(layoutOpts).run();
    }

    // ── Interactivity ──────────────────────────────────────────────────

    // Click node → focus mode
    this.cy.on('tap', 'node', event => {
      const node = event.target as cytoscape.NodeSingular;
      this.setFocusElement(node.id());
    });

    // Hover → highlight adjacency
    this.cy.on('mouseover', 'node', event => {
      const node = event.target as cytoscape.NodeSingular;
      const neighbourhood = node.closedNeighborhood();
      this.cy?.elements().addClass('dimmed');
      neighbourhood.removeClass('dimmed').addClass('highlighted');
    });

    this.cy.on('mouseout', 'node', () => {
      this.cy?.elements().removeClass('dimmed').removeClass('highlighted');
    });

    // Drag end → save positions
    this.cy.on('dragfree', 'node', () => {
      this.saveLocalState();
    });

    this.initialized = true;
  }

  /**
   * Get layout options for the requested layout algorithm.
   */
  private getLayoutOptions(
    layout: ChartLayout,
    nodeCount: number
  ): cytoscape.LayoutOptions {
    switch (layout) {
      case 'force':
        return {
          name: 'fcose',
          animate: true,
          animationDuration: 500,
          nodeSeparation: 80,
          idealEdgeLength: Math.max(80, 200 - nodeCount * 2),
          nodeRepulsion: () => Math.max(4500, nodeCount * 200),
          gravity: 0.25,
          gravityRange: 1.5,
          quality: 'default',
          randomize: true,
        } as cytoscape.LayoutOptions;

      case 'hierarchical':
        return {
          name: 'dagre',
          rankDir: 'TB',
          spacingFactor: 1.5,
          animate: true,
          animationDuration: 500,
          nodeSep: 50,
          rankSep: 80,
        } as cytoscape.LayoutOptions;

      case 'circular':
        return {
          name: 'circle',
          animate: true,
          animationDuration: 500,
          padding: 40,
          spacingFactor: 1.2,
        } as cytoscape.LayoutOptions;

      case 'grid':
        return {
          name: 'grid',
          animate: true,
          animationDuration: 500,
          padding: 30,
          avoidOverlap: true,
          condense: true,
          spacingFactor: 1.2,
        } as cytoscape.LayoutOptions;

      case 'concentric':
        return {
          name: 'concentric',
          animate: true,
          animationDuration: 500,
          padding: 40,
          minNodeSpacing: 40,
          concentric: (node: cytoscape.NodeSingular) => node.degree(false),
          levelWidth: () => 2,
        } as cytoscape.LayoutOptions;

      default:
        return {
          name: 'fcose',
          animate: false,
        } as cytoscape.LayoutOptions;
    }
  }

  /**
   * Calculate node size based on relationship count.
   * Range: 20–60px, scaled relative to the most-connected node.
   */
  private getNodeSize(count: number, maxCount: number): number {
    const min = 20;
    const max = 60;
    const ratio = count / maxCount;
    return min + ratio * (max - min);
  }

  /** Clean up the Cytoscape instance */
  private destroyCytoscape(): void {
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Node Image Loading
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load identity images for worldbuilding nodes via the batch endpoint.
   * Uses a generation counter so a stale async result never overwrites
   * a newer one when the graph changes while images are still loading.
   */
  private async loadNodeImages(data: ChartGraphData): Promise<void> {
    const generation = ++this.imageLoadGeneration;
    const project = this.projectState.project();
    if (!project) return;

    const worldbuildingIds = data.nodes
      .filter(n => n.type === ElementType.Worldbuilding)
      .map(n => n.id);

    if (worldbuildingIds.length === 0) return;

    try {
      // Chunk requests to respect the backend 200-ID limit
      const BATCH_SIZE = 200;
      const batches: string[][] = [];
      for (let i = 0; i < worldbuildingIds.length; i += BATCH_SIZE) {
        batches.push(worldbuildingIds.slice(i, i + BATCH_SIZE));
      }
      const responses = await Promise.all(
        batches.map(ids =>
          firstValueFrom(
            this.elementsService.getElementImages(
              project.username,
              project.slug,
              { elementIds: ids }
            )
          )
        )
      );
      const images: Record<string, string | null> = {};
      for (const r of responses) {
        Object.assign(images, r.images);
      }
      const response = { images };

      // Bail if a newer graph render has already started loading its own images
      if (generation !== this.imageLoadGeneration) return;

      const resolved = new Map<string, string>();

      await Promise.all(
        Object.entries(response.images).map(async ([elementId, rawUrl]) => {
          if (!rawUrl) return;
          const displayUrl = await this.resolveImageUrl(
            rawUrl,
            project.username,
            project.slug
          );
          if (displayUrl) {
            resolved.set(elementId, displayUrl);
          }
        })
      );

      // One final staleness check after the parallel image fetches
      if (generation !== this.imageLoadGeneration) return;

      this.nodeImages.set(resolved);
    } catch (err) {
      // Image loading is best-effort; chart still works without images
      console.warn('[RelationshipChart] Failed to load node images:', err);
    }
  }

  /**
   * Resolve a raw image URL to a displayable URL.
   * Handles data: URLs (pass-through), media:// URLs (fetch blob), and HTTP URLs.
   */
  private async resolveImageUrl(
    imageUrl: string,
    username: string,
    slug: string
  ): Promise<string | null> {
    if (imageUrl.startsWith('data:')) {
      return imageUrl;
    }

    if (imageUrl.startsWith('media://')) {
      const filename = imageUrl.substring('media://'.length);
      try {
        const apiUrl = `${environment.apiUrl}/api/v1/media/${username}/${slug}/${filename}`;
        const blob = await firstValueFrom(
          this.http.get(apiUrl, { responseType: 'blob' })
        );
        const blobUrl = URL.createObjectURL(blob);
        this.blobUrls.push(blobUrl);
        return blobUrl;
      } catch {
        return null;
      }
    }

    // Regular HTTP URL
    return imageUrl;
  }

  /** Save node positions and persist to localStorage via the service */
  private saveLocalState(): void {
    const id = this.elementId();
    if (!id || !this.cy) return;
    const nodePositions = this.extractNodePositions();
    this.chartService.saveLocalState(id, { nodePositions });
  }

  /**
   * Extract pixel-space node positions from the Cytoscape instance.
   */
  private extractNodePositions(): Record<string, { x: number; y: number }> {
    if (!this.cy) return {};
    const positions: Record<string, { x: number; y: number }> = {};
    this.cy.nodes().forEach(node => {
      const pos = node.position();
      positions[node.id()] = { x: pos.x, y: pos.y };
    });
    return positions;
  }
}
