import { HumanMessage } from '@langchain/core/messages';
import { Injectable, Logger } from '@nestjs/common';
import type { KpiQueryResult, KpiRow, LangChainLLMResponse } from '@/common/types';
import { ConfigService } from '@/config/config.service';
import { AgentRole, Provider, TokenUsageService } from '@/token-usage/token-usage.service';
import { LLMService } from './llm.service';

@Injectable()
export class VisualizationService {
  private readonly logger = new Logger(VisualizationService.name);

  private readonly MAP_QUERY_KEYWORDS = [
    'map',
    'mapped',
    'mapping',
    'location',
    'locations',
    'geograph',
    'spatial',
    'nearby',
    'latitude',
    'longitude',
    'lat',
    'lon',
    'within',
    'radius',
    'distance',
    'near',
    'nearby persons',
  ];

  private readonly VALID_CHART_TYPES = [
    'bar',
    'pie',
    'donut',
    'line',
    'scatter',
    'area',
    'box',
    'violin',
    'histogram',
    'heatmap',
    'contour',
    'histogram2d',
    'waterfall',
    'funnel',
    'candlestick',
    'ohlc',
    'scatter3d',
    'surface',
    'mesh3d',
    'cone',
    'line3d',
    'choropleth',
    'scattergeo',
    'scattermapbox',
    'choroplethmapbox',
    'densitymapbox',
    'sunburst',
    'treemap',
    'icicle',
    'sankey',
    'indicator',
    'gauge',
    'bullet',
    'parcoords',
    'splom',
    'scatterpolar',
    'barpolar',
    'scatterternary',
    'pointcloud',
    'streamtube',
    'isosurface',
    'volume',
    'heatmapgl',
    'scattergl',
    'scatter3dgl',
    'table',
    'map',
  ];

  constructor(
    private readonly llmService: LLMService,
    private readonly tokenUsageService: TokenUsageService,
    private readonly config: ConfigService,
  ) {}

  private isNumericCol(colName: string, rows: KpiRow[]): boolean {
    try {
      if (!rows || rows.length === 0) return false;
      const val = rows[0][colName];
      return typeof val === 'number';
    } catch {
      return false;
    }
  }

  private hasLatLonColumns(columns: string[]): boolean {
    const hasLatitude = columns.some((col) => {
      const normalized = col.toLowerCase();
      return normalized.includes('latitude') || normalized === 'lat';
    });
    const hasLongitude = columns.some((col) => {
      const normalized = col.toLowerCase();
      return normalized.includes('longitude') || normalized === 'lon' || normalized === 'lng';
    });

    return hasLatitude && hasLongitude;
  }

  private hasRegionColumns(columns: string[]): boolean {
    return columns.some((col: string) => {
      const normalized = col.toLowerCase();
      return (
        normalized.includes('state') ||
        normalized.includes('country') ||
        normalized.includes('region')
      );
    });
  }

  private isMapIntent(userQuery: string): boolean {
    const queryLower = userQuery.toLowerCase();
    return this.MAP_QUERY_KEYWORDS.some((keyword) => queryLower.includes(keyword));
  }

  private isHierarchicalIntent(userQuery: string): boolean {
    const queryLower = userQuery.toLowerCase();
    return [
      'hierarchy',
      'hierarchical',
      'breakdown',
      'composition',
      'share of',
      'drilldown',
      'sunburst',
      'treemap',
      'icicle',
    ].some((keyword) => queryLower.includes(keyword));
  }

  private isRankingIntent(userQuery: string): boolean {
    const queryLower = userQuery.toLowerCase();
    return [
      'top ',
      'bottom ',
      'highest',
      'lowest',
      'best',
      'worst',
      'rank',
      'compare',
      'comparison',
    ].some((keyword) => queryLower.includes(keyword));
  }

  async determineVisualization(
    userQuery: string,
    data: KpiQueryResult,
    userId?: string,
    providerOverride?: string,
  ): Promise<string> {
    if (!data || (data.row_count || 0) === 0) {
      return 'table';
    }

    const columns = data.columns || [];
    const rows = data.data || [];
    const rowCount = data.row_count || 0;

    if (!rows.length || !columns.length) {
      return 'table';
    }

    // Classify columns
    const numericCols = columns.filter((col: string) => this.isNumericCol(col, rows));
    const categoricalCols = columns.filter((col: string) => !this.isNumericCol(col, rows));

    // ===== HEURISTIC RULES (Fast path) =====

    const hasLatLon = this.hasLatLonColumns(columns);
    const hasRegionData = this.hasRegionColumns(columns);
    const mapIntent = this.isMapIntent(userQuery);
    const rankingIntent = this.isRankingIntent(userQuery);
    const hierarchicalIntent = this.isHierarchicalIntent(userQuery);

    // Geographic intent and geospatial columns should win over hierarchical defaults.
    if (mapIntent && hasLatLon) {
      return 'scattermapbox';
    }

    if (mapIntent && hasRegionData) {
      return 'choropleth';
    }

    // Geographic data without explicit map request still prefers map-capable charts.
    if (hasLatLon) {
      return 'scattermapbox';
    }

    if (hasRegionData && numericCols.length > 0) {
      return 'choropleth';
    }

    // Single row → indicator/table
    if (rowCount === 1) {
      return numericCols.length > 0 ? 'indicator' : 'table';
    }

    // Explicit map request with no geospatial fields: avoid misleading non-map charts.
    if (mapIntent && !hasLatLon && !hasRegionData) {
      return 'table';
    }

    // Time series detection → line/area
    if (
      columns.some(
        (col: string) => col.toLowerCase().includes('date') || col.toLowerCase().includes('time'),
      )
    ) {
      if (numericCols.length >= 1) return 'line';
    }

    // 3+ numeric columns → 3D scatter/surface/parcoords
    if (numericCols.length >= 3) {
      if (rowCount < 100) return 'scatter3d';
      if (rowCount < 500) return 'parcoords';
      return 'heatmap';
    }

    // 2 columns (1 categorical, 1 numeric) → bar/pie
    if (columns.length === 2 && categoricalCols.length === 1 && numericCols.length === 1) {
      if (rowCount <= 10) return 'pie';
      if (rowCount <= 50) return 'bar';
      return 'histogram';
    }

    // Ranked comparisons should default to bar (not hierarchical charts).
    if (rankingIntent && categoricalCols.length >= 1 && numericCols.length >= 1) {
      return rowCount <= 75 ? 'bar' : 'histogram';
    }

    // Hierarchical data (3+ categorical) → sunburst/treemap
    if (categoricalCols.length >= 3 && hierarchicalIntent) {
      return 'sunburst';
    }

    // Query keyword analysis
    const queryLower = userQuery.toLowerCase();
    if (['distribution', 'spread', 'quartile', 'outlier'].some((kw) => queryLower.includes(kw)))
      return 'box';
    if (queryLower.includes('frequency') || queryLower.includes('count')) return 'histogram';
    if (queryLower.includes('correlation') || queryLower.includes('relationship')) {
      return numericCols.length > 4 ? 'heatmap' : 'scatter';
    }
    if (['flow', 'journey', 'path'].some((kw) => queryLower.includes(kw))) return 'sankey';
    if (queryLower.includes('trend') || queryLower.includes('over time')) return 'line';
    if (queryLower.includes('compare') || queryLower.includes('comparison')) return 'bar';
    if (['total', 'sum', 'kpi'].some((kw) => queryLower.includes(kw))) return 'indicator';
    if (['gauge', 'score', 'rating'].some((kw) => queryLower.includes(kw))) return 'gauge';

    // ===== LLM-BASED SELECTION (Fallback) =====
    return this.llmVisualizationSelection(
      userQuery,
      columns,
      rowCount,
      numericCols,
      categoricalCols,
      rows,
      userId,
      providerOverride,
    );
  }

  private async llmVisualizationSelection(
    userQuery: string,
    columns: string[],
    rowCount: number,
    numericCols: string[],
    categoricalCols: string[],
    rows: KpiRow[],
    userId?: string,
    providerOverride?: string,
  ): Promise<string> {
    const llm = this.llmService.createChatModel('base', providerOverride);

    const prompt = `You are a data visualization expert. Choose the BEST Plotly.js chart type for this query and data.

User Query: "${userQuery}"
Data Columns: ${JSON.stringify(columns)}
Row Count: ${rowCount}
Numeric Columns: ${JSON.stringify(numericCols)}
Categorical Columns: ${JSON.stringify(categoricalCols)}
Sample Data: ${JSON.stringify(rows.slice(0, 2))}

Available Chart Types (choose ONE):

**Basic**: bar, pie, donut, line, scatter, area
**Statistical**: box, violin, histogram, heatmap, contour
**Financial**: waterfall, funnel, candlestick, ohlc
**3D**: scatter3d, surface, mesh3d
**Maps**: choropleth, scattergeo, scattermapbox
**Hierarchical**: sunburst, treemap, icicle, sankey
**Specialized**: indicator, gauge, parcoords, splom, table

Guidelines:
- bar: categorical comparison
- pie/donut: parts of whole
- line/area: trends over time
- scatter: correlation between 2 numeric variables
- box/violin: distribution analysis, outliers
- histogram: frequency distribution
- heatmap: correlation matrix (3+ numeric cols)
- scatter3d: 3D relationships (3+ numeric cols)
- choropleth: geographic data
- sunburst/treemap: hierarchical categories (3+ categorical)
- sankey: flow/journey analysis
- indicator/gauge: single KPI value
- table: raw data, complex structures

Return ONLY the chart type name (lowercase, no explanation).`;

    try {
      const response = await llm.invoke([new HumanMessage(prompt)]);
      let visType = (
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
      )
        .toLowerCase()
        .trim();

      // Track usage
      const usage = (response as LangChainLLMResponse).usage_metadata;
      if (userId && usage) {
        const provider = (providerOverride || this.config.getActiveProvider()) as Provider;
        const model = this.config.getActiveModelForRole('base', providerOverride);

        await this.tokenUsageService.logTokenUsage(
          userId,
          provider,
          model,
          usage.input_tokens || 0,
          usage.output_tokens || 0,
          AgentRole.BASE,
        );
      }

      if (visType === 'map') {
        visType = this.hasLatLonColumns(columns) ? 'scattermapbox' : 'choropleth';
      }

      if (this.VALID_CHART_TYPES.includes(visType)) {
        return visType;
      }
      return 'table';
    } catch (err) {
      this.logger.error(
        `Visualization selection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'table';
    }
  }
}
