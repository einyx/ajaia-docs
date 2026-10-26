import { useEffect, useRef, useState } from 'react';
import { Trash, X } from '@phosphor-icons/react';
import type { DocumentDetail, PublicUser, ShareEntry, ShareRole } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';
import { Avatar } from './Avatar.tsx';

interface ShareDialogProps {
  doc: DocumentDetail;
  onClose: () => void;
}

function SegmentedRole({
  value,
  disabled,
  onChange,
  label,
}: {
  value: ShareRole;
  disabled?: boolean;
  onChange: (role: ShareRole) => void;
  label: string;
}) {
  const options: { role: ShareRole; text: string }[] = [
    { role: 'editor', text: 'Can edit' },
    { role: 'viewer', text: 'Can view' },
  ];

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-control bg-fill-tertiary p-0.5">
      {options.map((option) => {
        const active = option.role === value;
        return (
          <button
            key={option.role}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.role)}
            className={`rounded-[6px] px-2 py-1 text-caption font-medium transition disabled:opacity-50 ${
              active
                ? 'bg-bg-primary text-label-primary shadow-sm'
                : 'text-label-secondary hover:text-label-primary'
            }`}
          >
            {option.text}
          </button>
        );
      })}
    </div>
  );
}

export function ShareDialog({ doc, onClose }: ShareDialogProps) {
  const [owner, setOwner] = useState<PublicUser | null>(null);
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('editor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isOwner = doc.role === 'owner';

  // Focus the close button on open, hand focus back to the trigger on close.
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => trigger?.focus();
  }, []);

  // Keep Tab inside the dialog while it is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ];
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    api
      .listShares(doc.id)
      .then((data) => {
        if (cancelled) return;
        setOwner(data.owner);
        setShares(data.shares);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.addShare(doc.id, { email: email.trim(), role });
      setShares(data.shares);
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not share that document.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: number, nextRole: ShareRole) {
    const target = shares.find((share) => share.user.id === userId);
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.addShare(doc.id, { email: target.user.email, role: nextRole });
      setShares(data.shares);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update access.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: number) {
    setBusy(true);
    setError(null);
    try {
      const data = await api.removeShare(doc.id, userId);
      setShares(data.shares);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove access.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/25 px-4 py-12 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${doc.title}`}
        className="glass dialog-enter w-full max-w-lg overflow-hidden rounded-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-headline font-semibold text-label-primary">Share “{doc.title}”</h2>
            <p className="mt-0.5 text-subhead text-label-secondary">
              {isOwner ? 'Invite people and choose what they can do.' : 'Only the owner can change access.'}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hit-target -mr-1 flex h-8 w-8 items-center justify-center rounded-control text-label-secondary transition hover:bg-fill-tertiary hover:text-label-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-4">
          <h3 className="pb-1.5 text-[13px] font-semibold text-label-secondary">People with access</h3>

          <div className="surface-grouped divide-y divide-separator">
            {owner ? (
              <div className="flex items-center gap-3 px-3 py-2">
                <Avatar name={owner.name} color={owner.color} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-label-primary">
                    {owner.name} <span className="font-normal text-label-secondary">(you)</span>
                  </p>
                  <p className="truncate text-caption text-label-secondary">{owner.email}</p>
                </div>
                <span className="shrink-0 rounded-full bg-fill-tertiary px-2 py-0.5 text-caption font-medium text-label-secondary">
                  Owner
                </span>
              </div>
            ) : null}

            {shares.map((share) => (
              <div key={share.user.id} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={share.user.name} color={share.user.color} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-label-primary">{share.user.name}</p>
                  <p className="truncate text-caption text-label-secondary">{share.user.email}</p>
                </div>
                {isOwner ? (
                  <>
                    <SegmentedRole
                      value={share.role}
                      disabled={busy}
                      label={`Access level for ${share.user.name}`}
                      onChange={(next) => changeRole(share.user.id, next)}
                    />
                    <button
                      type="button"
                      onClick={() => remove(share.user.id)}
                      disabled={busy}
                      aria-label={`Remove access for ${share.user.name}`}
                      className="hit-target flex h-8 w-8 items-center justify-center rounded-control text-label-secondary transition hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash size={17} />
                    </button>
                  </>
                ) : (
                  <span className="shrink-0 rounded-full bg-fill-tertiary px-2 py-0.5 text-caption font-medium text-label-secondary">
                    {share.role === 'editor' ? 'Can edit' : 'Can view'}
                  </span>
                )}
              </div>
            ))}

            {!loaded ? <p className="px-3 py-3 text-[15px] text-label-secondary">Loading access…</p> : null}
            {loaded && !shares.length ? (
              <p className="px-3 py-3 text-[15px] text-label-secondary">Not shared with anyone yet.</p>
            ) : null}
          </div>
        </div>

        {isOwner ? (
          <form
            onSubmit={invite}
            className="flex flex-wrap items-center gap-2 border-t border-separator bg-fill-tertiary/60 px-5 py-3"
          >
            <label htmlFor="invite-email" className="sr-only">
              Email address
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="maya@ajaia.dev"
              className="min-w-0 flex-1 rounded-control bg-bg-primary px-2.5 py-1.5 text-[15px] text-label-primary outline-none placeholder:text-label-tertiary focus:ring-2 focus:ring-accent/30"
            />
            <SegmentedRole
              value={role}
              disabled={busy}
              label="Access level for the new person"
              onChange={setRole}
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="rounded-control bg-accent px-3 py-1.5 text-[15px] font-medium text-white transition hover:bg-accent-pressed disabled:opacity-50"
            >
              Invite
            </button>
          </form>
        ) : null}

        {error ? (
          <p role="alert" className="border-t border-separator bg-destructive/10 px-5 py-2.5 text-subhead text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
