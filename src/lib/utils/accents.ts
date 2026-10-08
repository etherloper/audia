export type AccentId = "default" | "ember" | "moss" | "ocean" | "violet" | "rose";

export interface AccentPreset {
  id: AccentId;
  label: string;
  /** Overrides for the --color-accent-* theme variables */
  shades: { 300: string; 400: string; 500: string; 600: string };
  /** Text/icon color on accent-filled surfaces (--color-accent-fg) */
  fg: string;
}

/**
 * The "default" preset follows the theme: black in light mode, white in
 * dark mode. Those values live as stylesheet defaults in app.css; applyAccent
 * clears the inline overrides for it rather than writing these shades (which
 * are only used to render its swatch in light mode).
 */
export const ACCENTS: AccentPreset[] = [
  {
    id: "default",
    label: "Default",
    shades: { 300: "#d4d4d4", 400: "#404040", 500: "#171717", 600: "#0a0a0a" },
    fg: "#ffffff",
  },
  {
    id: "ember",
    label: "Ember",
    shades: { 300: "#fbc4a1", 400: "#f59e63", 500: "#ed7d3a", 600: "#d96524" },
    fg: "#000000",
  },
  {
    id: "moss",
    label: "Moss",
    shades: { 300: "#9ae6b4", 400: "#3fcf6e", 500: "#1db954", 600: "#169c46" },
    fg: "#000000",
  },
  {
    id: "ocean",
    label: "Ocean",
    shades: { 300: "#a5d8ff", 400: "#66b8f8", 500: "#3ba3f5", 600: "#2386d9" },
    fg: "#000000",
  },
  {
    id: "violet",
    label: "Violet",
    shades: { 300: "#d0bcff", 400: "#b195f7", 500: "#9a76f0", 600: "#7f57d9" },
    fg: "#000000",
  },
  {
    id: "rose",
    label: "Rose",
    shades: { 300: "#ffb8c9", 400: "#fb87a2", 500: "#f25c81", 600: "#d94168" },
    fg: "#000000",
  },
];

export const DEFAULT_ACCENT: AccentId = "default";

export function isAccentId(v: string | null): v is AccentId {
  return ACCENTS.some((a) => a.id === v);
}
