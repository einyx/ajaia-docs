import { Fragment, useEffect, useRef } from 'react';

export type IconComponent = React.ComponentType<{
  size?: number | string;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  color?: string;
  className?: string;
}>;

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconComponent;
  onSelect: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
  disabled?: boolean;
}

/** Apple-style popup menu: borderless items, hairline separators, glass surface. */
export function Menu({
  items,
  onClose,
  align = 'left',
  label,
}: {
  items: MenuItem[];
  onClose: () => void;
  align?: 'left' | 'right';
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  // Focus the first item on open, and hand focus back to the trigger on close.
  useEffect(() => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => trigger.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const buttons = [
        ...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []),
      ];
      if (!buttons.length) return;

      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : event.key === 'ArrowDown'
              ? (index + 1) % buttons.length
              : (index - 1 + buttons.length) % buttons.length;
      buttons[next].focus();
    };

    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`glass absolute z-30 min-w-48 rounded-card py-1 ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Fragment key={item.id}>
            {item.separatorBefore ? <div role="separator" className="my-1 h-px bg-separator" /> : null}
            {item.label ? (
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect();
                  onClose();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] transition disabled:opacity-40 ${
                  item.destructive
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'text-label-primary hover:bg-fill-tertiary'
                }`}
              >
                {Icon ? <Icon size={17} /> : null}
                {item.label}
              </button>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
