import { useMemo, useRef, useState } from 'react';
import {
  DotsThree,
  FileText,
  MagnifyingGlass,
  Plus,
  SignOut,
  UploadSimple,
  Trash,
  PencilSimple,
} from '@phosphor-icons/react';
import type { DocumentSummary, User } from '../../shared/types.ts';
import { IMPORT_ACCEPT } from '../../shared/constants.ts';
import { relativeTime } from '../lib/format.ts';
import { Avatar } from './Avatar.tsx';
import { Menu } from './Menu.tsx';

interface SidebarProps {
  me: User;
  owned: DocumentSummary[];
  shared: DocumentSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: (file: File) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
  busy?: boolean;
}

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };

function DocumentRow({
  doc,
  active,
  shared,
  onSelect,
  onRename,
  onDelete,
}: {
  doc: DocumentSummary;
  active: boolean;
  shared: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left transition ${
          active
            ? 'bg-accent-tint text-accent'
            : 'text-label-primary hover:bg-fill-tertiary'
        }`}
      >
        <FileText size={18} className={active ? 'text-accent' : 'text-label-tertiary'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{doc.title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-caption text-label-secondary">
            {relativeTime(doc.updatedAt)}
            {shared ? (
              <span className="rounded-full bg-fill-tertiary px-1.5 py-px font-medium">
                {ROLE_LABEL[doc.role]}
              </span>
            ) : null}
          </span>
        </span>
      </button>

      {shared ? null : (
        <div className="absolute right-1.5 top-1.5">
          <button
            type="button"
            aria-label={`Actions for ${doc.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className={`rounded-control p-1 text-label-tertiary transition hover:bg-fill-tertiary hover:text-label-primary ${
              menuOpen ? 'bg-fill-tertiary text-label-primary' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
            }`}
          >
            <DotsThree size={18} weight="bold" />
          </button>
          {menuOpen ? (
            <Menu
              label={`Actions for ${doc.title}`}
              align="right"
              onClose={() => setMenuOpen(false)}
              items={[
                {
                  id: 'rename',
                  label: 'Rename',
                  icon: PencilSimple,
                  onSelect: () => {
                    const next = window.prompt('Rename document', doc.title);
                    if (next && next.trim()) onRename(next.trim());
                  },
                },
                { id: 'sep', label: '', separatorBefore: true, onSelect: () => {} },
                {
                  id: 'delete',
                  label: 'Delete',
                  icon: Trash,
                  destructive: true,
                  onSelect: onDelete,
                },
              ]}
            />
          ) : null}
        </div>
      )}
    </li>
  );
}

export function Sidebar({
  me,
  owned,
  shared,
  activeId,
  onSelect,
  onNew,
  onImport,
  onRename,
  onDelete,
  onSignOut,
  busy,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const matches = (doc: DocumentSummary) => doc.title.toLowerCase().includes(query.trim().toLowerCase());
  const ownedVisible = useMemo(() => owned.filter(matches), [owned, query]);
  const sharedVisible = useMemo(() => shared.filter(matches), [shared, query]);

  return (
    <div className="h-full p-2.5">
      <aside className="glass flex h-full flex-col overflow-hidden rounded-panel">
        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-accent text-[13px] font-bold text-white">
            A
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-label-primary">Ajaia Docs</span>
        </div>

        <div className="px-2.5 pb-1">
          <button
            type="button"
            onClick={onNew}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-control bg-accent px-3 py-2 text-[15px] font-medium text-white transition hover:bg-accent-pressed active:scale-[0.98] disabled:opacity-60"
          >
            <Plus size={16} weight="bold" />
            New document
          </button>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-control px-3 py-2 text-[15px] font-medium text-label-secondary transition hover:bg-fill-tertiary hover:text-label-primary disabled:opacity-60"
          >
            <UploadSimple size={16} />
            Import file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={IMPORT_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onImport(file);
            }}
          />
        </div>

        <div className="px-2.5 pb-1 pt-2">
          <div className="relative">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-label-tertiary"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search documents"
              className="w-full rounded-control bg-fill-tertiary py-1.5 pl-7 pr-2 text-[15px] text-label-primary outline-none transition placeholder:text-label-tertiary focus:bg-bg-primary focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>

        <nav className="thin-scrollbar flex-1 overflow-y-auto px-2.5 pb-2">
          <section>
            <h2 className="px-2.5 pb-1 pt-2 text-[13px] font-semibold text-label-secondary">
              My documents
            </h2>
            {ownedVisible.length ? (
              <ul className="space-y-0.5">
                {ownedVisible.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    active={doc.id === activeId}
                    shared={false}
                    onSelect={() => onSelect(doc.id)}
                    onRename={(title) => onRename(doc.id, title)}
                    onDelete={() => onDelete(doc.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-2.5 py-1.5 text-caption text-label-secondary">
                {owned.length ? 'No documents match that search.' : 'No documents yet — create one.'}
              </p>
            )}
          </section>

          {shared.length ? (
            <section>
              <h2 className="px-2.5 pb-1 pt-4 text-[13px] font-semibold text-label-secondary">
                Shared with me
              </h2>
              {sharedVisible.length ? (
                <ul className="space-y-0.5">
                  {sharedVisible.map((doc) => (
                    <DocumentRow
                      key={doc.id}
                      doc={doc}
                      active={doc.id === activeId}
                      shared
                      onSelect={() => onSelect(doc.id)}
                      onRename={() => {}}
                      onDelete={() => {}}
                    />
                  ))}
                </ul>
              ) : (
                <p className="px-2.5 py-1.5 text-caption text-label-secondary">
                  No shared documents match that search.
                </p>
              )}
            </section>
          ) : null}
        </nav>

        <div className="flex items-center gap-2 border-t border-separator px-3 py-2">
          <Avatar name={me.name} color={me.color} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-label-primary">{me.name}</p>
            <p className="truncate text-caption text-label-secondary">{me.email}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            title="Switch account"
            aria-label="Switch account"
            className="rounded-control p-1.5 text-label-secondary transition hover:bg-fill-tertiary hover:text-label-primary"
          >
            <SignOut size={17} />
          </button>
        </div>
      </aside>
    </div>
  );
}
