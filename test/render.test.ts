import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeConfig } from "../src/config.ts";
import { formatMonth, renderCard, THEMES } from "../src/render.ts";
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

test("footer shows owners left out by max_owners", () => {
  assert.match(render({ groups: { max_owners: 2 } }), /\+4 more owners · \d+ PRs/);
  assert.doesNotMatch(render({ groups: { max_owners: null } }), /more owner/);
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
