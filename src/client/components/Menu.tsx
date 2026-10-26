import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
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
          <div key={item.id}>
            {item.separatorBefore ? <div className="my-1 h-px bg-separator" /> : null}
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
          </div>
        );
      })}
    </div>
  );
}
