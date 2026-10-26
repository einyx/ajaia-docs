import DOMPurify from 'dompurify';
import { marked } from 'marked';

export interface ParsedImport {
  title: string;
  html: string;
  kind: string;
}

const EXTENSIONS = /\.(md|markdown|txt|docx)$/i;

export function isSupportedFile(file: File): boolean {
  return EXTENSIONS.test(file.name);
}

/** Files are parsed in the browser, then sanitized before they ever reach the API. */
export async function parseImportFile(file: File): Promise<ParsedImport> {
  const title = file.name.replace(EXTENSIONS, '') || file.name;
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.docx')) {
    const mammoth = await import('mammoth/mammoth.browser.js');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return { title, html: DOMPurify.sanitize(result.value), kind: 'Word document' };
  }

  const text = await file.text();

  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    const html = await marked.parse(text, { async: false, gfm: true, breaks: false });
    return { title, html: DOMPurify.sanitize(html), kind: 'Markdown' };
  }

  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const html = paragraphs
    .map((paragraph) => `<p>${DOMPurify.sanitize(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return { title, html, kind: 'Plain text' };
}
