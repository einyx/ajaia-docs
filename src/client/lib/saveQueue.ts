export interface PendingPatch {
  title?: string;
  content?: string;
  plainText?: string;
}

/**
 * Per-document save queue.
 *
 * Pending edits are tracked per document id, so a failed save is always retried
 * against the document it came from — never against whichever document the user
 * happens to be looking at when the retry fires.
 */
export class SaveQueue {
  private readonly pending = new Map<string, PendingPatch>();

  /** Queue a patch for a document (newer fields win over queued ones). */
  enqueue(id: string, patch: PendingPatch): void {
    const queued = this.pending.get(id) ?? {};
    this.pending.set(id, { ...queued, ...patch });
  }

  /** Remove and return the queued patch for a document, or null if there is none. */
  take(id: string): PendingPatch | null {
    const patch = this.pending.get(id);
    if (!patch) return null;
    this.pending.delete(id);
    return Object.keys(patch).length > 0 ? patch : null;
  }

  /** Put a failed patch back, keeping any newer edits made while it was in flight. */
  restore(id: string, patch: PendingPatch): void {
    const newer = this.pending.get(id) ?? {};
    this.pending.set(id, { ...patch, ...newer });
  }

  /** Ids of the documents that have queued edits. */
  ids(): string[] {
    return [...this.pending.keys()];
  }

  get size(): number {
    return this.pending.size;
  }
}
