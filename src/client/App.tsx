import { useCallback, useEffect, useRef, useState } from 'react';
import { List } from '@phosphor-icons/react';
import type { DocumentDetail, DocumentSummary, Role, User } from '../shared/types.ts';
import { api, ApiError } from './api.ts';
import { isSupportedFile, parseImportFile } from './lib/import.ts';
import { EditorPane, type SaveState } from './components/EditorPane.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { ShareDialog } from './components/ShareDialog.tsx';
import { Sidebar } from './components/Sidebar.tsx';

type Phase = 'loading' | 'signed-out' | 'ready';

interface Toast {
  message: string;
  tone: 'info' | 'error';
}

export function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<User | null>(null);
  const [owned, setOwned] = useState<DocumentSummary[]>([]);
  const [shared, setShared] = useState<DocumentSummary[]>([]);
  const [active, setActive] = useState<DocumentDetail | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const pending = useRef<{ title?: string; content?: string; plainText?: string }>({});
  const saveTimer = useRef<number | undefined>(undefined);
  const activeId = useRef<string | null>(null);
  const activeRole = useRef<Role>('owner');

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const refreshList = useCallback(async () => {
    const data = await api.listDocuments();
    setOwned(data.owned);
    setShared(data.shared);
    return data;
  }, []);

  // Persist queued edits (debounced) for the active document.
  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const patch = pending.current;
    pending.current = {};
    const id = activeId.current;
    if (!id || Object.keys(patch).length === 0) return;
    // Viewers never write — the API would reject it anyway.
    if (activeRole.current === 'viewer') return;

    try {
      await api.patchDocument(id, patch);
      setSaveState('saved');
      setOwned((current) =>
        current.map((doc) =>
          doc.id === id
            ? { ...doc, title: patch.title ?? doc.title, updatedAt: Date.now() }
            : doc,
        ),
      );
      setShared((current) =>
        current.map((doc) =>
          doc.id === id
            ? { ...doc, title: patch.title ?? doc.title, updatedAt: Date.now() }
            : doc,
        ),
      );
    } catch (err) {
      setSaveState('error');
      pending.current = { ...patch, ...pending.current };
      saveTimer.current = window.setTimeout(() => void flush(), 3000);
    }
  }, []);

  const queueSave = useCallback(
    (patch: { title?: string; content?: string; plainText?: string }) => {
      pending.current = { ...pending.current, ...patch };
      setSaveState('saving');
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void flush(), 700);
    },
    [flush],
  );

  const openDocument = useCallback(
    async (id: string) => {
      await flush();
      try {
        const { document } = await api.getDocument(id);
        activeId.current = document.id;
        activeRole.current = document.role;
        setActive(document);
        setSaveState('idle');
        setNavOpen(false);
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Could not open that document.', 'error');
      }
    },
    [flush, showToast],
  );

  // Boot: restore the session from the cookie.
  useEffect(() => {
    void (async () => {
      try {
        const { user } = await api.me();
        setMe(user);
        const data = await api.listDocuments();
        setOwned(data.owned);
        setShared(data.shared);
        if (data.owned[0]) await openDocument(data.owned[0].id);
        setPhase('ready');
      } catch {
        setPhase('signed-out');
      }
    })();
  }, [openDocument]);

  // Never lose work: flush pending edits when the tab goes away.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flush]);

  async function handleNew() {
    setBusy(true);
    try {
      const { document } = await api.createDocument({ title: 'Untitled document' });
      await refreshList();
      await openDocument(document.id);
      showToast('New document created.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not create a document.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File) {
    if (!isSupportedFile(file)) {
      showToast(`“${file.name}” is not supported. Import a .md, .txt or .docx file.`, 'error');
      return;
    }

    setBusy(true);
    try {
      const parsed = await parseImportFile(file);
      const { document } = await api.createDocument({ title: parsed.title, content: parsed.html });
      await refreshList();
      await openDocument(document.id);
      showToast(`Imported ${file.name} as a ${parsed.kind.toLowerCase()} document.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not import that file.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string, title: string) {
    try {
      await api.patchDocument(id, { title });
      await refreshList();
      setActive((current) => (current && current.id === id ? { ...current, title } : current));
      showToast('Document renamed.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not rename that document.', 'error');
    }
  }

  async function handleDelete(id: string) {
    const target = [...owned, ...shared].find((doc) => doc.id === id);
    if (!target) return;
    if (!window.confirm(`Delete “${target.title}”? This cannot be undone.`)) return;

    try {
      await api.deleteDocument(id);
      const data = await refreshList();
      if (activeId.current === id) {
        activeId.current = null;
        setActive(null);
        const next = data.owned[0] ?? data.shared[0];
        if (next) await openDocument(next.id);
      }
      showToast('Document deleted.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not delete that document.', 'error');
    }
  }

  async function handleSignOut() {
    await flush();
    try {
      await api.logout();
    } catch {
      /* signing out locally is enough */
    }
    activeId.current = null;
    setActive(null);
    setOwned([]);
    setShared([]);
    setMe(null);
    setPhase('signed-out');
  }

  function handleExport(filename: string, contents: string, mime: string) {
    const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename}.`);
  }

  if (phase === 'loading') {
    return (
      <div className="app-canvas flex min-h-full items-center justify-center">
        <div className="flex items-center gap-2 text-subhead text-label-secondary">
          <span className="h-2 w-2 animate-ping rounded-full bg-accent" />
          Loading Ajaia Docs…
        </div>
      </div>
    );
  }

  if (phase === 'signed-out' || !me) {
    return (
      <LoginScreen
        onSignedIn={async (user) => {
          setMe(user);
          const data = await api.listDocuments();
          setOwned(data.owned);
          setShared(data.shared);
          if (data.owned[0]) await openDocument(data.owned[0].id);
          setPhase('ready');
        }}
      />
    );
  }

  return (
    <div className="app-canvas flex h-full">
      <div
        className={`fixed inset-0 z-20 bg-black/25 md:hidden ${navOpen ? 'block' : 'hidden'}`}
        onClick={() => setNavOpen(false)}
        aria-hidden
      />
      <div className={`${navOpen ? 'block' : 'hidden'} md:block`}>
        <Sidebar
          me={me}
          owned={owned}
          shared={shared}
          activeId={active?.id ?? null}
          onSelect={(id) => void openDocument(id)}
          onNew={() => void handleNew()}
          onImport={(file) => void handleImport(file)}
          onRename={(id, title) => void handleRename(id, title)}
          onDelete={(id) => void handleDelete(id)}
          onSignOut={() => void handleSignOut()}
          busy={busy}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open document list"
          className="hit-target glass absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-control text-label-primary md:hidden"
        >
          <List size={20} />
        </button>

        {active ? (
          <EditorPane
            doc={active}
            saveState={saveState}
            onContentChange={(content, plainText) => queueSave({ content, plainText })}
            onTitleChange={(title) => queueSave({ title })}
            onShare={() => setShareOpen(true)}
            onDelete={() => void handleDelete(active.id)}
            onExport={handleExport}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-sm text-center">
              <h2 className="text-title-2 font-semibold tracking-tight text-label-primary">
                No document selected
              </h2>
              <p className="mt-1 text-subhead text-label-secondary">
                Create a new document, import an existing file, or pick one from the list.
              </p>
              <button
                type="button"
                onClick={() => void handleNew()}
                className="mt-4 rounded-control bg-accent px-3.5 py-2 text-[15px] font-medium text-white transition hover:bg-accent-pressed"
              >
                New document
              </button>
            </div>
          </div>
        )}
      </main>

      {shareOpen && active ? <ShareDialog doc={active} onClose={() => setShareOpen(false)} /> : null}

      {toast ? (
        <div
          role="status"
          className={`glass fixed bottom-5 right-5 z-40 max-w-sm rounded-card px-4 py-3 text-subhead ${
            toast.tone === 'error' ? 'text-destructive' : 'text-label-primary'
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
