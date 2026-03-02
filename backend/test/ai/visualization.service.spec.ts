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
      columns: ['patient_name', 'LATITUDE', 'LONGITUDE', 'DURATION'],
      row_count: 3,
      data: [
        {
          patient_name: 'A',
          LATITUDE: 29.7,
          LONGITUDE: -95.3,
          DURATION: 45.1,
        },
        {
          patient_name: 'B',
          LATITUDE: 29.9,
          LONGITUDE: -95.1,
          DURATION: 43.5,
        },
      ],
    };

    const visType = await service.determineVisualization(
      'show these patients on a map by duration',
      data,
    );

    expect(visType).toBe('scattermapbox');
  });

  it('does not default to sunburst for map intent without geospatial columns', async () => {
    const service = buildService();
    const data: KpiQueryResult = {
      columns: ['patient_name', 'CLINIC_NAME', 'BASIN'],
      row_count: 3,
      data: [
        { patient_name: 'A', CLINIC_NAME: 'R1', BASIN: 'Permian' },
        { patient_name: 'B', CLINIC_NAME: 'R1', BASIN: 'Permian' },
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
      columns: ['COUNTRY', 'STATE', 'CLINIC_NAME', 'patient_name'],
      row_count: 4,
      data: [
        {
          COUNTRY: 'USA',
          STATE: 'TX',
          CLINIC_NAME: 'R1',
          patient_name: 'A',
        },
        {
          COUNTRY: 'USA',
          STATE: 'TX',
          CLINIC_NAME: 'R1',
          patient_name: 'B',
        },
      ],
    };

    const visType = await service.determineVisualization(
      'show hierarchy by country, state, clinic and patient',
      data,
    );

    expect(visType).toBe('sunburst');
  });

  it('maps generic LLM "map" output to scattermapbox when lat/lon columns exist', async () => {
    const service = buildService('map');
    const data: KpiQueryResult = {
      columns: ['patient_name', 'lat', 'lon'],
      row_count: 2,
      data: [
        { patient_name: 'A', lat: 29.7, lon: -95.3 },
        { patient_name: 'B', lat: 30.1, lon: -95.8 },
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
      columns: ['patient_name', 'BASIN', 'CLINIC_NAME', 'visit_duration'],
      row_count: 10,
      data: [
        {
          patient_name: 'A',
          BASIN: 'Permian',
          CLINIC_NAME: 'R1',
          visit_duration: 45.1,
        },
        {
          patient_name: 'B',
          BASIN: 'Permian',
          CLINIC_NAME: 'R2',
          visit_duration: 43.0,
        },
      ],
    };

    const visType = await service.determineVisualization(
      'show top 10 patients by duration',
      data,
    );

    expect(visType).toBe('bar');
  });
});
