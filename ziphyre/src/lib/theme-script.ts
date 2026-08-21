/**
 * Shared with the inline <script> in layout.tsx and theme-toggle.tsx —
 * one source of truth for the storage key so they can't drift apart.
 */
export const THEME_STORAGE_KEY = "ziphyre-theme";

/**
 * Runs synchronously during HTML parsing, before first paint — this is
 * why it must be a real inline <script>, not a Client Component. See
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 * ("Themes"). A useEffect-based approach would show the wrong theme for
 * one frame on every load.
 */
export function themeInitScript(storageKey: string) {
  return `(function(){try{
    var stored = localStorage.getItem("${storageKey}");
    var dark = stored === "dark" || (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {}})()`;
}
