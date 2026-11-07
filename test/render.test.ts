import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeConfig } from "../src/config.ts";
import { formatCount, formatMonth, renderCard, renderSlices, THEMES } from "../src/render.ts";
import { buildView } from "../src/select.ts";
import { textWidth, truncate, wrap } from "../src/text.ts";
import { pr, SAMPLE } from "./fixtures.ts";

const render = (raw: Record<string, unknown> = {}, prs = SAMPLE) =>
  renderCard(buildView(prs, new Map(), normalizeConfig(raw), "me"), { theme: THEMES.light });
const height = (svg: string) => Number(/height="(\d+)"/.exec(svg)![1]);

test("renders a well-formed SVG with a computed height", () => {
  const svg = render({ featured: [{ pr: "biomejs/biome#4410", note: "Autofix that ESLint does not have" }] });
  assert.match(svg, /^<svg [^>]*width="495" height="\d+"/);
  assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  assert.match(svg, /FEATURED/);
  assert.match(svg, /Since Jul 2026/);
  for (const tag of ["text", "g", "svg", "clipPath", "defs", "style", "title"]) {
    const opened = (svg.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length;
    const closed = (svg.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    assert.equal(opened, closed, `<${tag}> balanced`);
  }
});

test("escapes user content", () => {
  const svg = render({ title: `<script>&"` }, [pr("a/b#1", "2026-01-01", { title: "fix <img> & co" })]);
  assert.ok(!svg.includes("<script>"));
  assert.match(svg, /&lt;script&gt;&amp;&quot;/);
  assert.match(svg, /fix &lt;img&gt; &amp; co/);
});

test("more content makes a taller card", () => {
  assert.ok(height(render({ groups: { max_prs: 3 } })) > height(render({ groups: { max_prs: 1 } })));
});

test("footer shows owners left out by max_owners as badges", () => {
  const svg = render({ groups: { max_owners: 2 } });
  assert.match(svg, /Also contributed to/);
  assert.equal((svg.match(/class="chip"/g) ?? []).length, 4);
  assert.match(svg, />sindresorhus<tspan class="ccount" dx="7">1</);
  assert.doesNotMatch(render({ groups: { max_owners: null } }), /Also contributed to|class="chip"/);
});

test("max_badges limits footer badges; 0 falls back to a one-line summary", () => {
  const two = render({ groups: { max_owners: 2, max_badges: 2 } });
  assert.equal((two.match(/class="chip"/g) ?? []).length, 2);
  assert.match(two, />\+2 more</);
  const none = render({ groups: { max_owners: 2, max_badges: 0 } });
  assert.match(none, /\+4 more owners · \d+ PRs/);
  assert.doesNotMatch(none, /class="chip/);
});

test("avatars are embedded when given, otherwise an initial is drawn", () => {
  const prs = [pr("a/b#1", "2026-01-01")];
  const view = buildView(prs, new Map(), normalizeConfig({}), "me");
  const withAvatar = renderCard(view, { theme: THEMES.dark, avatars: new Map([[prs[0]!.avatarUrl, "data:image/png;base64,AAAA"]]) });
  assert.match(withAvatar, /<image href="data:image\/png;base64,AAAA"/);
  assert.match(renderCard(view, { theme: THEMES.dark }), /class="ini"[^>]*>A</);
});

test("empty card says so", () => {
  assert.match(render({}, []), /No merged pull requests/);
});

test("text helpers", () => {
  assert.equal(formatMonth("2024-03-15"), "Mar 2024");
  const t = truncate("a".repeat(200), 100, 14);
  assert.ok(t.endsWith("…") && textWidth(t, 14) <= 100);
  assert.equal(truncate("short", 100, 14), "short");
  const lines = wrap("日本語のメモがとても長い場合でも二行に収まるように折り返して最後は省略する", 120, 12.5, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => textWidth(l, 12.5) <= 120));
});

test("repo headings show the repository's stars", () => {
  const svg = render({ groups: { max_owners: 1 }, priority: { owners: { honojs: 1 } } });
  assert.match(svg, />hono<tspan class="sub" dx="6">· 2 PRs</);
  assert.match(svg, />23\.4k</);
  assert.match(svg, />3\.1k</);
  assert.doesNotMatch(render({ groups: { repos: false } }), />23\.4k</);
});

test("slices cover the whole card, one link per band", () => {
  const raw = { featured: [{ pr: "biomejs/biome#4410", note: "Autofix" }], groups: { max_owners: 2, max_prs: 1 } };
  const view = buildView(SAMPLE, new Map(), normalizeConfig(raw), "me");
  const full = renderCard(view, { theme: THEMES.light });
  const slices = renderSlices(view, { theme: THEMES.light });

  assert.equal(slices.reduce((n, s) => n + s.height, 0), height(full));
  let y = 0;
  for (const s of slices) {
    assert.match(s.svg, new RegExp(`viewBox="0 ${y} 495 ${s.height}"`));
    assert.doesNotMatch(s.svg, /NaN|undefined|Infinity/);
    y += s.height;
  }

  const hrefs = slices.map((s) => s.href);
  assert.ok(hrefs.includes("https://github.com/biomejs/biome/pull/4410"), "featured PR");
  assert.ok(hrefs.includes("https://github.com/honojs"), "owner");
  assert.ok(hrefs.includes("https://github.com/honojs/hono"), "repo");
  assert.ok(hrefs.includes("https://github.com/honojs/hono/pull/3521"), "PR");
  assert.match(slices.find((s) => s.href === "https://github.com/honojs/hono")!.label, /23\.4k stars/);

  // PR, repo and owner rows link to GitHub; the header and credit line link to this project.
  const project = "https://github.com/yamamoto7/oss-activity-card";
  assert.equal(hrefs[0], project, "header");
  assert.equal(hrefs.at(-2), null, "footer");
  assert.equal(hrefs.at(-1), project, "credit");
  const more = slices.find((s) => s.label.startsWith("1 more PR in honojs/hono"));
  assert.ok(more && more.href === null, "+N more");
  assert.ok(hrefs.every((h) => h === null || /^https:\/\/github\.com\/[\w.-]+(\/[\w.-]+(\/pull\/\d+)?)?$/.test(h)));
});

test("credit line at the bottom, unless credit: false", () => {
  assert.match(render(), /Made with <tspan class="credit-name">oss-activity-card<\/tspan>/);
  const off = render({ credit: false });
  assert.doesNotMatch(off, /Made with/);
  assert.equal(height(render()) - height(off), 12);
  const view = buildView(SAMPLE, new Map(), normalizeConfig({ credit: false }), "me");
  const slices = renderSlices(view, { theme: THEMES.light });
  assert.ok(!slices.some((s) => s.href?.includes("oss-activity-card")));
  assert.equal(slices[0]!.href, null, "the header has no link either");
});

test("PR references are link-colored", () => {
  const svg = render();
  assert.match(svg, /<tspan class="ref">#3521<\/tspan>/);
  assert.match(svg, /\.ref\{fill:#0969da\}/);
});

test("formatCount", () => {
  assert.deepEqual([0, 950, 1000, 1234, 23456, 131000, 2_100_000].map(formatCount), ["0", "950", "1k", "1.2k", "23.5k", "131k", "2.1m"]);
});
