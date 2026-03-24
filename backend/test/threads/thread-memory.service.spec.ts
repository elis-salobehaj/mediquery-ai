import { describe, expect, it } from 'vitest';
import { ThreadMemoryService } from '@/threads/thread-memory.service';

describe('ThreadMemoryService', () => {
  it('stores and retrieves thread memory', () => {
    const service = new ThreadMemoryService();

    service.upsertThreadMemory('thread-1', 'user-1', {
      active_persons: ['PERSON_A'],
      active_timeframe: 'last 30 days',
      active_clinical_intent: 'Condition occurrence',
      preferred_clinical_units: 'mg/dL',
      confidence: 0.8,
      updated_at: new Date().toISOString(),
    });

    const memory = service.getThreadMemory('thread-1');
    expect(memory).not.toBeNull();
    expect(memory?.active_persons).toContain('PERSON_A');
    expect(memory?.active_clinical_intent).toBe('Condition occurrence');
  });

  it('merges active_persons across upserts', () => {
    const service = new ThreadMemoryService();

    service.upsertThreadMemory('thread-1', 'user-1', {
      active_persons: ['PERSON_A'],
      confidence: 0.7,
      updated_at: new Date().toISOString(),
    });

    service.upsertThreadMemory('thread-1', 'user-1', {
      active_persons: ['PERSON_B'],
      confidence: 0.8,
      updated_at: new Date().toISOString(),
    });

    const memory = service.getThreadMemory('thread-1');
    expect(memory?.active_persons).toContain('PERSON_A');
    expect(memory?.active_persons).toContain('PERSON_B');
  });

  it('clears memory by user across threads', () => {
    const service = new ThreadMemoryService();

    service.upsertThreadMemory('thread-2', 'user-1', {
      active_persons: ['PERSON_B'],
      confidence: 0.7,
      updated_at: new Date().toISOString(),
    });

    service.upsertThreadMemory('thread-3', 'user-2', {
      active_persons: ['PERSON_C'],
      confidence: 0.7,
      updated_at: new Date().toISOString(),
    });

    service.clearUserMemory('user-1');

    expect(service.getThreadMemory('thread-2')).toBeNull();
    expect(service.getThreadMemory('thread-3')).not.toBeNull();
  });
});
