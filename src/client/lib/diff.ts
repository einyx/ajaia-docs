import { diffWords } from 'diff';

export interface DiffPart {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * The document's HTML as plain text, one line per block.
 *
 * Both sides of a diff go through this, so the two texts are always shaped the
 * same way — otherwise every line would look changed.
 */
export function htmlToText(html: string): string {
  const text = decodeEntities(
    html
      .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr|section)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  );

  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n+/g, '\n')
    .trim();
}

/**
 * Word-level diff from `oldText` to `newText`.
 *
 * The timeout is the point: diffing two very different large documents is
 * quadratic, so the library gives up rather than freezing the tab. When it
 * does, the honest answer is "all of it changed".
 */
export function diffText(oldText: string, newText: string, timeout = 1500): DiffPart[] {
  const changes = diffWords(oldText, newText, { timeout });

  if (!changes) {
    return [
      { type: 'removed', text: oldText },
      { type: 'added', text: newText },
    ];
  }

  return changes.map((change) => ({
    type: change.added ? 'added' : change.removed ? 'removed' : 'equal',
    text: change.value,
  }));
}
