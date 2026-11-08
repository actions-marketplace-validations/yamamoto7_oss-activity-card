// Renders the sample data to examples/ so the README can show what the card looks like.
// The PRs are made up, but the owners are real, and their avatars are fetched from GitHub
// (pass --offline to skip that and draw initials instead).
import { mkdirSync, writeFileSync } from "node:fs";
import { normalizeConfig } from "../src/config.ts";
import { fetchAvatars } from "../src/github.ts";
import { renderCard, renderSlices, THEMES } from "../src/render.ts";
import { buildView } from "../src/select.ts";
import type { PullRequest } from "../src/types.ts";
import { pr, SAMPLE } from "../test/fixtures.ts";

// More owners, so the footer shows a row of badges like a real profile would.
const MORE: PullRequest[] = [
  ["vitejs/vite", 4], ["vuejs/core", 3], ["microsoft/TypeScript", 2], ["nodejs/node", 2],
  ["rust-lang/rust", 1], ["tailwindlabs/tailwindcss", 2], ["prisma/prisma", 1], ["oven-sh/bun", 3],
].flatMap(([repo, count]) =>
  Array.from({ length: count as number }, (_, i) => pr(repo as string, `2026-0${6 - i}-1${i}`)),
);

const prs = [...SAMPLE, ...MORE].map((p) => ({ ...p, avatarUrl: `https://github.com/${p.owner}.png?size=80` }));

const config = normalizeConfig({
  title: "Example OSS Contributions",
  groups: { max_owners: 3, max_prs: 2 },
  priority: { owners: { biomejs: 10, honojs: 5 }, repos: { "honojs/hono": 3, "biomejs/website": -1 } },
  featured: [
    { pr: "biomejs/biome#4410", note: "Added an autofix that ESLint doesn't have. Listed in the v2.3 release notes." },
    { pr: "denoland/deno#26015", note: "Fixed a crash in the Node compatibility layer." },
  ],
});
const view = buildView(prs, new Map(), config, "example");

const offline = process.argv.includes("--offline");
const avatars = offline
  ? new Map<string, string>()
  : await fetchAvatars([
      ...view.featured.map((f) => f.pr.avatarUrl),
      ...view.owners.map((o) => o.avatarUrl),
      ...view.cutList.slice(0, view.maxBadges).map((o) => o.avatarUrl),
    ]);
if (!offline) console.log(`Fetched ${avatars.size} avatars`);

mkdirSync("examples", { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  writeFileSync(`examples/card-${name}.svg`, renderCard(view, { theme, avatars }));
}
console.log("Wrote examples/card-light.svg and examples/card-dark.svg");

// --slices <dir> also writes the linked card's rows, for screenshots and demos.
const at = process.argv.indexOf("--slices");
if (at !== -1) {
  const dir = process.argv[at + 1] ?? "examples/slices";
  mkdirSync(dir, { recursive: true });
  const rows: { href: string | null; label: string; height: number }[] = [];
  for (const [name, theme] of Object.entries(THEMES)) {
    renderSlices(view, { theme, avatars }).forEach((s, i) => {
      writeFileSync(`${dir}/${String(i + 1).padStart(2, "0")}-${name}.svg`, s.svg);
      if (name === "light") rows.push({ href: s.href, label: s.label, height: s.height });
    });
  }
  writeFileSync(`${dir}/rows.json`, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows to ${dir}`);
}
