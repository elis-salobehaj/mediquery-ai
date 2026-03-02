import type { ScopedConversationMemory } from '@/ai/state';

export interface MemoryMessage {
  role: string;
  text: string;
}

export const MEMORY_SOURCE_MESSAGE_LIMIT = 30;
export const MAX_RECENT_USER_MESSAGES = 12;

const KPI_KEYWORDS: Array<{ keyword: string; intent: string }> = [
  { keyword: 'duration', intent: 'Visit duration' },
  { keyword: 'wait_time', intent: 'Lab wait time' },
  { keyword: 'visit', intent: 'Visit details' },
  { keyword: 'clinic state', intent: 'Clinic state analysis' },
  { keyword: 'medical state', intent: 'Medical state analysis' },
  { keyword: 'pill', intent: 'Pill performance' },
];

const TIMEFRAME_PATTERN =
  /(last\s+\d+\s+(day|days|week|weeks|month|months|year|years)|this\s+(week|month|quarter|year)|today|yesterday|q[1-4]\s*\d{4}|20\d{2})/i;

const UNIT_PATTERN =
  /(m\/?hr|ft\/?hr|m\/h|ft\/h|meters?\b|feet\b|m\b|ft\b|bbl\b|psi\b|ppg\b)/i;

const PATIENT_STOPWORDS = new Set([
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

function extractPatientMentions(text: string): string[] {
  const patients = new Set<string>();
  const source = text.trim();

  const quoted = source.matchAll(/['"]([^'"]{2,60})['"]/g);
  for (const match of quoted) {
    const value = match[1].trim();
    if (/patient/i.test(value) && !/\[.*\]/.test(value)) {
      patients.add(value);
    }
  }

  const explicit = source.matchAll(
    /\bpatient(?:s)?(?:\s+(?:named?|name|id|ids?))?\s+([a-z0-9_-]{2,30})\b/gi,
  );
  for (const match of explicit) {
    const value = match[1].trim();
    const normalized = value.toLowerCase();
    if (
      value.length >= 2 &&
      !PATIENT_STOPWORDS.has(normalized) &&
      !normalized.startsWith('[')
    ) {
      patients.add(value.toUpperCase());
    }
  }

  return Array.from(patients).slice(0, 10);
}

function extractKpiIntent(text: string): string | undefined {
  const lower = text.toLowerCase();
  const hit = KPI_KEYWORDS.find((entry) => lower.includes(entry.keyword));
  return hit?.intent;
}

function extractTimeframe(text: string): string | undefined {
  const hit = text.match(TIMEFRAME_PATTERN);
  return hit?.[0];
}

function extractUnits(text: string): string | undefined {
  const hit = text.match(UNIT_PATTERN);
  return hit?.[0];
}

export function deriveScopedMemory(
  currentQuery: string,
  recentMessages: MemoryMessage[],
): ScopedConversationMemory {
  const now = new Date();
  const memory: ScopedConversationMemory = {
    active_patients: [],
    confidence: 0.7,
    updated_at: now.toISOString(),
  };

  const mergedPatientSet = new Set<string>();
  const userTimeline = recentMessages
    .filter((msg) => msg.role === 'user')
    .map((msg) => msg.text)
    .slice(-MAX_RECENT_USER_MESSAGES);
  const timeline = [...userTimeline, currentQuery];

  for (const text of timeline) {
    for (const patient of extractPatientMentions(text)) {
      mergedPatientSet.add(patient);
    }

    const timeframe = extractTimeframe(text);
    if (timeframe) {
      memory.active_timeframe = timeframe;
    }

    const kpiIntent = extractKpiIntent(text);
    if (kpiIntent) {
      memory.active_kpi_intent = kpiIntent;
    }

    const units = extractUnits(text);
    if (units) {
      memory.preferred_units = units;
    }
  }

  memory.active_patients = Array.from(mergedPatientSet).slice(0, 10);
  memory.summary = summarizeScopedMemory(memory);
  return memory;
}

export function summarizeScopedMemory(
  memory: ScopedConversationMemory,
): string {
  const segments: string[] = [];

  if (memory.active_patients.length > 0) {
    const patients = memory.active_patients.slice(0, 3).join(', ');
    const suffix = memory.active_patients.length > 3 ? ' +more' : '';
    segments.push(`Patients: ${patients}${suffix}`);
  }

  if (memory.active_kpi_intent) {
    segments.push(`KPI: ${memory.active_kpi_intent}`);
  }

  if (memory.active_timeframe) {
    segments.push(`Time: ${memory.active_timeframe}`);
  }

  if (memory.preferred_units) {
    segments.push(`Units: ${memory.preferred_units}`);
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
    `active_patients=${memory.active_patients.join(', ') || 'none'}`,
    `active_timeframe=${memory.active_timeframe || 'none'}`,
    `active_kpi_intent=${memory.active_kpi_intent || 'none'}`,
    `preferred_units=${memory.preferred_units || 'none'}`,
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
