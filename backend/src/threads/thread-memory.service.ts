import { Injectable } from '@nestjs/common';
import type { ScopedConversationMemory } from '@/ai/state';

interface MemoryRecord {
  userId: string;
  memory: ScopedConversationMemory;
}

@Injectable()
export class ThreadMemoryService {
  private readonly memoryByThread = new Map<string, MemoryRecord>();
  private readonly ttlMs = 12 * 60 * 60 * 1000;
  private readonly minConfidence = 0.2;

  private applyDecay(memory: ScopedConversationMemory): ScopedConversationMemory {
    const now = Date.now();
    const updatedAt = new Date(memory.updated_at).getTime();
    const elapsedHours = Math.max(0, (now - updatedAt) / (1000 * 60 * 60));
    const decayedConfidence = memory.confidence * 0.95 ** elapsedHours;

    return {
      ...memory,
      confidence: Math.max(0, Math.min(1, decayedConfidence)),
    };
  }

  getThreadMemory(threadId: string): ScopedConversationMemory | null {
    const record = this.memoryByThread.get(threadId);
    if (!record) {
      return null;
    }

    const now = Date.now();
    const updatedAt = new Date(record.memory.updated_at).getTime();
    if (now - updatedAt > this.ttlMs) {
      this.memoryByThread.delete(threadId);
      return null;
    }

    const decayed = this.applyDecay(record.memory);
    if (decayed.confidence < this.minConfidence) {
      this.memoryByThread.delete(threadId);
      return null;
    }

    this.memoryByThread.set(threadId, {
      ...record,
      memory: decayed,
    });

    return decayed;
  }

  upsertThreadMemory(
    threadId: string,
    userId: string,
    incoming: ScopedConversationMemory,
  ): ScopedConversationMemory {
    const existing = this.getThreadMemory(threadId);

    const merged: ScopedConversationMemory = {
      active_persons: Array.from(
        new Set([...(existing?.active_persons || []), ...(incoming.active_persons || [])]),
      ).slice(0, 10),
      active_timeframe: incoming.active_timeframe || existing?.active_timeframe,
      active_clinical_intent: incoming.active_clinical_intent || existing?.active_clinical_intent,
      preferred_clinical_units:
        incoming.preferred_clinical_units || existing?.preferred_clinical_units,
      summary: incoming.summary || existing?.summary,
      confidence: Math.max(incoming.confidence, existing?.confidence || 0),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + this.ttlMs).toISOString(),
    };

    const existingRecord = this.memoryByThread.get(threadId);
    this.memoryByThread.set(threadId, {
      userId: existingRecord?.userId || userId,
      memory: merged,
    });

    return merged;
  }

  clearThreadMemory(threadId: string): void {
    this.memoryByThread.delete(threadId);
  }

  clearUserMemory(userId: string): void {
    for (const [threadId, record] of this.memoryByThread.entries()) {
      if (record.userId === userId) {
        this.memoryByThread.delete(threadId);
      }
    }
  }
}
