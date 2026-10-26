import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, ArrowsLeftRight, X } from '@phosphor-icons/react';
import type { DocumentDetail, VersionEntry } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { diffText, htmlToText, type DiffPart } from '../lib/diff.ts';
import { relativeTime } from '../lib/format.ts';
import { Avatar } from './Avatar.tsx';

interface VersionHistoryProps {
  doc: DocumentDetail;
  onClose: () => void;
  onRestored: (doc: DocumentDetail) => void;
}

/** The word-level diff between a snapshot and the document as it is now. */
function DiffView({ parts, loading }: { parts?: DiffPart[]; loading: boolean }) {
  if (loading) {
    return <p className="mt-2 text-caption text-label-secondary">Comparing with the current document…</p>;
  }
  if (!parts) return null;

  const added = parts.filter((part) => part.type === 'added').reduce((n, part) => n + part.text.length, 0);
  const removed = parts.filter((part) => part.type === 'removed').reduce((n, part) => n + part.text.length, 0);

  return (
    <div className="mt-2 rounded-control bg-bg-primary/60 p-2">
      <p className="mb-1 text-caption text-label-secondary">
        Changed since this version: <span className="text-success">+{added}</span>{' '}
        <span className="text-destructive">−{removed}</span> characters
      </p>
      <div className="thin-scrollbar max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-subhead">
        {parts.map((part, index) => (
          <span
            key={index}
            className={
              part.type === 'added'
                ? 'bg-success/15 text-success'
                : part.type === 'removed'
                  ? 'bg-destructive/15 text-destructive line-through'
                  : 'text-label-secondary'
            }
          >
            {part.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Snapshot history for one document: what changed, when, and who changed it. */
export function VersionHistory({ doc, onClose, onRestored }: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [diffFor, setDiffFor] = useState<number | null>(null);
  const [diffs, setDiffs] = useState<Record<number, DiffPart[]>>({});
  const [diffLoading, setDiffLoading] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const canRestore = doc.role === 'owner' || doc.role === 'editor';
  const currentText = htmlToText(doc.content);

  const load = useCallback(async () => {
    try {
      const data = await api.listVersions(doc.id);
      setVersions(data.versions);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the version history.');
    } finally {
      setLoaded(true);
    }
  }, [doc.id]);

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => trigger?.focus();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function restore(version: VersionEntry) {
    const when = relativeTime(version.createdAt);
    if (!window.confirm(`Restore the version from ${when}? The current content will be replaced.`)) return;

    setBusyId(version.id);
    setError(null);
    try {
      const { document } = await api.restoreVersion(doc.id, version.id);
      onRestored(document);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not restore that version.');
    } finally {
      setBusyId(null);
    }
  }

  /** Show what changed between a snapshot and the document as it is now. */
  async function showChanges(version: VersionEntry) {
    if (diffFor === version.id) {
      setDiffFor(null);
      return;
    }

    setDiffFor(version.id);
    setError(null);
    if (diffs[version.id]) return;

    setDiffLoading(version.id);
    try {
      const { version: full } = await api.getVersion(doc.id, version.id);
      const parts = diffText(htmlToText(full.content), currentText);
      setDiffs((current) => ({ ...current, [version.id]: parts }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not compare that version.');
      setDiffFor(null);
    } finally {
      setDiffLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/25" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Version history"
        className="glass dialog-enter flex h-full w-full max-w-sm flex-col rounded-l-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-4 pb-2 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-headline font-semibold text-label-primary">Version history</h2>
            <p className="mt-0.5 text-subhead text-label-secondary">
              {canRestore ? 'Snapshots are saved as you edit. Restore any of them.' : 'Snapshots are saved as the document is edited.'}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="hit-target -mr-1 flex h-8 w-8 items-center justify-center rounded-control text-label-secondary transition hover:bg-fill-tertiary hover:text-label-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="thin-scrollbar flex-1 overflow-y-auto px-4 pb-4">
          {!loaded ? <p className="py-3 text-[15px] text-label-secondary">Loading history…</p> : null}

          {loaded && !versions.length ? (
            <p className="py-3 text-[15px] text-label-secondary">
              No versions yet. A snapshot is saved after you edit this document.
            </p>
          ) : null}

          <ol className="space-y-2">
            {versions.map((version) => (
              <li key={version.id} className="surface-grouped rounded-card px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  {version.author ? (
                    <Avatar name={version.author.name} color={version.author.color} size={26} />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-label-primary">
                      {version.author?.name ?? 'Unknown'}
                    </p>
                    <p className="truncate text-caption text-label-secondary">{relativeTime(version.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={diffLoading !== null && diffLoading !== version.id}
                      onClick={() => void showChanges(version)}
                      aria-expanded={diffFor === version.id}
                      aria-label={`Show changes since the version from ${relativeTime(version.createdAt)}`}
                      className="flex items-center gap-1 rounded-control px-2 py-1 text-caption font-medium text-accent transition hover:bg-fill-tertiary disabled:opacity-40"
                    >
                      <ArrowsLeftRight size={14} />
                      Changes
                    </button>
                    {canRestore ? (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void restore(version)}
                        aria-label={`Restore the version from ${relativeTime(version.createdAt)}`}
                        className="flex items-center gap-1 rounded-control px-2 py-1 text-caption font-medium text-accent transition hover:bg-fill-tertiary disabled:opacity-40"
                      >
                        <ArrowCounterClockwise size={14} />
                        Restore
                      </button>
                    ) : null}
                  </div>
                </div>
                {version.excerpt ? (
                  <p className="mt-1.5 line-clamp-2 text-subhead text-label-secondary">{version.excerpt}</p>
                ) : null}
                {diffFor === version.id ? (
                  <DiffView parts={diffs[version.id]} loading={diffLoading === version.id} />
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        {error ? (
          <p role="alert" className="border-t border-separator bg-destructive/10 px-4 py-2.5 text-subhead text-destructive">
            {error}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
