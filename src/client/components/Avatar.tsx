export function Avatar({
  name,
  color,
  size = 28,
  className = '',
}: {
  name: string;
  color: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ backgroundColor: color, width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials || '?'}
    </span>
  );
}
