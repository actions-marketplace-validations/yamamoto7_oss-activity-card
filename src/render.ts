import { escapeXml as x, textWidth, truncate, wrap } from "./text.ts";
import type { CardView, OwnerSummary, PullRequest, ViewOwner } from "./types.ts";

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
  star:
    "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z",
  repo:
    "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
};

const icon = (d: string, px: number, py: number, size: number, cls: string) =>
  `<path class="${cls}" transform="translate(${px} ${py}) scale(${size / 16})" d="${d}"/>`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** 950 → "950", 1234 → "1.2k", 23456 → "23.5k", 131000 → "131k", 2100000 → "2.1m" */
export function formatCount(n: number): string {
  const fmt = (v: number, unit: string) => `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`;
  if (n >= 1_000_000) return fmt(n / 1_000_000, "m");
  if (n >= 1000) return fmt(n / 1000, "k");
  return String(n);
}

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
function avatarRenderer(addDef: (def: string) => void, avatars: Map<string, string>) {
  let clipId = 0;
  return (owner: AvatarOwner, ax: number, ay: number, size = 20) => {
    const id = `c${clipId++}`;
    const shape =
      owner.type === "User"
        ? `<circle cx="${ax + size / 2}" cy="${ay + size / 2}" r="${size / 2}"/>`
        : `<rect x="${ax}" y="${ay}" width="${size}" height="${size}" rx="${size / 4}"/>`;
    addDef(`<clipPath id="${id}">${shape}</clipPath>`);
    const data = avatars.get(owner.avatarUrl);
    const fill = data
      ? `<image href="${data}" x="${ax}" y="${ay}" width="${size}" height="${size}" clip-path="url(#${id})"/>`
      : `<g clip-path="url(#${id})"><rect x="${ax}" y="${ay}" width="${size}" height="${size}" fill="${tileColor(owner.login)}"/>` +
        `<text x="${ax + size / 2}" y="${ay + size * 0.7}" text-anchor="middle" class="ini" style="font-size:${size * 0.5}px">${x((owner.login[0] ?? "?").toUpperCase())}</text></g>`;
    return fill + shape.replace("/>", ` class="ring"/>`);
  };
}

/** A horizontal band of the card. renderSlices turns each one into its own image so it can carry a link. */
export interface Segment {
  y0: number;
  y1: number;
  /** Only PR, repository and owner rows link somewhere. */
  href: string | null;
  /** Alt text and tooltip for the band. */
  label: string;
  els: string[];
  defs: string[];
}

interface Layout {
  height: number;
  segments: Segment[];
  /** Shapes spanning several bands, drawn behind every band they overlap. */
  backgrounds: { y0: number; y1: number; el: string }[];
  title: string;
}

const PROJECT_URL = "https://github.com/yamamoto7/oss-activity-card";

function layoutCard(view: CardView, avatars: Map<string, string>): Layout {
  const segments: Segment[] = [];
  const backgrounds: Layout["backgrounds"] = [];
  let y = 0;
  const start = (href: string | null, label: string) => {
    const prev = segments.at(-1);
    if (prev) prev.y1 = y;
    segments.push({ y0: y, y1: y, href, label, els: [], defs: [] });
  };
  const current = () => segments.at(-1)!;
  const emit = (...els: string[]) => current().els.push(...els);
  const avatar = avatarRenderer((def) => current().defs.push(def), avatars);
  const prLabel = (pr: PullRequest) => `${pr.owner}/${pr.repo}#${pr.number}: ${pr.title}`;

  const meta = (pr: PullRequest, label: string, mx: number, my: number) =>
    // The PR reference is link-colored so linked rows read as clickable (hover effects can't work in a README image).
    `<text x="${mx}" y="${my}" class="meta"><tspan class="ref">${x(label)}</tspan>` +
    `<tspan class="add" dx="8">+${pr.additions.toLocaleString("en-US")}</tspan>` +
    `<tspan class="del" dx="8">−${pr.deletions.toLocaleString("en-US")}</tspan></text>`;

  /* ---------- header ---------- */
  const sub = `${plural(view.totalPrs, "merged PR")} · ${plural(view.totalOwners, "owner")}`;
  const subW = textWidth(sub, 12);
  // The header links to this project too, unless credit: false.
  start(view.credit ? PROJECT_URL : null, `${view.title}: ${sub}`);
  emit(`<text x="${PAD}" y="34" class="title">${x(truncate(view.title, W - PAD * 2 - subW - 14, 16, true))}</text>`);
  emit(`<text x="${W - PAD}" y="34" class="sub" text-anchor="end">${x(sub)}</text>`);
  y = 50;

  /* ---------- featured ---------- */
  if (view.featured.length) {
    const bx = 16;
    const bw = W - 32;
    const top = y;
    emit(icon(ICON.pin, bx + 14, y + 10, 12, "star"));
    emit(`<text x="${bx + 31}" y="${y + 20}" class="flabel">FEATURED</text>`);
    y += 26;
    view.featured.forEach((f, i) => {
      start(f.pr.url, `Featured: ${prLabel(f.pr)}`);
      if (i > 0) emit(`<line x1="${bx + 14}" x2="${bx + bw - 14}" y1="${y}" y2="${y}" class="rule"/>`);
      const tx = bx + 44;
      const tw = bw - 44 - 14;
      emit(avatar({ login: f.pr.owner, type: f.pr.ownerType, avatarUrl: f.pr.avatarUrl }, bx + 14, y + 10));
      emit(`<text x="${tx}" y="${y + 23}" class="ftitle">${x(truncate(f.pr.title, tw, 14, true))}</text>`);
      let by = y + 23;
      for (const line of f.note ? wrap(f.note, tw, 12.5, 2) : []) {
        by += 17;
        emit(`<text x="${tx}" y="${by}" class="note">${x(line)}</text>`);
      }
      by += 17;
      emit(meta(f.pr, `${f.pr.owner}/${f.pr.repo}#${f.pr.number}`, tx, by));
      y = by + 13;
    });
    y += 2;
    backgrounds.push({ y0: top, y1: y, el: `<rect x="${bx + 0.5}" y="${top + 0.5}" width="${bw - 1}" height="${y - top - 1}" rx="6" class="fbox"/>` });
    y += 6;
  }

  /* ---------- groups ---------- */
  const trunk = (from: number, to: number, tx: number) =>
    `<line x1="${tx}" x2="${tx}" y1="${from}" y2="${to}" class="rule"/>`;

  const items = (list: PullRequest[], indent: number, label: (pr: PullRequest) => string, trunks: number[]) => {
    for (const pr of list) {
      start(pr.url, prLabel(pr));
      for (const tx of trunks) emit(trunk(y, y + 48, tx));
      const ix = PAD + indent;
      emit(icon(ICON.merge, ix, y + 8, 14, "merged"));
      const tx = ix + 24;
      emit(`<text x="${tx}" y="${y + 20}" class="ptitle">${x(truncate(pr.title, W - PAD - tx, 14))}</text>`);
      emit(meta(pr, label(pr), tx, y + 37));
      y += 48;
    }
  };
  const more = (n: number, indent: number, trunks: number[], scope: string) => {
    if (n <= 0) return;
    start(null, `${plural(n, "more PR")} in ${scope}`);
    for (const tx of trunks) emit(trunk(y, y + 24, tx));
    emit(`<text x="${PAD + indent + 24}" y="${y + 16}" class="meta">+${n} more</text>`);
    y += 24;
  };

  y += 2;
  view.owners.forEach((o: ViewOwner) => {
    const count = plural(o.total, "PR");
    start(`https://github.com/${o.login}`, `${o.login}: ${count}`);
    emit(avatar(o, PAD, y + 10));
    emit(`<text x="${PAD + 28}" y="${y + 25}" class="owner">${x(truncate(o.login, W - PAD * 2 - 28 - textWidth(count, 12) - 12, 14, true))}</text>`);
    emit(`<text x="${W - PAD}" y="${y + 25}" class="sub" text-anchor="end">${count}</text>`);
    y += 34;
    const t1 = PAD + 9.5;
    if (o.repos) {
      for (const r of o.repos) {
        const stars = formatCount(r.stars);
        const prs = `· ${plural(r.total, "PR")}`;
        start(`https://github.com/${o.login}/${r.name}`, `${o.login}/${r.name}: ${stars} stars, ${plural(r.total, "PR")}`);
        emit(trunk(y, y + 26, t1));
        emit(icon(ICON.repo, PAD + 28, y + 7, 13, "mutedfill"));
        const starsW = textWidth(stars, 12);
        emit(icon(ICON.star, W - PAD - starsW - 16, y + 8, 12, "mutedfill"));
        emit(`<text x="${W - PAD}" y="${y + 19}" class="sub" text-anchor="end">${stars}</text>`);
        const nameW = W - PAD - starsW - 28 - (PAD + 46) - textWidth(prs, 12) - 6;
        emit(`<text x="${PAD + 46}" y="${y + 19}" class="repo">${x(truncate(r.name, nameW, 13, true))}<tspan class="sub" dx="6">${prs}</tspan></text>`);
        y += 26;
        const t2 = PAD + 34.5;
        items(r.items, 48, (pr) => `#${pr.number}`, [t1, t2]);
        more(r.hidden, 48, [t1, t2], `${o.login}/${r.name}`);
      }
    } else {
      items(o.items ?? [], 28, (pr) => `${pr.owner}/${pr.repo}#${pr.number}`, [t1]);
      more(o.hidden, 28, [t1], o.login);
    }
    y += 4;
  });

  if (!view.owners.length && !view.featured.length) {
    emit(`<text x="${PAD}" y="${y + 18}" class="sub">No merged pull requests to show yet.</text>`);
    y += 30;
  }

  /* ---------- footer ---------- */
  const badges = view.cutOwners ? view.maxBadges : 0;
  if (view.cutOwners || view.since) {
    const others = view.cutList.map((o) => `${o.login} (${o.total})`).join(", ");
    const since = view.since ? `Since ${formatMonth(view.since)}` : "";
    start(null, [others && `Also contributed to ${others}`, since].filter(Boolean).join(". "));
    y += 4;
    emit(`<line x1="${PAD}" x2="${W - PAD}" y1="${y}" y2="${y}" class="rule"/>`);
    if (view.cutOwners) {
      const label = badges ? "Also contributed to" : `+${plural(view.cutOwners, "more owner")} · ${plural(view.cutPrs, "PR")}`;
      emit(`<text x="${PAD}" y="${y + 21}" class="sub">${label}</text>`);
    }
    if (since) emit(`<text x="${W - PAD}" y="${y + 21}" class="sub" text-anchor="end">${since}</text>`);
    y += 30;
    if (badges) {
      const chips = ownerChips(view.cutList.slice(0, badges), view.cutOwners - badges, avatar, SMALL_CHIP);
      const flowed = flow(chips, PAD, y, W - PAD * 2);
      emit(...flowed.svg);
      y = flowed.bottom + 8;
    }
  }
  if (view.credit) {
    start(PROJECT_URL, "Made with oss-activity-card");
    emit(`<text x="${W - PAD}" y="${y + 13}" class="credit" text-anchor="end">Made with <tspan class="credit-name">oss-activity-card</tspan></text>`);
    y += 22;
  } else {
    y += 10;
  }
  segments.at(-1)!.y1 = y;

  return { height: Math.ceil(y), segments, backgrounds, title: `${view.title}: ${sub}` };
}

function cardCss(t: Theme): string {
  return [
    `text{font-family:${FONT};fill:${t.fg}}`,
    `.title{font-size:16px;font-weight:600;fill:${t.title}}`,
    `.sub,.meta{font-size:12px;fill:${t.muted}}`,
    `.flabel{font-size:11px;font-weight:600;letter-spacing:.04em;fill:${t.star}}`,
    `.ftitle{font-size:14px;font-weight:600}`,
    `.note{font-size:12.5px;opacity:.85}`,
    `.ptitle{font-size:14px}`,
    `.owner{font-size:14px;font-weight:600}`,
    `.repo{font-size:13px;font-weight:600}`,
    `.add{fill:${t.add}}.del{fill:${t.del}}.ref{fill:${t.title}}`,
    `.merged{fill:${t.merged}}.star{fill:${t.star}}.mutedfill{fill:${t.muted}}`,
    `.ini{fill:#fff;font-weight:700}`,
    `.credit{font-size:11px;fill:${t.muted}}.credit-name{font-weight:600}`,
    `.rule{stroke:${t.border};stroke-width:1}`,
    `.ring{fill:none;stroke:${t.border};stroke-width:1;opacity:.6}`,
    `.fbox{fill:${t.featuredBg};stroke:${t.border}}`,
    chipCss(t, SMALL_CHIP),
  ].join("");
}

/** Wraps card content in an SVG whose viewport shows rows y0..y0+h of a card that is H tall. */
function svgDoc(t: Theme, H: number, y0: number, h: number, title: string, defs: string[], body: string[]): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 ${y0} ${W} ${h}" role="img" aria-labelledby="t">`,
    `<title id="t">${x(title)}</title>`,
    `<style>${cardCss(t)}</style>`,
    `<defs>${defs.join("")}</defs>`,
    // The whole frame is drawn in every slice; the viewport crops it to the right edges and corners.
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="${t.bg}" stroke="${t.border}"/>`,
    ...body,
    `</svg>`,
    "",
  ].join("\n");
}

/** The whole card as one SVG. */
export function renderCard(view: CardView, { theme: t, avatars = new Map() }: RenderOptions): string {
  const card = layoutCard(view, avatars);
  return svgDoc(
    t,
    card.height,
    0,
    card.height,
    card.title,
    card.segments.flatMap((s) => s.defs),
    [...card.backgrounds.map((b) => b.el), ...card.segments.flatMap((s) => s.els)],
  );
}

export interface Slice {
  svg: string;
  href: string | null;
  label: string;
  height: number;
}

/**
 * The card cut into horizontal bands, one SVG each, so every band can be wrapped in its own link
 * in a README (an image inside a README can only link to one place).
 */
export function renderSlices(view: CardView, { theme: t, avatars = new Map() }: RenderOptions): Slice[] {
  const card = layoutCard(view, avatars);
  return card.segments.map((s) => {
    const h = s.y1 - s.y0;
    const bg = card.backgrounds.filter((b) => b.y0 < s.y1 && b.y1 > s.y0).map((b) => b.el);
    return { svg: svgDoc(t, card.height, s.y0, h, s.label, s.defs, [...bg, ...s.els]), href: s.href, label: s.label, height: h };
  });
}

interface ChipStyle {
  height: number;
  avatar: number;
  font: number;
}
const SMALL_CHIP: ChipStyle = { height: 24, avatar: 16, font: 12 };

interface Chip {
  w: number;
  h: number;
  draw: (cx: number, cy: number) => string;
}

/** Pill badges with avatar, owner name and PR count, plus a dashed "+N more" badge when `rest` > 0. */
function ownerChips(
  owners: OwnerSummary[],
  rest: number,
  avatar: ReturnType<typeof avatarRenderer>,
  st: ChipStyle,
): Chip[] {
  const { height: h, avatar: a, font: f } = st;
  const pad = (h - a) / 2;
  const base = h / 2 + f * 0.36;
  const chips: Chip[] = owners.map((o) => {
    const count = String(o.total);
    const w = Math.ceil(pad + a + 7 + textWidth(o.login, f) + 7 + textWidth(count, f, true) + h * 0.3);
    return {
      w,
      h,
      draw: (cx, cy) =>
        `<rect x="${cx + 0.5}" y="${cy + 0.5}" width="${w - 1}" height="${h - 1}" rx="${h / 2}" class="chip"/>` +
        avatar(o, cx + pad, cy + pad, a) +
        `<text x="${cx + pad + a + 7}" y="${cy + base}" class="cname">${x(o.login)}<tspan class="ccount" dx="7">${count}</tspan></text>`,
    };
  });
  if (rest > 0) {
    const label = `+${rest} more`;
    const w = Math.ceil(h * 0.45 * 2 + textWidth(label, f - 1));
    chips.push({
      w,
      h,
      draw: (cx, cy) =>
        `<rect x="${cx + 0.5}" y="${cy + 0.5}" width="${w - 1}" height="${h - 1}" rx="${h / 2}" class="chip more"/>` +
        `<text x="${cx + h * 0.45}" y="${cy + base}" class="cmore">${label}</text>`,
    });
  }
  return chips;
}

/** Lays chips out left to right, wrapping at maxWidth. */
function flow(chips: Chip[], x0: number, y0: number, maxWidth: number, gap = 6) {
  const svg: string[] = [];
  let cx = x0;
  let cy = y0;
  let right = x0;
  let rowH = 0;
  for (const chip of chips) {
    if (cx > x0 && cx + chip.w > x0 + maxWidth) {
      cx = x0;
      cy += rowH + gap;
    }
    svg.push(chip.draw(cx, cy));
    right = Math.max(right, cx + chip.w);
    rowH = Math.max(rowH, chip.h);
    cx += chip.w + gap;
  }
  return { svg, right, bottom: chips.length ? cy + rowH : y0 };
}

const chipCss = (t: Theme, st: ChipStyle) =>
  [
    `.cname{font-size:${st.font}px}`,
    `.ccount{font-weight:600;fill:${t.merged}}`,
    `.cmore{font-size:${st.font - 1}px;fill:${t.muted}}`,
    `.chip{fill:${t.bg};stroke:${t.border}}`,
    `.chip.more{fill:none;stroke-dasharray:3 3}`,
  ].join("");
