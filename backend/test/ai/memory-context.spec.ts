import { describe, it, expect } from 'vitest';
import {
  deriveScopedMemory,
  formatMemoryContext,
  formatMemoryThought,
} from '@/ai/memory-context';

describe('memory-context', () => {
  it('derives scoped memory from OMOP clinical messages and query', () => {
    const memory = deriveScopedMemory(
      'show top diagnoses for patient alpha-12 with mmHg above 140 this month',
      [
        { role: 'user', text: 'focus on person alpha-12 and condition occurrences' },
        { role: 'assistant', text: 'Try filtering by [specific person name]' },
        { role: 'user', text: 'also include last 30 days trend' },
      ],
    );

    expect(memory.active_persons).toEqual(
      expect.arrayContaining(['ALPHA-12']),
    );
    expect(memory.active_persons).not.toEqual(
      expect.arrayContaining(['SPECIFIC']),
    );
    expect(memory.active_clinical_intent).toBe('Condition occurrence');
    expect(memory.preferred_clinical_units?.toLowerCase()).toContain('mmhg');
    expect(memory.active_timeframe?.toLowerCase()).toContain('this month');
    expect(memory.confidence).toBeGreaterThan(0);
    expect(memory.summary).toContain('Clinical: Condition occurrence');
  });

  it('extracts clinical intent for drug exposure queries', () => {
    const memory = deriveScopedMemory(
      'what medications has this patient been prescribed last year',
      [],
    );

    expect(memory.active_clinical_intent).toBe('Drug exposure');
  });

  it('extracts clinical intent for measurement queries', () => {
    const memory = deriveScopedMemory(
      'show latest lab results with values in mg/dL',
      [],
    );

    expect(memory.active_clinical_intent).toBe('Measurement analysis');
    expect(memory.preferred_clinical_units).toContain('mg/dL');
  });

  it('extracts person_id references from OMOP-style queries', () => {
    const memory = deriveScopedMemory(
      'show visit history where person_id = 42',
      [],
    );

    expect(memory.active_persons).toEqual(
      expect.arrayContaining(['PERSON_42']),
    );
  });

  it('formats scoped memory for prompt context using OMOP field names', () => {
    const text = formatMemoryContext({
      active_persons: ['PERSON_A'],
      active_timeframe: 'last 30 days',
      active_clinical_intent: 'Condition occurrence',
      preferred_clinical_units: 'mg/dL',
      confidence: 0.82,
      updated_at: new Date().toISOString(),
    });

    expect(text).toContain('active_persons=PERSON_A');
    expect(text).toContain('active_timeframe=last 30 days');
    expect(text).toContain('active_clinical_intent=Condition occurrence');
    expect(text).toContain('preferred_clinical_units=mg/dL');
    expect(text).toContain('confidence=0.82');
  });

  it('formats memory thought for human-readable streaming', () => {
    const thought = formatMemoryThought({
      active_persons: ['PERSON_A', 'PERSON_B'],
      active_timeframe: 'last 30 days',
      active_clinical_intent: 'Drug exposure',
      preferred_clinical_units: 'mmHg',
      confidence: 0.74,
      updated_at: new Date().toISOString(),
    });

    expect(thought).toContain('🧠 Memory Context:');
    expect(thought).toContain('Persons: PERSON_A, PERSON_B');
    expect(thought).toContain('confidence 74%');
  });

  it('returns empty context string when no memory is provided', () => {
    const thought = formatMemoryThought(undefined);
    expect(thought).toBe('🧠 Memory Context: No persistent context yet');
  });
});
