import { describe, it, expect, vi } from 'vitest';
import { VisualizationService } from '@/ai/visualization.service';
import type { KpiQueryResult } from '@/common/types';

function buildService(llmContent = 'table') {
  const llmService = {
    createChatModel: vi.fn(() => ({
      invoke: vi.fn(async () => ({ content: llmContent })),
    })),
  };

  const tokenUsageService = {
    logTokenUsage: vi.fn(async () => undefined),
  };

  const config = {
    getActiveProvider: vi.fn(() => 'bedrock'),
    getActiveModelForRole: vi.fn(() => 'base-model'),
  };

  return new VisualizationService(
    llmService as never,
    tokenUsageService as never,
    config as never,
  );
}

describe('VisualizationService', () => {
  it('prefers scattermapbox for map intent when latitude/longitude exist', async () => {
    const service = buildService();
    const data: KpiQueryResult = {
      columns: ['person_source_value', 'LATITUDE', 'LONGITUDE', 'visit_duration_days'],
      row_count: 3,
      data: [
        {
          person_source_value: 'A',
          LATITUDE: 29.7,
          LONGITUDE: -95.3,
          visit_duration_days: 45.1,
        },
        {
          person_source_value: 'B',
          LATITUDE: 29.9,
          LONGITUDE: -95.1,
          visit_duration_days: 43.5,
        },
      ],
    };

    const visType = await service.determineVisualization(
      'show these persons on a map by visit duration',
      data,
    );

    expect(visType).toBe('scattermapbox');
  });

  it('does not default to sunburst for map intent without geospatial columns', async () => {
    const service = buildService();
    const data: KpiQueryResult = {
      columns: ['person_source_value', 'care_site_name', 'department'],
      row_count: 3,
      data: [
        {
          person_source_value: 'A',
          care_site_name: 'Site A',
          department: 'Cardiology',
        },
        {
          person_source_value: 'B',
          care_site_name: 'Site A',
          department: 'Cardiology',
        },
      ],
    };

    const visType = await service.determineVisualization(
      'plot this on a map',
      data,
    );

    expect(visType).toBe('table');
  });

  it('keeps sunburst for true hierarchical non-map requests', async () => {
    const service = buildService();
    const data: KpiQueryResult = {
      columns: ['COUNTRY', 'STATE', 'care_site_name', 'person_source_value'],
      row_count: 4,
      data: [
        {
          COUNTRY: 'USA',
          STATE: 'TX',
          care_site_name: 'Site A',
          person_source_value: 'A',
        },
        {
          COUNTRY: 'USA',
          STATE: 'TX',
          care_site_name: 'Site A',
          person_source_value: 'B',
        },
      ],
    };

    const visType = await service.determineVisualization(
      'show hierarchy by country, state, care site and person',
      data,
    );

    expect(visType).toBe('sunburst');
  });

  it('maps generic LLM "map" output to scattermapbox when lat/lon columns exist', async () => {
    const service = buildService('map');
    const data: KpiQueryResult = {
      columns: ['person_source_value', 'lat', 'lon'],
      row_count: 2,
      data: [
        { person_source_value: 'A', lat: 29.7, lon: -95.3 },
        { person_source_value: 'B', lat: 30.1, lon: -95.8 },
      ],
    };

    const visType = await service.determineVisualization(
      'best chart type for this dataset',
      data,
    );

    expect(visType).toBe('scattermapbox');
  });

  it('prefers bar for ranked KPI comparisons to avoid sunburst overuse', async () => {
    const service = buildService();
    const data: KpiQueryResult = {
      columns: ['person_source_value', 'care_site_name', 'visit_duration'],
      row_count: 10,
      data: [
        {
          person_source_value: 'A',
          care_site_name: 'Site A',
          visit_duration: 45.1,
        },
        {
          person_source_value: 'B',
          care_site_name: 'Site B',
          visit_duration: 43.0,
        },
      ],
    };

    const visType = await service.determineVisualization(
      'show top 10 persons by visit duration',
      data,
    );

    expect(visType).toBe('bar');
  });
});
