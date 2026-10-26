# Export as PDF — design

**Date:** 2026-10-26
**Status:** implemented

## Problem

Ajaia Docs can export a document as Markdown or plain text, but a reviewer or stakeholder
usually wants a PDF. `ARCHITECTURE.md` §8 and `SUBMISSION.md` both listed "PDF export through
the print stylesheet" as the planned next step.

## Options considered

| Option | Verdict |
| --- | --- |
| Browser print pipeline over a print stylesheet | **Chosen** — no dependencies, selectable text, real pagination, native "Save as PDF". |
| Client-side PDF library (jsPDF + html2canvas) | Rejected — rasterises the text, page breaks are hard to control, ~200 KB of dependencies. |
| Server-side PDF from the Worker | Rejected — Cloudflare Workers have no HTML→PDF renderer; it would need an external service or a headless-Chromium box. |

## Design

The `⋯` menu gains **Export as PDF**, which calls `window.print()`. A `@media print` block in
`src/client/styles.css` decides what the printed page looks like:

- the light palette is forced, because a dark-mode browser would print white text on white
  paper;
- the app chrome disappears — the sidebar, toolbar, menus, sheets and toast are `.glass` or
  `.fixed`, and the document canvas is neither;
- the editor's scroll container is un-clipped (`overflow: visible`, `height: auto`), or the PDF
  would hold one screenful;
- the page card loses its border, radius, shadow and padding;
- inverted code blocks are restyled, because browsers drop backgrounds when printing;
- headings keep the text that follows them (`break-after: avoid-page`) and blocks are not
  split across pages (`break-inside: avoid`);
- `@page { margin: 18mm }` sets the paper margins.

The document title lives in a header `<input>`, which never prints, so the PDF gets it as a
heading — but only when the body does not already open with it, so it never appears twice.

`document.title` is swapped for the document title during the print call, because browsers
name the saved file after it; the app title is restored afterwards.

Anyone with access can export, viewers included: reading is enough, and it matches the
Markdown and plain-text exports. No API, database or auth change.

## Verification

`npm run verify:pdf` (`scripts/verify-pdf-export.mjs`) starts the standalone server on a
throwaway database, drives the real UI with Playwright, and asserts:

- the `⋯` menu offers the item, clicking it calls `window.print()`, and the saved file is
  named after the document;
- in print media the sidebar and toolbar are hidden and the body prints black — in light
  *and* dark mode;
- the produced PDF (Chromium's own renderer, same print stylesheet) contains the document
  text, shows the title once, and contains no toolbar.

## Out of scope

Page numbers and headers, a cover page, a paper-size choice, a "pick your destination"
toast, server-side rendering, importing the PDF back.
