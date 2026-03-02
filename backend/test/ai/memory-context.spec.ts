import { describe, it, expect } from 'vitest';
import {
  deriveScopedMemory,
  formatMemoryContext,
  formatMemoryThought,
} from '@/ai/memory-context';

describe('memory-context', () => {
  it('derives scoped memory from recent messages and query', () => {
    const memory = deriveScopedMemory(
      'show top patients by duration in m/hr this month',
      [
        { role: 'user', text: 'focus on patient alpha-12 and nearby offsets' },
        { role: 'assistant', text: 'Try filtering by [specific patient name]' },
        { role: 'user', text: 'also include last 30 days trend' },
      ],
    );

    expect(memory.active_patients).toEqual(
      expect.arrayContaining(['ALPHA-12']),
    );
    expect(memory.active_patients).not.toEqual(
      expect.arrayContaining(['SPECIFIC']),
    );
    expect(memory.active_kpi_intent).toBe('Visit duration');
    expect(memory.preferred_units?.toLowerCase()).toContain('m/hr');
    expect(memory.active_timeframe?.toLowerCase()).toContain('this month');
    expect(memory.confidence).toBeGreaterThan(0);
    expect(memory.summary).toContain('KPI: Visit duration');
  });

  it('formats scoped memory for prompt context', () => {
    const text = formatMemoryContext({
      active_patients: ['PATIENT_A'],
      active_timeframe: 'last 30 days',
      active_kpi_intent: 'DURATION performance',
      preferred_units: 'm/hr',
      confidence: 0.82,
      updated_at: new Date().toISOString(),
    });

    expect(text).toContain('active_patients=PATIENT_A');
    expect(text).toContain('active_timeframe=last 30 days');
    expect(text).toContain('confidence=0.82');
  });

  it('formats memory thought for human-readable streaming', () => {
    const thought = formatMemoryThought({
      active_patients: ['PATIENT_A', 'PATIENT_B'],
      active_timeframe: 'last 30 days',
      active_kpi_intent: 'DURATION performance',
      preferred_units: 'm/hr',
      confidence: 0.74,
      updated_at: new Date().toISOString(),
    });

    expect(thought).toContain('🧠 Memory Context:');
    expect(thought).toContain('Patients: PATIENT_A, PATIENT_B');
    expect(thought).toContain('confidence 74%');
  });
});
