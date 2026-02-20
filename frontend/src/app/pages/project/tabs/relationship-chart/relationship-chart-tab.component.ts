import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import type { EChartsOption, GraphSeriesOption } from 'echarts';
import { GraphChart } from 'echarts/charts';
import {
  LegendComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import { firstValueFrom, Subscription } from 'rxjs';

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

// Register ECharts components (tree-shakeable)
echarts.use([
  GraphChart,
  LegendComponent,
  TooltipComponent,
  ToolboxComponent,
  CanvasRenderer,
]);

/** Color palette for node categories */
const CATEGORY_COLORS: Record<string, string> = {
  Character: '#5B8FF9',
  Location: '#5AD8A6',
  Item: '#F6BD16',
  Document: '#E8684A',
  Faction: '#6DC8EC',
  Event: '#9270CA',
  Note: '#78D3F8',
};

const DEFAULT_NODE_COLOR = '#B0BEC5';

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
    NgxEchartsDirective,
  ],
  providers: [provideEchartsCore({ echarts })],
})
export class RelationshipChartTabComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  private readonly route = inject(ActivatedRoute);
  private readonly projectState = inject(ProjectStateService);
  private readonly chartService = inject(RelationshipChartService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly elementsService = inject(ElementsService);
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  private paramSubscription: Subscription | null = null;

  protected readonly elementId = signal<string>('');
  protected readonly elementName = signal<string>('Relationship Chart');

  /** ECharts options (reactive) */
  protected readonly chartOptions = signal<EChartsOption>({});

  /** Merge options for dynamic updates without full re-render */
  protected readonly chartMergeOptions = signal<EChartsOption>({});

  /** Current layout mode */
  protected readonly layout = signal<ChartLayout>('force');

  /** Resolved image URLs for nodes (elementId → displayable URL) */
  protected readonly nodeImages = signal<Map<string, string>>(new Map());

  /** Blob URLs that need revoking on destroy */
  private readonly blobUrls: string[] = [];

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

  /** ECharts init options */
  protected readonly initOpts = { renderer: 'canvas' as const };

  /** The ECharts instance (set via onChartInit callback) */
  private echartsInstance: echarts.ECharts | null = null;

  /** Track if chart options have been set at least once */
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
        this.configLoadedFromMetadata = true;
      }
    });

    // React to graph data changes and rebuild chart options
    effect(() => {
      const graphData = this.chartService.graphData();
      const currentLayout = this.layout();
      const images = this.nodeImages();
      if (graphData) {
        const options = this.buildChartOptions(
          graphData,
          currentLayout,
          images
        );
        if (this.initialized) {
          this.chartMergeOptions.set(options);
        } else {
          this.chartOptions.set(options);
          this.initialized = true;
        }
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
    this.paramSubscription = this.route.paramMap.subscribe(params => {
      const tabId = params.get('tabId') || '';
      this.elementId.set(tabId);
      this.initialized = false;
      this.configLoadedFromMetadata = false;

      // Find element name
      const element = this.projectState.elements().find(e => e.id === tabId);
      if (element) {
        this.elementName.set(element.name);
      }

      // Load chart config
      const config = this.chartService.loadConfig(tabId);
      this.layout.set(config.layout);

      // Track whether we loaded from saved metadata (vs. getting defaults)
      if (element?.metadata?.['chartConfig']) {
        this.configLoadedFromMetadata = true;
      }
    });
  }

  ngAfterViewInit(): void {
    // Restore saved local state (viewport/positions)
    const id = this.elementId();
    if (id) {
      const localState = this.chartService.loadLocalState(id);
      if (localState?.viewport && this.echartsInstance) {
        // Viewport will be restored after chart renders
      }
    }
  }

  ngOnDestroy(): void {
    // Save local state
    this.saveLocalState();

    // Clear active config
    this.chartService.clearActiveConfig();

    if (this.paramSubscription) {
      this.paramSubscription.unsubscribe();
      this.paramSubscription = null;
    }
  }

  /** Called by ngx-echarts when the ECharts instance is ready */
  protected onChartInit(ec: echarts.ECharts): void {
    this.echartsInstance = ec;

    // Listen for node drag end to save positions
    ec.on('mouseup', (params: Record<string, unknown>) => {
      if (
        params['componentType'] === 'series' &&
        params['seriesType'] === 'graph'
      ) {
        this.saveLocalState();
      }
    });
  }

  /** Switch layout mode */
  protected onLayoutChange(layout: ChartLayout): void {
    this.layout.set(layout);
    this.chartService.setLayout(layout);
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
    // Let ECharts know the container resized
    setTimeout(() => this.echartsInstance?.resize(), 250);
  }

  /** Switch between curated and all mode */
  protected onModeChange(mode: ChartMode): void {
    this.chartService.setMode(mode);
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
    if (!this.echartsInstance) return;
    const url = this.echartsInstance.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#fff',
    });
    const link = document.createElement('a');
    link.download = `${this.elementName()}.png`;
    link.href = url;
    link.click();
  }

  /** Export chart as SVG */
  protected exportAsSvg(): void {
    if (!this.echartsInstance) return;
    const url = this.echartsInstance.getDataURL({
      type: 'svg',
    });
    const link = document.createElement('a');
    link.download = `${this.elementName()}.svg`;
    link.href = url;
    link.click();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Chart Options Builder
  // ─────────────────────────────────────────────────────────────────────────

  private buildChartOptions(
    data: ChartGraphData,
    layout: ChartLayout,
    images: Map<string, string> = new Map()
  ): EChartsOption {
    // Collect unique categories
    const categorySet = new Set(data.nodes.map(n => n.category));
    const categories = Array.from(categorySet).sort();

    // Build ECharts category list
    const echartsCategories = categories.map(name => ({
      name,
      itemStyle: {
        color: CATEGORY_COLORS[name] || DEFAULT_NODE_COLOR,
      },
    }));

    // Build ECharts nodes
    const maxRelCount = Math.max(
      1,
      ...data.nodes.map(n => n.relationshipCount)
    );
    const nodes: GraphSeriesOption['data'] = data.nodes.map(node => {
      const imageUrl = images.get(node.id);
      return {
        id: node.id,
        name: node.name,
        category: categories.indexOf(node.category),
        symbolSize: this.getNodeSize(node.relationshipCount, maxRelCount),
        value: node.relationshipCount,
        draggable: true,
        ...(imageUrl ? { symbol: `image://${imageUrl}` } : {}),
        label: {
          show: data.nodes.length <= 50, // Auto-hide labels on large graphs
        },
        tooltip: {
          formatter: `<strong>${this.escapeHtml(node.name)}</strong><br/>Type: ${node.category}<br/>Connections: ${node.relationshipCount}`,
        },
      };
    });

    // Build ECharts edges
    const edges: GraphSeriesOption['edges'] = data.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      label: {
        show: data.edges.length <= 30,
        formatter: edge.label,
        fontSize: 10,
      },
      lineStyle: {
        color: edge.color || '#999',
        width: 1.5,
      },
      tooltip: {
        formatter: () => {
          let tip = `<strong>${this.escapeHtml(edge.label)}</strong>`;
          if (edge.note) tip += `<br/>${this.escapeHtml(edge.note)}`;
          return tip;
        },
      },
    }));

    // Layout config
    const layoutConfig = this.getLayoutConfig(layout, data.nodes.length);

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'var(--mat-sys-surface-container, #fff)',
        borderColor: 'var(--mat-sys-outline-variant, #ccc)',
        textStyle: {
          color: 'var(--mat-sys-on-surface, #333)',
        },
      },
      legend: {
        data: categories,
        orient: 'vertical',
        right: 16,
        top: 16,
        textStyle: {
          color: 'var(--mat-sys-on-surface, #333)',
        },
      },
      animationDuration: 500,
      animationEasingUpdate: 'quinticInOut',
      series: [
        {
          type: 'graph',
          ...layoutConfig,
          roam: true,
          categories: echartsCategories,
          data: nodes,
          edges,
          label: {
            position: 'bottom',
            fontSize: 11,
            color: 'var(--mat-sys-on-surface, #333)',
          },
          edgeLabel: {
            show: false,
          },
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: [0, 8],
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 3,
            },
            label: {
              show: true,
              fontSize: 13,
              fontWeight: 'bold',
            },
          },
          lineStyle: {
            opacity: 0.6,
            curveness: 0.15,
          },
        },
      ],
    };
  }

  /**
   * Get layout-specific configuration for the graph series.
   */
  private getLayoutConfig(
    layout: ChartLayout,
    nodeCount: number
  ): Partial<GraphSeriesOption> {
    if (layout === 'circular') {
      return {
        layout: 'circular',
        circular: {
          rotateLabel: true,
        },
      };
    }

    // Force-directed layout
    return {
      layout: 'force',
      force: {
        repulsion: Math.max(200, nodeCount * 15),
        gravity: 0.1,
        edgeLength: Math.max(80, 200 - nodeCount * 2),
        friction: 0.6,
      },
    };
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

  // ─────────────────────────────────────────────────────────────────────────
  // Node Image Loading
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load identity images for worldbuilding nodes via the batch endpoint.
   */
  private async loadNodeImages(data: ChartGraphData): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    const worldbuildingIds = data.nodes
      .filter(n => n.type === ElementType.Worldbuilding)
      .map(n => n.id);

    if (worldbuildingIds.length === 0) return;

    try {
      const response = await firstValueFrom(
        this.elementsService.getElementImages(project.username, project.slug, {
          elementIds: worldbuildingIds,
        })
      );

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

  /** Save viewport and node positions to localStorage */
  private saveLocalState(): void {
    const id = this.elementId();
    if (!id || !this.echartsInstance) return;

    // TODO: Extract node positions from ECharts if needed
    this.chartService.saveLocalState(id, {});
  }

  /** Simple HTML escaping for tooltip strings */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
