// A small, consistent icon set: one stroke weight, one grid. Always decorative: the text beside an
// icon carries its meaning, so screen readers skip the icon itself.
const PATHS = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z M12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  alert: "M12 3 2 20h20L12 3z M12 10v4 M12 17h.01",
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  plus: "M12 5v14 M5 12h14",
  mobility: "M11 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M11 8v6h5l3 5 M11 11h5 M8.5 11a6 6 0 1 0 7.8 7.2",
  vision: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  hearing: "M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 0 1-7 0 M15 8.5a2.5 2.5 0 0 0-5 0v1c2 0 2 3 0 3",
  cognitive: "M12 3v18 M12 5h6l3 3-3 3h-6 M12 11H6l-3 3 3 3h6",
  general: "M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4 M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3v-5z M6 18v2 M18 18v2",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18 M6 6l12 12",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  chevron: "M9 6l6 6-6 6",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  shield: "M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3z M9 12l2 2 4-4",
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z",
  users: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-6A3.5 3.5 0 0 0 3 18.5V20 M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M21 20v-1.5a3.5 3.5 0 0 0-2.6-3.4 M15.5 4.2a3.5 3.5 0 0 1 0 6.6",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z M14 3v5h5 M9 13h6 M9 17h6",
  layers: "M12 3 3 8l9 5 9-5-9-5z M3 13l9 5 9-5",
  clipboard: "M9 3h6v3H9z M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 13l2 2 4-4",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  settings: "M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 5v4 M8 15v4",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01",
  unknown: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8 M12 17h.01",
  play: "M7 4l13 8-13 8V4z",
  exit: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z M5 11a7 7 0 0 0 14 0 M12 18v3",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : "icon"} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
