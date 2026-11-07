// Renders the sample data to examples/ so the README can show what the card looks like.
import { mkdirSync, writeFileSync } from "node:fs";
import { normalizeConfig } from "../src/config.ts";
import { renderCard, THEMES } from "../src/render.ts";
import { buildView } from "../src/select.ts";
import { SAMPLE } from "../test/fixtures.ts";

const config = normalizeConfig({
  title: "Example OSS Contributions",
  groups: { max_owners: 3, max_prs: 2 },
  priority: { owners: { biomejs: 10, honojs: 5 }, repos: { "honojs/hono": 3, "biomejs/website": -1 } },
  featured: [
    { pr: "biomejs/biome#4410", note: "Added an autofix that ESLint doesn't have. Listed in the v2.3 release notes." },
    { pr: "denoland/deno#26015", note: "Fixed a crash in the Node compatibility layer." },
  ],
});
const view = buildView(SAMPLE, new Map(), config, "example");
mkdirSync("examples", { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  writeFileSync(`examples/card-${name}.svg`, renderCard(view, { theme }));
}
console.log("Wrote examples/card-light.svg and examples/card-dark.svg");
