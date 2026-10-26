import { describe, expect, it } from 'vitest';
import { diffText, htmlToText } from '../src/client/lib/diff.ts';

describe('htmlToText', () => {
  it('keeps one line per block', () => {
    expect(htmlToText('<h1>Title</h1><p>First</p><p>Second</p>')).toBe('Title\nFirst\nSecond');
  });

  it('turns list items and line breaks into their own lines', () => {
    expect(htmlToText('<ul><li>One</li><li>Two</li></ul><p>After<br>break</p>')).toBe(
      'One\nTwo\nAfter\nbreak',
    );
  });

  it('decodes entities and drops markup', () => {
    expect(htmlToText('<p>Tom &amp; Jerry &lt;3 &quot;quotes&quot;</p>')).toBe(
      'Tom & Jerry <3 "quotes"',
    );
  });

  it('collapses whitespace and empty blocks', () => {
    expect(htmlToText('<p>  spaced   out  </p><p></p><p>next</p>')).toBe('spaced out\nnext');
  });
});

describe('diffText', () => {
  it('marks what was added and removed', () => {
    const parts = diffText('the quick brown fox', 'the quick red fox');

    expect(parts.filter((part) => part.type === 'removed').map((part) => part.text)).toEqual(['brown']);
    expect(parts.filter((part) => part.type === 'added').map((part) => part.text)).toEqual(['red']);
    expect(parts.filter((part) => part.type === 'equal').map((part) => part.text)).toEqual([
      'the quick ',
      ' fox',
    ]);
  });

  it('reports no change for identical text', () => {
    const parts = diffText('same text', 'same text');

    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('equal');
    expect(parts[0].text).toBe('same text');
  });

  it('rebuilds both texts from the parts', () => {
    const before = 'alpha beta';
    const after = 'alpha gamma';

    const parts = diffText(before, after);
    const oldText = parts.filter((p) => p.type !== 'added').map((p) => p.text).join('');
    const newText = parts.filter((p) => p.type !== 'removed').map((p) => p.text).join('');

    expect(oldText).toBe(before);
    expect(newText).toBe(after);
  });

  it('falls back to "everything changed" when the diff gives up', () => {
    // Two large, unrelated texts: the diff cannot finish, so the library bails.
    const before = 'alpha beta gamma delta '.repeat(2000);
    const after = 'epsilon zeta eta theta '.repeat(2000);

    const parts = diffText(before, after, 1);

    expect(parts).toEqual([
      { type: 'removed', text: before },
      { type: 'added', text: after },
    ]);
  });
});
