import { ICONS, type IconName } from "./icons-data";

export function Icon({ name, size = 20, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      class="icon"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {ICONS[name].map(([d, evenOdd]) => (
        <path d={d} fill="currentColor" fill-rule={evenOdd ? "evenodd" : undefined} clip-rule={evenOdd ? "evenodd" : undefined} />
      ))}
    </svg>
  );
}
