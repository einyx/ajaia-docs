import { describe, expect, it } from 'vitest';
import { SaveQueue } from '../src/client/lib/saveQueue.ts';

describe('SaveQueue', () => {
  it('keeps queued edits per document', () => {
    const queue = new SaveQueue();
    queue.enqueue('doc-a', { content: '<p>A</p>' });
    queue.enqueue('doc-b', { title: 'B' });

    expect(queue.ids().sort()).toEqual(['doc-a', 'doc-b']);
    expect(queue.take('doc-a')).toEqual({ content: '<p>A</p>' });
    expect(queue.take('doc-b')).toEqual({ title: 'B' });
    expect(queue.size).toBe(0);
  });

  it('merges newer fields over queued ones', () => {
    const queue = new SaveQueue();
    queue.enqueue('doc-a', { content: '<p>first</p>' });
    queue.enqueue('doc-a', { content: '<p>second</p>', title: 'Title' });

    expect(queue.take('doc-a')).toEqual({ content: '<p>second</p>', title: 'Title' });
  });

  it('returns null for a document with nothing queued', () => {
    const queue = new SaveQueue();
    expect(queue.take('doc-a')).toBeNull();
  });

  /**
   * Regression: a failed save used to be retried against whichever document was
   * open when the retry fired, which wrote one document's content into another.
   */
  it('retries a failed save against the document the edit came from', () => {
    const queue = new SaveQueue();
    queue.enqueue('doc-a', { content: '<p>typed in A</p>' });

    // The save fails: the patch is taken off the queue and put back.
    const inflight = queue.take('doc-a');
    expect(inflight).toEqual({ content: '<p>typed in A</p>' });
    queue.restore('doc-a', inflight!);

    // The user switches to another document before the retry fires.
    queue.enqueue('doc-b', { content: '<p>B</p>' });

    // The retry must still target doc-a.
    expect(queue.ids().sort()).toEqual(['doc-a', 'doc-b']);
    expect(queue.take('doc-b')).toEqual({ content: '<p>B</p>' });
    expect(queue.take('doc-a')).toEqual({ content: '<p>typed in A</p>' });
  });

  it('keeps newer edits made while a failed save was in flight', () => {
    const queue = new SaveQueue();
    queue.enqueue('doc-a', { content: '<p>older</p>' });

    const inflight = queue.take('doc-a');
    queue.enqueue('doc-a', { content: '<p>newer</p>' });
    queue.restore('doc-a', inflight!);

    expect(queue.take('doc-a')).toEqual({ content: '<p>newer</p>' });
  });
});
