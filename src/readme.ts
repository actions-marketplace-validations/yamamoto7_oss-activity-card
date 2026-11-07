import { escapeXml as esc } from "./text.ts";

export const START = "<!-- oss-card:start -->";
export const END = "<!-- oss-card:end -->";

export interface LinkedSlice {
  /** null for rows without a link (header, "+N more", footer). */
  href: string | null;
  label: string;
  height: number;
  /** Paths relative to the README. */
  light: string;
  dark: string;
}

const WIDTH = 495;

/**
 * HTML for the README: one linked <picture> per slice, stacked with <br>.
 * Kept on consecutive lines with no blank line, so Markdown treats it as one HTML block.
 */
export function readmeBlock(slices: LinkedSlice[]): string {
  const rows = slices.map((s) => {
    const picture =
      `<picture>` +
      `<source media="(prefers-color-scheme: dark)" srcset="${esc(s.dark)}">` +
      // align="top" drops the space a line of text keeps below its baseline, so rows touch.
      `<img src="${esc(s.light)}" alt="${esc(s.label)}" width="${WIDTH}" height="${s.height}" align="top">` +
      `</picture>`;
    return s.href ? `<a href="${esc(s.href)}" title="${esc(s.label)}">${picture}</a>` : picture;
  });
  return ["<div>", rows.join("<br>\n"), "</div>"].join("\n");
}

/** Replaces whatever is between the markers. Returns null when the markers are missing or out of order. */
export function replaceBlock(readme: string, block: string): string | null {
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s === -1 || e === -1 || e < s) return null;
  return `${readme.slice(0, s + START.length)}\n${block}\n${readme.slice(e)}`;
}
