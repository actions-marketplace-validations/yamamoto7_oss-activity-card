import { escapeXml as x, textWidth, truncate, wrap } from "./text.ts";
import type { CardView, PullRequest, ViewOwner } from "./types.ts";

export interface Theme {
  bg: string;
  border: string;
  fg: string;
  muted: string;
  title: string;
  merged: string;
  star: string;
  add: string;
  del: string;
  featuredBg: string;
}

// GitHub Primer colors, so the card sits naturally next to the rest of a profile.
export const THEMES = {
  light: {
    bg: "#ffffff", border: "#d0d7de", fg: "#1f2328", muted: "#59636e", title: "#0969da",
    merged: "#8250df", star: "#9a6700", add: "#1a7f37", del: "#cf222e", featuredBg: "#f6f8fa",
  },
  dark: {
    bg: "#0d1117", border: "#30363d", fg: "#e6edf3", muted: "#9198a1", title: "#4493f8",
    merged: "#ab7df8", star: "#d29922", add: "#3fb950", del: "#f85149", featuredBg: "#151b23",
  },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

export interface RenderOptions {
  theme: Theme;
  /** avatarUrl -> data: URI. Missing entries fall back to an initial on a colored tile. */
  avatars?: Map<string, string>;
}

const W = 495;
const PAD = 22;
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji'`;

// Octicons (MIT, GitHub Inc.), 16px grid.
const ICON = {
  merge:
    "M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z",
  pin:
    "m11.294.984 3.722 3.722a1.75 1.75 0 0 1-.504 2.826l-1.327.613a3.089 3.089 0 0 0-1.707 2.084l-.584 2.454c-.317 1.332-1.972 1.8-2.94.832L5.75 11.311 1.78 15.28a.749.749 0 1 1-1.06-1.06l3.969-3.97-2.204-2.204c-.968-.968-.5-2.623.832-2.94l2.454-.584a3.08 3.08 0 0 0 2.084-1.707l.613-1.327a1.75 1.75 0 0 1 2.826-.504Z",
  repo:
    "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
};

const icon = (d: string, px: number, py: number, size: number, cls: string) =>
  `<path class="${cls}" transform="translate(${px} ${py}) scale(${size / 16})" d="${d}"/>`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const TILE_COLORS = ["#0969da", "#8250df", "#bf3989", "#cf222e", "#bc4c00", "#9a6700", "#1a7f37", "#1b7c83"];
function tileColor(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length]!;
}

export function formatMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m! - 1]} ${y}`;
}

interface AvatarOwner {
  login: string;
  type: string;
  avatarUrl: string;
}

/** Draws an avatar clipped to GitHub's shapes: rounded square for organizations, circle for users. */
function avatarRenderer(defs: string[], avatars: Map<string, string>) {
  let clipId = 0;
  return (owner: AvatarOwner, ax: number, ay: number, size = 20) => {
    const id = `c${clipId++}`;
    const shape =
      owner.type === "User"
        ? `<circle cx="${ax + size / 2}" cy="${ay + size / 2}" r="${size / 2}"/>`
        : `<rect x="${ax}" y="${ay}" width="${size}" height="${size}" rx="${size / 4}"/>`;
    defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
    const data = avatars.get(owner.avatarUrl);
    const fill = data
      ? `<image href="${data}" x="${ax}" y="${ay}" width="${size}" height="${size}" clip-path="url(#${id})"/>`
      : `<g clip-path="url(#${id})"><rect x="${ax}" y="${ay}" width="${size}" height="${size}" fill="${tileColor(owner.login)}"/>` +
        `<text x="${ax + size / 2}" y="${ay + size * 0.7}" text-anchor="middle" class="ini" style="font-size:${size * 0.5}px">${x((owner.login[0] ?? "?").toUpperCase())}</text></g>`;
    return fill + shape.replace("/>", ` class="ring"/>`);
  };
}

export function renderCard(view: CardView, { theme: t, avatars = new Map() }: RenderOptions): string {
  const out: string[] = [];
  const defs: string[] = [];
  let y = 0;

  const avatar = avatarRenderer(defs, avatars);

  const meta = (pr: PullRequest, label: string, mx: number, my: number) =>
    `<text x="${mx}" y="${my}" class="meta">${x(label)}` +
    `<tspan class="add" dx="8">+${pr.additions.toLocaleString("en-US")}</tspan>` +
    `<tspan class="del" dx="8">−${pr.deletions.toLocaleString("en-US")}</tspan></text>`;

  /* ---------- header ---------- */
  const sub = `${plural(view.totalPrs, "merged PR")} · ${plural(view.totalOwners, "owner")}`;
  const subW = textWidth(sub, 12);
  out.push(`<text x="${PAD}" y="34" class="title">${x(truncate(view.title, W - PAD * 2 - subW - 14, 16, true))}</text>`);
  out.push(`<text x="${W - PAD}" y="34" class="sub" text-anchor="end">${x(sub)}</text>`);
  y = 50;

  /* ---------- featured ---------- */
  if (view.featured.length) {
    const bx = 16;
    const bw = W - 32;
    const top = y;
    const inner: string[] = [];
    inner.push(icon(ICON.pin, bx + 14, y + 10, 12, "star"));
    inner.push(`<text x="${bx + 31}" y="${y + 20}" class="flabel">FEATURED</text>`);
    y += 26;
    view.featured.forEach((f, i) => {
      if (i > 0) inner.push(`<line x1="${bx + 14}" x2="${bx + bw - 14}" y1="${y}" y2="${y}" class="rule"/>`);
      const tx = bx + 44;
      const tw = bw - 44 - 14;
      inner.push(avatar({ login: f.pr.owner, type: f.pr.ownerType, avatarUrl: f.pr.avatarUrl }, bx + 14, y + 10));
      inner.push(`<text x="${tx}" y="${y + 23}" class="ftitle">${x(truncate(f.pr.title, tw, 14, true))}</text>`);
      let by = y + 23;
      for (const line of f.note ? wrap(f.note, tw, 12.5, 2) : []) {
        by += 17;
        inner.push(`<text x="${tx}" y="${by}" class="note">${x(line)}</text>`);
      }
      by += 17;
      inner.push(meta(f.pr, `${f.pr.owner}/${f.pr.repo}#${f.pr.number}`, tx, by));
      y = by + 13;
    });
    y += 2;
    out.push(`<rect x="${bx + 0.5}" y="${top + 0.5}" width="${bw - 1}" height="${y - top - 1}" rx="6" class="fbox"/>`);
    out.push(...inner);
    y += 6;
  }

  /* ---------- groups ---------- */
  const trunk = (from: number, to: number, tx: number) =>
    `<line x1="${tx}" x2="${tx}" y1="${from}" y2="${to}" class="rule"/>`;

  const items = (list: PullRequest[], indent: number, label: (pr: PullRequest) => string, trunks: number[]) => {
    for (const pr of list) {
      for (const tx of trunks) out.push(trunk(y, y + 48, tx));
      const ix = PAD + indent;
      out.push(icon(ICON.merge, ix, y + 8, 14, "merged"));
      const tx = ix + 24;
      out.push(`<text x="${tx}" y="${y + 20}" class="ptitle">${x(truncate(pr.title, W - PAD - tx, 14))}</text>`);
      out.push(meta(pr, label(pr), tx, y + 37));
      y += 48;
    }
  };
  const more = (n: number, indent: number, trunks: number[]) => {
    if (n <= 0) return;
    for (const tx of trunks) out.push(trunk(y, y + 20, tx));
    out.push(`<text x="${PAD + indent + 24}" y="${y + 14}" class="meta">+${n} more</text>`);
    y += 20;
  };

  y += 2;
  view.owners.forEach((o: ViewOwner) => {
    out.push(avatar(o, PAD, y + 10));
    const count = plural(o.total, "PR");
    out.push(`<text x="${PAD + 28}" y="${y + 25}" class="owner">${x(truncate(o.login, W - PAD * 2 - 28 - textWidth(count, 12) - 12, 14, true))}</text>`);
    out.push(`<text x="${W - PAD}" y="${y + 25}" class="sub" text-anchor="end">${count}</text>`);
    y += 34;
    const t1 = PAD + 9.5;
    if (o.repos) {
      for (const r of o.repos) {
        out.push(trunk(y, y + 26, t1));
        out.push(icon(ICON.repo, PAD + 28, y + 7, 13, "mutedfill"));
        out.push(`<text x="${PAD + 46}" y="${y + 19}" class="repo">${x(r.name)}<tspan class="sub" dx="6">· ${plural(r.total, "PR")}</tspan></text>`);
        y += 26;
        const t2 = PAD + 34.5;
        items(r.items, 48, (pr) => `#${pr.number}`, [t1, t2]);
        more(r.hidden, 48, [t1, t2]);
      }
    } else {
      items(o.items ?? [], 28, (pr) => `${pr.repo}#${pr.number}`, [t1]);
      more(o.hidden, 28, [t1]);
    }
    y += 4;
  });

  if (!view.owners.length && !view.featured.length) {
    out.push(`<text x="${PAD}" y="${y + 18}" class="sub">No merged pull requests to show yet.</text>`);
    y += 30;
  }

  /* ---------- footer ---------- */
  if (view.cutOwners || view.since) {
    y += 4;
    out.push(`<line x1="${PAD}" x2="${W - PAD}" y1="${y}" y2="${y}" class="rule"/>`);
    if (view.cutOwners) {
      out.push(`<text x="${PAD}" y="${y + 21}" class="sub">+${plural(view.cutOwners, "more owner")} · ${plural(view.cutPrs, "PR")}</text>`);
    }
    if (view.since) {
      out.push(`<text x="${W - PAD}" y="${y + 21}" class="sub" text-anchor="end">Since ${formatMonth(view.since)}</text>`);
    }
    y += 30;
  }
  y += 10;

  const H = Math.ceil(y);
  const css = [
    `text{font-family:${FONT};fill:${t.fg}}`,
    `.title{font-size:16px;font-weight:600;fill:${t.title}}`,
    `.sub,.meta{font-size:12px;fill:${t.muted}}`,
    `.flabel{font-size:11px;font-weight:600;letter-spacing:.04em;fill:${t.star}}`,
    `.ftitle{font-size:14px;font-weight:600}`,
    `.note{font-size:12.5px;opacity:.85}`,
    `.ptitle{font-size:14px}`,
    `.owner{font-size:14px;font-weight:600}`,
    `.repo{font-size:13px;font-weight:600}`,
    `.add{fill:${t.add}}.del{fill:${t.del}}`,
    `.merged{fill:${t.merged}}.star{fill:${t.star}}.mutedfill{fill:${t.muted}}`,
    `.ini{fill:#fff;font-weight:700}`,
    `.rule{stroke:${t.border};stroke-width:1}`,
    `.ring{fill:none;stroke:${t.border};stroke-width:1;opacity:.6}`,
    `.fbox{fill:${t.featuredBg};stroke:${t.border}}`,
  ].join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t">`,
    `<title id="t">${x(`${view.title}: ${sub}`)}</title>`,
    `<style>${css}</style>`,
    `<defs>${defs.join("")}</defs>`,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="${t.bg}" stroke="${t.border}"/>`,
    ...out,
    `</svg>`,
    "",
  ].join("\n");
}

/**
 * One chip per owner (avatar, name, PR count), wrapping into rows. No frame or background,
 * so it sits on the README like a row of badges.
 */
export function renderCompact(view: CardView, { theme: t, avatars = new Map() }: RenderOptions, maxWidth = 495): string {
  const defs: string[] = [];
  const avatar = avatarRenderer(defs, avatars);
  const H = 28;
  const GAP = 8;

  const chips = view.owners.map((o) => {
    const count = String(o.total);
    const w = Math.ceil(4 + 20 + 8 + textWidth(o.login, 14) + 8 + textWidth(count, 14, true) + 12);
    return { w, draw: (cx: number, cy: number) =>
      `<rect x="${cx + 0.5}" y="${cy + 0.5}" width="${w - 1}" height="${H - 1}" rx="${H / 2}" class="chip"/>` +
      avatar(o, cx + 4, cy + 4) +
      `<text x="${cx + 32}" y="${cy + 19}" class="name">${x(o.login)}<tspan class="count" dx="8">${count}</tspan></text>` };
  });
  if (view.cutOwners) {
    const label = `+${view.cutOwners} more`;
    const w = Math.ceil(12 + textWidth(label, 13) + 12);
    chips.push({ w, draw: (cx, cy) =>
      `<rect x="${cx + 0.5}" y="${cy + 0.5}" width="${w - 1}" height="${H - 1}" rx="${H / 2}" class="chip more"/>` +
      `<text x="${cx + 12}" y="${cy + 18.5}" class="morelabel">${label}</text>` });
  }
  if (!chips.length) {
    const label = "No merged pull requests to show yet.";
    chips.push({ w: Math.ceil(textWidth(label, 13)), draw: (cx, cy) => `<text x="${cx}" y="${cy + 18.5}" class="morelabel">${label}</text>` });
  }

  const out: string[] = [];
  let cx = 1;
  let cy = 1;
  let width = 0;
  for (const chip of chips) {
    if (cx > 1 && cx + chip.w > maxWidth - 1) {
      cx = 1;
      cy += H + GAP;
    }
    out.push(chip.draw(cx, cy));
    width = Math.max(width, cx + chip.w);
    cx += chip.w + GAP;
  }
  const W = Math.ceil(width + 1);
  const totalH = cy + H + 1;

  const css = [
    `text{font-family:${FONT};fill:${t.fg}}`,
    `.name{font-size:14px}`,
    `.count{font-weight:600;fill:${t.merged}}`,
    `.morelabel{font-size:13px;fill:${t.muted}}`,
    `.chip{fill:${t.bg};stroke:${t.border}}`,
    `.chip.more{fill:none;stroke-dasharray:3 3}`,
    `.ini{fill:#fff;font-weight:700}`,
    `.ring{fill:none;stroke:${t.border};stroke-width:1;opacity:.6}`,
  ].join("");
  const label = `${view.title}: ${view.owners.map((o) => `${o.login} ${o.total}`).join(", ")}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" role="img" aria-labelledby="t">`,
    `<title id="t">${x(label)}</title>`,
    `<style>${css}</style>`,
    `<defs>${defs.join("")}</defs>`,
    ...out,
    `</svg>`,
    "",
  ].join("\n");
}
