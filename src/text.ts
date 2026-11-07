export const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// SVG text has no ellipsis or wrapping, so widths are estimated per character.
// Ratios are of the font size and lean slightly wide for the system UI fonts GitHub viewers will have,
// so truncated text never overflows its column.
const NARROW = new Set("iljI.,:;'|!()[]{}` ");
const SEMI = new Set("frt-/\"*");
const WIDE = new Set("mwMW@%");

function charWidth(ch: string): number {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x1100 && (cp <= 0x115f || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd))) {
    return 1;
  }
  if (NARROW.has(ch)) return 0.3;
  if (SEMI.has(ch)) return 0.4;
  if (WIDE.has(ch)) return 0.88;
  if (/[A-Z]/.test(ch)) return 0.68;
  if (/[0-9]/.test(ch)) return 0.58;
  return 0.56;
}

export function textWidth(s: string, fontSize: number, bold = false): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch);
  return w * fontSize * (bold ? 1.05 : 1);
}

export function truncate(s: string, maxWidth: number, fontSize: number, bold = false): string {
  if (textWidth(s, fontSize, bold) <= maxWidth) return s;
  const limit = maxWidth - textWidth("…", fontSize, bold);
  let out = "";
  let w = 0;
  for (const ch of s) {
    const cw = charWidth(ch) * fontSize * (bold ? 1.05 : 1);
    if (w + cw > limit) break;
    out += ch;
    w += cw;
  }
  return out.trimEnd() + "…";
}

/** Wraps at spaces where possible, otherwise between characters (for CJK). The last line is truncated. */
export function wrap(s: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const lines: string[] = [];
  let rest = s.trim();
  while (rest && lines.length < maxLines - 1) {
    if (textWidth(rest, fontSize) <= maxWidth) break;
    let cut = 0;
    let w = 0;
    let lastSpace = -1;
    const chars = [...rest];
    for (let i = 0; i < chars.length; i++) {
      w += charWidth(chars[i]!) * fontSize;
      if (w > maxWidth) break;
      if (chars[i] === " ") lastSpace = i;
      cut = i + 1;
    }
    const at = lastSpace > 0 && lastSpace > cut * 0.5 ? lastSpace : cut;
    lines.push(chars.slice(0, at).join("").trimEnd());
    rest = chars.slice(at).join("").trimStart();
  }
  if (rest) lines.push(truncate(rest, maxWidth, fontSize));
  return lines;
}
