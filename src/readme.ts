import { escapeXml as esc } from "./text.ts";

export const START = "<!-- oss-card:start -->";
export const END = "<!-- oss-card:end -->";

export interface LinkedSlice {
  /** null for rows without a link (header, "+N more", footer). */
  href: string | null;
  label: string;
  /** Paths relative to the README. */
  light: string;
  dark: string;
}

const WIDTH = 495;

/**
 * HTML for the README: one linked <picture> per slice.
 * Kept on consecutive lines with no blank line, so Markdown treats it as one HTML block.
 *
 * Each image floats left (align="left") instead of sitting in a line of text. A line is at least
 * one text line high, so when a narrow screen shrinks the card, short rows would leave gaps.
 * Floats have no line, so the rows touch at any width. GitHub's max-width: 100% shrinks every row
 * by the same ratio, and there is no height attribute, so each keeps its aspect ratio.
 * A float is 515px wide with GitHub's padding, so two never fit side by side in a README column.
 * The final <br clear="all"> keeps what follows the card below it.
 */
export function readmeBlock(slices: LinkedSlice[]): string {
  const rows = slices.map((s) => {
    const picture =
      `<picture>` +
      `<source media="(prefers-color-scheme: dark)" srcset="${esc(s.dark)}">` +
      `<img src="${esc(s.light)}" alt="${esc(s.label)}" width="${WIDTH}" align="left">` +
      `</picture>`;
    return s.href ? `<a href="${esc(s.href)}" title="${esc(s.label)}">${picture}</a>` : picture;
  });
  return ["<div>", ...rows, `<br clear="all">`, "</div>"].join("\n");
}

/** Replaces whatever is between the markers. Returns null when the markers are missing or out of order. */
export function replaceBlock(readme: string, block: string): string | null {
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s === -1 || e === -1 || e < s) return null;
  return `${readme.slice(0, s + START.length)}\n${block}\n${readme.slice(e)}`;
}
