import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TurndownService from 'turndown';
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  CaretDown,
  ClockCounterClockwise,
  Code,
  DotsThree,
  DownloadSimple,
  Eraser,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Quotes,
  TextAa,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  Trash,
  UserPlus,
} from '@phosphor-icons/react';
import type { DocumentDetail, Role } from '../../shared/types.ts';
import { Menu, type IconComponent } from './Menu.tsx';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface EditorPaneProps {
  doc: DocumentDetail;
  saveState: SaveState;
  onContentChange: (content: string, plainText: string) => void;
  onTitleChange: (title: string) => void;
  onShare: () => void;
  onDelete: () => void;
  onExport: (filename: string, contents: string, mime: string) => void;
  onVersionHistory: () => void;
}

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };

function ToolButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: IconComponent;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`hit-target flex h-8 w-8 items-center justify-center rounded-control transition disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? 'bg-accent-tint text-accent' : 'text-label-secondary hover:bg-fill-tertiary hover:text-label-primary'
      }`}
    >
      <Icon size={19} weight={active ? 'bold' : 'regular'} />
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-separator" />;
}

export function EditorPane({
  doc,
  saveState,
  onContentChange,
  onTitleChange,
  onShare,
  onDelete,
  onExport,
  onVersionHistory,
}: EditorPaneProps) {
  const [title, setTitle] = useState(doc.title);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [formatOpen, setFormatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const loadedId = useRef<string | null>(null);
  const loadedContent = useRef<string | null>(null);

  const readOnly = doc.role === 'viewer';

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Placeholder.configure({
        placeholder: 'Start writing — or import a .md, .txt or .docx file to begin.',
      }),
    ],
    content: '',
    editable: !readOnly,
    onUpdate: ({ editor: instance }) => onContentChange(instance.getHTML(), instance.getText()),
  });

  useEffect(() => {
    if (!editor || !doc) return;
    // Reload on a different document, or when the same document arrives with
    // different content — that is how a restored version reaches the editor.
    if (loadedId.current !== doc.id || loadedContent.current !== doc.content) {
      loadedId.current = doc.id;
      loadedContent.current = doc.content;
      editor.commands.setContent(doc.content || '', { emitUpdate: false });
    }
  }, [editor, doc]);

  useEffect(() => {
    setTitle(doc.title);
  }, [doc.id, doc.title]);

  useEffect(() => {
    // TipTap v3 emits an `update` event from setEditable() unless told not to —
    // without this a viewer would trigger a (rejected) save on every document open.
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  const blockLabel = editor?.isActive('heading', { level: 1 })
    ? 'Heading 1'
    : editor?.isActive('heading', { level: 2 })
      ? 'Heading 2'
      : editor?.isActive('heading', { level: 3 })
        ? 'Heading 3'
        : 'Body';

  function openLinkEditor() {
    setLinkValue(editor?.getAttributes('link').href ?? '');
    setLinkOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    const href = linkValue.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setLinkOpen(false);
  }

  function exportMarkdown() {
    if (!editor) return;
    const markdown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' }).turndown(editor.getHTML());
    onExport(`${doc.title || 'document'}.md`, markdown, 'text/markdown');
  }

  function exportText() {
    if (!editor) return;
    onExport(`${doc.title || 'document'}.txt`, editor.getText(), 'text/plain');
  }

  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'error'
          ? 'Save failed'
          : '';

  return (
    <div className="flex h-full flex-col">
      <div className="px-2.5 pt-2.5">
        <div className="glass rounded-panel">
          {/* Left padding on narrow screens leaves room for the floating nav button. */}
          <header className="flex items-center gap-2 py-2 pl-12 pr-3 md:pl-3 md:pr-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                const next = title.trim() || 'Untitled document';
                if (next !== doc.title) onTitleChange(next);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              aria-label="Document title"
              readOnly={readOnly}
              className="min-w-0 flex-1 truncate bg-transparent text-title-3 font-semibold tracking-tight text-label-primary outline-none"
            />

            <span className="hidden rounded-full bg-fill-tertiary px-2 py-0.5 text-caption font-medium text-label-secondary sm:inline">
              {ROLE_LABEL[doc.role]}
            </span>
            <span
              aria-live="polite"
              className={`min-w-16 text-right text-caption ${
                saveState === 'error' ? 'text-destructive' : 'text-label-secondary'
              }`}
            >
              {saveLabel}
            </span>

            <button
              type="button"
              onClick={onShare}
              aria-haspopup="dialog"
              className="flex items-center gap-1.5 rounded-full border border-separator px-3 py-1.5 text-[15px] font-medium text-label-primary transition hover:bg-fill-tertiary"
            >
              <UserPlus size={16} />
              Share
            </button>

            <div className="relative">
              <button
                type="button"
                aria-label="Document menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="hit-target flex h-8 w-8 items-center justify-center rounded-control text-label-secondary transition hover:bg-fill-tertiary hover:text-label-primary"
              >
                <DotsThree size={20} weight="bold" />
              </button>
              {menuOpen ? (
                <Menu
                  label="Document menu"
                  align="right"
                  onClose={() => setMenuOpen(false)}
                  items={[
                    { id: 'history', label: 'Version history', icon: ClockCounterClockwise, onSelect: onVersionHistory },
                    { id: 'md', label: 'Export as Markdown', icon: DownloadSimple, onSelect: exportMarkdown },
                    { id: 'txt', label: 'Export as plain text', icon: DownloadSimple, onSelect: exportText },
                    ...(doc.role === 'owner'
                      ? [
                          {
                            id: 'sep',
                            label: '',
                            separatorBefore: true,
                            onSelect: () => {},
                          },
                          {
                            id: 'delete',
                            label: 'Delete document',
                            icon: Trash,
                            destructive: true,
                            onSelect: onDelete,
                          },
                        ]
                      : []),
                  ]}
                />
              ) : null}
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-0.5 border-t border-separator px-2 py-1">
            <ToolButton
              label="Bold (Ctrl+B)"
              icon={TextB}
              active={editor?.isActive('bold')}
              disabled={readOnly}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            />
            <ToolButton
              label="Italic (Ctrl+I)"
              icon={TextItalic}
              active={editor?.isActive('italic')}
              disabled={readOnly}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            />
            <ToolButton
              label="Underline (Ctrl+U)"
              icon={TextUnderline}
              active={editor?.isActive('underline')}
              disabled={readOnly}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            />
            <ToolButton
              label="Strikethrough"
              icon={TextStrikethrough}
              active={editor?.isActive('strike')}
              disabled={readOnly}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            />

            <Divider />

            <div className="relative">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setFormatOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={formatOpen}
                className="hit-target flex h-8 items-center gap-1 rounded-control px-2 text-[15px] font-medium text-label-secondary transition hover:bg-fill-tertiary hover:text-label-primary disabled:opacity-30"
              >
                <TextAa size={18} />
                {blockLabel}
                <CaretDown size={12} weight="bold" />
              </button>
              {formatOpen ? (
                <Menu
                  label="Text style"
                  onClose={() => setFormatOpen(false)}
                  items={[
                    {
                      id: 'p',
                      label: 'Body',
                      icon: TextAa,
                      onSelect: () => editor?.chain().focus().setParagraph().run(),
                    },
                    {
                      id: 'h1',
                      label: 'Heading 1',
                      icon: TextHOne,
                      onSelect: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
                    },
                    {
                      id: 'h2',
                      label: 'Heading 2',
                      icon: TextHTwo,
                      onSelect: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
                    },
                    {
                      id: 'h3',
                      label: 'Heading 3',
                      icon: TextHThree,
                      onSelect: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
                    },
                  ]}
                />
              ) : null}
            </div>

            <Divider />

            <ToolButton
              label="Bulleted list"
              icon={ListBullets}
              active={editor?.isActive('bulletList')}
              disabled={readOnly}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            />
            <ToolButton
              label="Numbered list"
              icon={ListNumbers}
              active={editor?.isActive('orderedList')}
              disabled={readOnly}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            />
            <ToolButton
              label="Block quote"
              icon={Quotes}
              active={editor?.isActive('blockquote')}
              disabled={readOnly}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            />
            <ToolButton
              label="Code block"
              icon={Code}
              active={editor?.isActive('codeBlock')}
              disabled={readOnly}
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            />

            <Divider />

            <ToolButton label="Add link" icon={LinkSimple} active={editor?.isActive('link')} disabled={readOnly} onClick={openLinkEditor} />
            <ToolButton
              label="Clear formatting"
              icon={Eraser}
              disabled={readOnly}
              onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}
            />

            <Divider />

            <ToolButton
              label="Undo"
              icon={ArrowUUpLeft}
              disabled={readOnly || !editor?.can().undo()}
              onClick={() => editor?.chain().focus().undo().run()}
            />
            <ToolButton
              label="Redo"
              icon={ArrowUUpRight}
              disabled={readOnly || !editor?.can().redo()}
              onClick={() => editor?.chain().focus().redo().run()}
            />
          </div>

          {linkOpen ? (
            <div className="flex items-center gap-2 border-t border-separator px-3 py-2">
              <input
                autoFocus
                value={linkValue}
                onChange={(event) => setLinkValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyLink();
                  if (event.key === 'Escape') setLinkOpen(false);
                }}
                placeholder="https://example.com"
                aria-label="Link address"
                className="min-w-0 flex-1 rounded-control bg-fill-tertiary px-2.5 py-1.5 text-[15px] outline-none focus:bg-bg-primary focus:ring-2 focus:ring-accent/30"
              />
              <button
                type="button"
                onClick={applyLink}
                className="rounded-control px-2.5 py-1.5 text-[15px] font-medium text-accent transition hover:bg-fill-tertiary"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setLinkOpen(false)}
                className="rounded-control px-2.5 py-1.5 text-[15px] text-label-secondary transition hover:bg-fill-tertiary"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {readOnly ? (
        <div className="mx-2.5 mt-2.5 rounded-control border border-separator bg-bg-tertiary px-3 py-2 text-subhead text-label-secondary">
          You have view-only access. Ask the owner for edit permission to make changes.
        </div>
      ) : null}

      <div className="thin-scrollbar flex-1 overflow-y-auto px-2.5 py-2.5 sm:px-6">
        <div className="page-canvas mx-auto min-h-[70vh] w-full max-w-[720px] px-8 py-12 sm:px-14">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
