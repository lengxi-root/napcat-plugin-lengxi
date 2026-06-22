import type { AIMessage, ContextInfo } from '../types';
import { CONTEXT_MAX_TURNS, CONTEXT_EXPIRE_SECONDS } from '../config';

interface ContextMessage extends AIMessage { isToolSummary?: boolean; }
interface ContextEntry { messages: ContextMessage[]; timestamp: number; }

const CLEANUP_INTERVAL = 120000;

export class ContextManager {
  private contexts = new Map<string, ContextEntry>();
  private maxTurns = CONTEXT_MAX_TURNS;
  private expireMs = CONTEXT_EXPIRE_SECONDS * 1000;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  setMaxTurns (turns: number): void {
    const normalized = Number(turns);
    this.maxTurns = Number.isFinite(normalized) && normalized > 0 ? Math.floor(normalized) : CONTEXT_MAX_TURNS;
    for (const entry of this.contexts.values()) this.trimMessages(entry);
  }

  private getKey (userId: string, groupId?: string): string {
    return groupId ? `g${groupId}_u${userId}` : `p${userId}`;
  }

  private isExpired (key: string): boolean {
    const entry = this.contexts.get(key);
    return !entry || Date.now() - entry.timestamp > this.expireMs;
  }

  getContext (userId: string, groupId?: string): AIMessage[] {
    const key = this.getKey(userId, groupId);
    if (this.isExpired(key)) {
      this.contexts.delete(key);
      return [];
    }

    return (this.contexts.get(key)?.messages || [])
      .map(({ isToolSummary: _, ...msg }) => msg)
      .filter(msg => Boolean(msg.content));
  }

  addMessage (
    userId: string,
    groupId: string | undefined,
    role: 'user' | 'assistant',
    content: string,
    isToolSummary = false
  ): void {
    if (!content) return;

    const key = this.getKey(userId, groupId);
    if (this.isExpired(key)) {
      this.contexts.set(key, { messages: [], timestamp: Date.now() });
    }

    const entry = this.contexts.get(key)!;
    entry.messages.push({ role, content, isToolSummary });
    this.trimMessages(entry);
    entry.timestamp = Date.now();
  }

  private trimMessages (entry: ContextEntry): void {
    const limit = this.maxTurns * 2;
    let normalCount = entry.messages.filter(m => !m.isToolSummary).length;
    if (normalCount <= limit) return;

    const trimmed: ContextMessage[] = [];
    let skipping = true;

    for (const msg of entry.messages) {
      if (skipping && !msg.isToolSummary && normalCount > limit) {
        normalCount--;
        continue;
      }
      skipping = false;
      trimmed.push(msg);
    }

    entry.messages = trimmed;
  }

  clearContext (userId: string, groupId?: string): void {
    this.contexts.delete(this.getKey(userId, groupId));
  }

  getContextInfo (userId: string, groupId?: string): ContextInfo {
    const key = this.getKey(userId, groupId);
    const entry = this.contexts.get(key);
    const messages = entry?.messages || [];
    const normalMessages = messages.filter(m => !m.isToolSummary);

    return {
      turns: Math.floor(normalMessages.length / 2),
      messages: messages.length,
      expired: this.isExpired(key),
    };
  }

  cleanup (): void {
    const now = Date.now();
    for (const [key, entry] of this.contexts) {
      if (now - entry.timestamp > this.expireMs) this.contexts.delete(key);
    }
  }

  startCleanup (): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }

  stopCleanup (): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.contexts.clear();
  }
}

export const contextManager = new ContextManager();
