import type { ScopedConversationMemory } from '@/ai/state';

export interface MemoryMessage {
  role: string;
  text: string;
}

export const MEMORY_SOURCE_MESSAGE_LIMIT = 30;
export const MAX_RECENT_USER_MESSAGES = 12;

const CLINICAL_KEYWORDS: Array<{ keyword: string; intent: string }> = [
  { keyword: 'diagnosis', intent: 'Condition occurrence' },
  { keyword: 'diagnoses', intent: 'Condition occurrence' },
  { keyword: 'condition', intent: 'Condition occurrence' },
  { keyword: 'drug', intent: 'Drug exposure' },
  { keyword: 'medication', intent: 'Drug exposure' },
  { keyword: 'measurement', intent: 'Measurement analysis' },
  { keyword: 'lab', intent: 'Measurement analysis' },
  { keyword: 'vital', intent: 'Measurement analysis' },
  { keyword: 'visit', intent: 'Visit occurrence analysis' },
  { keyword: 'encounter', intent: 'Visit occurrence analysis' },
  { keyword: 'procedure', intent: 'Procedure occurrence' },
  { keyword: 'observation', intent: 'Observation analysis' },
  { keyword: 'era', intent: 'Condition/drug era analysis' },
];

const TIMEFRAME_PATTERN =
  /(last\s+\d+\s+(day|days|week|weeks|month|months|year|years)|this\s+(week|month|quarter|year)|today|yesterday|q[1-4]\s*\d{4}|20\d{2})/i;

const UNIT_PATTERN =
  /(\bmg\/dL\b|\bmmHg\b|\bkg\b|\bcm\b|\bbpm\b|\bmmol\/L\b|\b%\b)/i;

const PERSON_STOPWORDS = new Set([
  'active',
  'status',
  'filter',
  'filters',
  'records',
  'show',
  'list',
  'all',
  'with',
  'by',
  'in',
  'on',
  'for',
  'and',
  'or',
  'trend',
  'specific',
  'name',
]);

function extractPersonMentions(text: string): string[] {
  const persons = new Set<string>();
  const source = text.trim();

  const quoted = source.matchAll(/['"]([^'"]{2,60})['"]/g);
  for (const match of quoted) {
    const value = match[1].trim();
    if (/patient|person/i.test(value) && !/\[.*\]/.test(value)) {
      persons.add(value);
    }
  }

  const explicit = source.matchAll(
    /\b(?:patient|person)(?:s)?(?:\s+(?:named?|name|id|ids?))?\s+([a-z0-9_-]{2,30})\b/gi,
  );
  for (const match of explicit) {
    const value = match[1].trim();
    const normalized = value.toLowerCase();
    if (
      value.length >= 2 &&
      !PERSON_STOPWORDS.has(normalized) &&
      !normalized.startsWith('[')
    ) {
      persons.add(value.toUpperCase());
    }
  }

  // Also match person_id = <number> references
  const personIdMatches = source.matchAll(/\bperson_id\s*=\s*(\d+)\b/gi);
  for (const match of personIdMatches) {
    persons.add(`PERSON_${match[1]}`);
  }

  return Array.from(persons).slice(0, 10);
}

function extractClinicalIntent(text: string): string | undefined {
  const lower = text.toLowerCase();
  const hit = CLINICAL_KEYWORDS.find((entry) => lower.includes(entry.keyword));
  return hit?.intent;
}

function extractTimeframe(text: string): string | undefined {
  const hit = text.match(TIMEFRAME_PATTERN);
  return hit?.[0];
}

function extractClinicalUnits(text: string): string | undefined {
  const hit = text.match(UNIT_PATTERN);
  return hit?.[0];
}

export function deriveScopedMemory(
  currentQuery: string,
  recentMessages: MemoryMessage[],
): ScopedConversationMemory {
  const now = new Date();
  const memory: ScopedConversationMemory = {
    active_persons: [],
    confidence: 0.7,
    updated_at: now.toISOString(),
  };

  const mergedPersonSet = new Set<string>();
  const userTimeline = recentMessages
    .filter((msg) => msg.role === 'user')
    .map((msg) => msg.text)
    .slice(-MAX_RECENT_USER_MESSAGES);
  const timeline = [...userTimeline, currentQuery];

  for (const text of timeline) {
    for (const person of extractPersonMentions(text)) {
      mergedPersonSet.add(person);
    }

    const timeframe = extractTimeframe(text);
    if (timeframe) {
      memory.active_timeframe = timeframe;
    }

    const clinicalIntent = extractClinicalIntent(text);
    if (clinicalIntent) {
      memory.active_clinical_intent = clinicalIntent;
    }

    const units = extractClinicalUnits(text);
    if (units) {
      memory.preferred_clinical_units = units;
    }
  }

  memory.active_persons = Array.from(mergedPersonSet).slice(0, 10);
  memory.summary = summarizeScopedMemory(memory);
  return memory;
}

export function summarizeScopedMemory(
  memory: ScopedConversationMemory,
): string {
  const segments: string[] = [];

  if (memory.active_persons.length > 0) {
    const persons = memory.active_persons.slice(0, 3).join(', ');
    const suffix = memory.active_persons.length > 3 ? ' +more' : '';
    segments.push(`Persons: ${persons}${suffix}`);
  }

  if (memory.active_clinical_intent) {
    segments.push(`Clinical: ${memory.active_clinical_intent}`);
  }

  if (memory.active_timeframe) {
    segments.push(`Time: ${memory.active_timeframe}`);
  }

  if (memory.preferred_clinical_units) {
    segments.push(`Units: ${memory.preferred_clinical_units}`);
  }

  return segments.length > 0
    ? segments.join(' • ')
    : 'No persistent context yet';
}

export function formatMemoryContext(memory?: ScopedConversationMemory): string {
  if (!memory) {
    return 'none';
  }

  const parts = [
    `active_persons=${memory.active_persons.join(', ') || 'none'}`,
    `active_timeframe=${memory.active_timeframe || 'none'}`,
    `active_clinical_intent=${memory.active_clinical_intent || 'none'}`,
    `preferred_clinical_units=${memory.preferred_clinical_units || 'none'}`,
    `confidence=${memory.confidence.toFixed(2)}`,
  ];

  return parts.join(' | ');
}

export function formatMemoryThought(memory?: ScopedConversationMemory): string {
  if (!memory) {
    return '🧠 Memory Context: No persistent context yet';
  }

  const summary = memory.summary || summarizeScopedMemory(memory);
  const confidencePct = Math.round((memory.confidence || 0) * 100);
  return `🧠 Memory Context: ${summary} (confidence ${confidencePct}%)`;
}
