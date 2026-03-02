import { describe, it, expect } from 'vitest';
import { ThreadMemoryService } from '@/threads/thread-memory.service';

describe('ThreadMemoryService', () => {
  it('stores and retrieves thread memory', () => {
    const service = new ThreadMemoryService();

    service.upsertThreadMemory('thread-1', 'user-1', {
      active_patients: ['PATIENT_A'],
      active_timeframe: 'last 30 days',
      active_kpi_intent: 'DURATION performance',
      preferred_units: 'm/hr',
      confidence: 0.8,
      updated_at: new Date().toISOString(),
    });

    const memory = service.getThreadMemory('thread-1');
    expect(memory).not.toBeNull();
    expect(memory?.active_patients).toContain('PATIENT_A');
  });

  it('clears memory by user across threads', () => {
    const service = new ThreadMemoryService();

    service.upsertThreadMemory('thread-2', 'user-1', {
      active_patients: ['PATIENT_B'],
      confidence: 0.7,
      updated_at: new Date().toISOString(),
    });

    service.upsertThreadMemory('thread-3', 'user-2', {
      active_patients: ['PATIENT_C'],
      confidence: 0.7,
      updated_at: new Date().toISOString(),
    });

    service.clearUserMemory('user-1');

    expect(service.getThreadMemory('thread-2')).toBeNull();
    expect(service.getThreadMemory('thread-3')).not.toBeNull();
  });
});
