// DOM and colour-token helpers.

/** querySelector for elements that are known to exist in index.html. */
export const $ = <T extends Element = HTMLElement>(s: string): T => document.querySelector<T>(s)!;

/** Current value of a CSS custom property on :root (theme tokens). */
export const css = (k: string): string => getComputedStyle(document.documentElement).getPropertyValue(k).trim();

export const isDarkTheme = (): boolean =>
  document.documentElement.matches('[data-theme="dark"]') ||
  (matchMedia('(prefers-color-scheme: dark)').matches && !document.documentElement.matches('[data-theme="light"]'));
