import type { OwnerType, PullRequest } from "../src/types.ts";

// Rough star counts for the sample repositories.
const STARS: Record<string, number> = {
  "honojs/hono": 23400, "honojs/middleware": 3100, "biomejs/biome": 17200, "biomejs/website": 120,
  "sindresorhus/ky": 14800, "withastro/astro": 50100, "withastro/starlight": 6200,
  "denoland/deno": 100000, "denoland/std": 3300,
};

let n = 1;
export function pr(ref: string, mergedAt: string, extra: Partial<PullRequest> = {}): PullRequest {
  const m = /^([\w.-]+)\/([\w.-]+)(?:#(\d+))?$/.exec(ref)!;
  const owner = m[1]!;
  const number = m[3] ? Number(m[3]) : n++;
  return {
    owner,
    ownerType: (extra.ownerType ?? "Organization") as OwnerType,
    avatarUrl: `https://avatars.example/${owner}`,
    repo: m[2]!,
    stars: STARS[`${owner}/${m[2]}`] ?? 131000,
    number,
    title: `Change ${ref}`,
    url: `https://github.com/${owner}/${m[2]}/pull/${number}`,
    mergedAt: `${mergedAt}T00:00:00Z`,
    additions: 10,
    deletions: 2,
    ...extra,
  };
}

/** The same sample data as the design mockup. Not real contributions. */
export const SAMPLE: PullRequest[] = [
  pr("honojs/hono#3521", "2026-11-03", { title: "fix(jsx): preserve key order when streaming Suspense boundaries", additions: 48, deletions: 12 }),
  pr("biomejs/biome#4410", "2026-10-28", { title: "feat(lint): add noUselessUndefinedInitialization autofix", additions: 212, deletions: 9 }),
  pr("sindresorhus/ky#640", "2026-10-22", { ownerType: "User", title: "feat: add retry.jitter option", additions: 57, deletions: 4 }),
  pr("withastro/astro#12204", "2026-10-19", { title: "fix: correct trailingSlash handling for i18n fallback routes", additions: 31, deletions: 17 }),
  pr("vercel/next.js#71830", "2026-10-09", { title: "docs: clarify revalidateTag behavior with fetch cache", additions: 22, deletions: 6 }),
  pr("biomejs/biome#4302", "2026-10-02", { title: "fix(css): handle nested @layer in noDuplicateSelectors", additions: 76, deletions: 21 }),
  pr("denoland/deno#26015", "2026-09-30", { title: "fix(ext/node): handle EPIPE in child_process stdin", additions: 64, deletions: 20 }),
  pr("withastro/starlight#2511", "2026-09-21", { title: "feat: add sidebar badge variants for i18n labels", additions: 88, deletions: 14 }),
  pr("honojs/hono#3402", "2026-09-12", { title: "perf(router): skip regexp build for static-only routes", additions: 93, deletions: 40 }),
  pr("biomejs/biome#4120", "2026-08-30", { title: "docs: add migration guide from eslint-plugin-import", additions: 180, deletions: 0 }),
  pr("honojs/middleware#812", "2026-08-20", { title: "feat(zod-openapi): support hono/jsx response types", additions: 41, deletions: 8 }),
  pr("denoland/std#6102", "2026-08-11", { title: "fix(path): normalize UNC roots on Windows", additions: 27, deletions: 9 }),
  pr("withastro/astro#11950", "2026-08-05", { title: "fix(content): reload collections on symlinked dirs", additions: 19, deletions: 5 }),
  pr("biomejs/website#1503", "2026-07-28", { title: "docs: fix broken link in rules index", additions: 1, deletions: 1 }),
  pr("biomejs/biome#3988", "2026-07-15", { title: "chore: speed up snapshot tests with parallel runner", additions: 34, deletions: 28 }),
  pr("denoland/deno#25500", "2026-07-02", { title: "fix(fmt): keep blank line before JSDoc in class body", additions: 12, deletions: 3 }),
];
