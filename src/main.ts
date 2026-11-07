import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { ConfigError, DEFAULT_CONFIG, parseConfig } from "./config.ts";
import { fetchAvatars, GitHubClient } from "./github.ts";
import { END, readmeBlock, replaceBlock, START } from "./readme.ts";
import { renderCard, renderSlices, THEMES } from "./render.ts";
import { buildView } from "./select.ts";
import type { CardView, Config } from "./types.ts";

/** Reads an action input the way the runner exposes it (INPUT_<NAME>). */
function input(name: string, fallback = ""): string {
  const v = process.env[`INPUT_${name.toUpperCase()}`] ?? process.env[`INPUT_${name.toUpperCase().replaceAll("-", "_")}`];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
}

function setOutput(name: string, value: string) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

const warn = (msg: string) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `warning: ${msg}`);

function loadConfig(path: string): Config {
  if (!existsSync(path)) {
    console.log(`No config at ${path}; using defaults.`);
    return structuredClone(DEFAULT_CONFIG);
  }
  return parseConfig(readFileSync(path, "utf8"));
}

function write(path: string, svg: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, svg);
  console.log(`Wrote ${path} (${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB)`);
}

async function main() {
  const token = input("github-token", process.env.GITHUB_TOKEN ?? "");
  const user = input("user", process.env.GITHUB_REPOSITORY_OWNER ?? "");
  const configPath = input("config", ".github/oss-card.yml");
  const output = input("output", "oss-card.svg");
  const outputDark = input("output-dark", "oss-card-dark.svg");
  const readme = input("readme");
  const slicesDir = input("slices-dir", "oss-card");

  if (!token) throw new Error("No GitHub token. Pass github-token, or set GITHUB_TOKEN when running locally.");
  if (!user) throw new Error("No user. Pass the user input.");

  const config = loadConfig(configPath);
  const gh = new GitHubClient(token);

  const prs = await gh.mergedPullRequests(user, config.since === "auto" ? undefined : config.since);
  console.log(`Found ${prs.length} merged pull requests by ${user} to other people's repositories.`);

  const known = new Set(prs.map((p) => `${p.owner}/${p.repo}#${p.number}`.toLowerCase()));
  const missing = config.featured.map((f) => f.pr).filter((ref) => !known.has(ref.toLowerCase()));
  const featuredPrs = await gh.pullRequests(missing);
  for (const ref of missing) if (!featuredPrs.has(ref.toLowerCase())) warn(`Featured PR ${ref} was not found or is private; skipping it.`);

  const view = buildView(prs, featuredPrs, config, user);
  const shown = [...view.featured.map((f) => f.pr), ...view.owners.flatMap((o) => o.items ?? o.repos?.flatMap((r) => r.items) ?? [])];
  const avatarUrls = [
    ...view.featured.map((f) => f.pr.avatarUrl),
    ...view.owners.map((o) => o.avatarUrl),
    ...view.cutList.slice(0, view.maxBadges).map((o) => o.avatarUrl),
  ];
  const avatars = await fetchAvatars(avatarUrls);
  console.log(`Card shows ${shown.length} PRs from ${view.owners.length} owners (${view.totalPrs} counted).`);

  const render = (theme: (typeof THEMES)[keyof typeof THEMES]) => renderCard(view, { theme, avatars });
  write(output, render(THEMES.light));
  setOutput("path", output);
  if (outputDark !== "none") {
    write(outputDark, render(THEMES.dark));
    setOutput("path-dark", outputDark);
  }

  if (readme) writeLinkedCard(view, avatars, readme, slicesDir);
}

const SLICE_FILE = /^\d{2,}-(light|dark)\.svg$/;

/** Writes the card as linked slices and puts them between the markers in the README. */
function writeLinkedCard(view: CardView, avatars: Map<string, string>, readme: string, dir: string) {
  if (!existsSync(readme)) throw new Error(`README not found at ${readme}.`);
  const light = renderSlices(view, { theme: THEMES.light, avatars });
  const dark = renderSlices(view, { theme: THEMES.dark, avatars });

  mkdirSync(dir, { recursive: true });
  // Remove slices from the previous run; the number of slices changes as PRs come and go.
  for (const f of readdirSync(dir)) if (SLICE_FILE.test(f)) rmSync(join(dir, f));

  const digits = Math.max(2, String(light.length).length);
  const rel = (file: string) => relative(dirname(readme), file).split(sep).join("/");
  const linked = light.map((s, i) => {
    const n = String(i + 1).padStart(digits, "0");
    const lightFile = join(dir, `${n}-light.svg`);
    const darkFile = join(dir, `${n}-dark.svg`);
    writeFileSync(lightFile, s.svg);
    writeFileSync(darkFile, dark[i]!.svg);
    return { href: s.href, label: s.label, height: s.height, light: rel(lightFile), dark: rel(darkFile) };
  });
  console.log(`Wrote ${linked.length} linked slices to ${dir}/`);

  const updated = replaceBlock(readFileSync(readme, "utf8"), readmeBlock(linked));
  if (updated === null) {
    warn(`${readme} has no "${START}" ... "${END}" markers, so it was not changed. Add them where the card should go.`);
    return;
  }
  writeFileSync(readme, updated);
  console.log(`Updated the card in ${readme}`);
}

main().catch((e: unknown) => {
  const msg = e instanceof ConfigError ? `Config error: ${e.message}` : e instanceof Error ? e.message : String(e);
  console.log(process.env.GITHUB_ACTIONS ? `::error::${msg}` : `error: ${msg}`);
  process.exitCode = 1;
});
