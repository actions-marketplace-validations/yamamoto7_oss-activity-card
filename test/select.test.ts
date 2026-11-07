import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeConfig } from "../src/config.ts";
import { buildView } from "../src/select.ts";
import { pr, SAMPLE } from "./fixtures.ts";

const cfg = (raw: Record<string, unknown> = {}) => normalizeConfig(raw);
const view = (raw: Record<string, unknown> = {}, prs = SAMPLE) => buildView(prs, new Map(), cfg(raw), "me");

test("orders owners by priority, then most recent", () => {
  const v = view({ priority: { owners: { biomejs: 10, honojs: 5 } }, groups: { max_owners: null } });
  assert.deepEqual(v.owners.map((o) => o.login), ["biomejs", "honojs", "sindresorhus", "withastro", "vercel", "denoland"]);
});

test("sort: count breaks ties by number of PRs", () => {
  const v = view({ groups: { sort: "count", max_owners: 3 } });
  assert.deepEqual(v.owners.map((o) => o.login), ["biomejs", "honojs", "withastro"]);
});

test("max_owners cuts owners and reports what was left out", () => {
  const v = view({ groups: { max_owners: 2 } });
  assert.equal(v.owners.length, 2);
  assert.equal(v.cutOwners, 4);
  assert.equal(v.cutPrs, SAMPLE.length - v.owners.reduce((n, o) => n + o.total, 0));
});

test("default -1 shows only listed owners, plus repos listed on their own", () => {
  const v = view({ priority: { default: -1, owners: { honojs: 1 }, repos: { "vercel/next.js": 5 } } });
  assert.deepEqual(v.owners.map((o) => o.login), ["vercel", "honojs"]);
  assert.equal(v.totalPrs, 4);
  assert.equal(v.cutOwners, 0);
});

test("negative repo priority hides that repo only", () => {
  const v = view({ priority: { repos: { "biomejs/website": -1 } }, groups: { repos: "auto", max_owners: null } });
  const biome = v.owners.find((o) => o.login === "biomejs")!;
  assert.equal(biome.total, 4);
  assert.equal(biome.repos, undefined, "one repo left, so no headings in auto mode");
});

test("repo headings are off by default", () => {
  assert.ok(view({ groups: { max_owners: null } }).owners.every((o) => !o.repos && o.items));
});

test("repos: auto adds headings only when an owner has two or more repos", () => {
  const v = view({ groups: { repos: "auto", max_owners: null } });
  const hono = v.owners.find((o) => o.login === "honojs")!;
  const single = v.owners.find((o) => o.login === "vercel")!;
  assert.deepEqual(hono.repos?.map((r) => r.name), ["hono", "middleware"]);
  assert.equal(single.repos, undefined);
  assert.equal(single.items?.length, 1);
});

test("repos: always/never", () => {
  const always = view({ groups: { repos: true, max_owners: null } });
  assert.ok(always.owners.every((o) => o.repos));
  const never = view({ groups: { repos: false, max_owners: null } });
  assert.ok(never.owners.every((o) => !o.repos && o.items));
});

test("max_prs limits each group and counts the rest", () => {
  const v = view({ groups: { max_prs: 1, repos: false } });
  const biome = v.owners.find((o) => o.login === "biomejs")!;
  assert.equal(biome.items?.length, 1);
  assert.equal(biome.hidden, 4);
  assert.equal(biome.items?.[0]?.number, 4410, "newest first");
});

test("repo priority orders repo headings", () => {
  const v = view({ groups: { repos: "auto" }, priority: { repos: { "honojs/middleware": 2 } } });
  assert.deepEqual(v.owners.find((o) => o.login === "honojs")!.repos?.map((r) => r.name), ["middleware", "hono"]);
});

test("featured PRs are listed once, at the top, with notes", () => {
  const v = view({ featured: [{ pr: "biomejs/biome#4410", note: "Autofix" }, { pr: "nobody/none#1" }] });
  assert.equal(v.featured.length, 1);
  assert.equal(v.featured[0]?.note, "Autofix");
  const all = v.owners.flatMap((o) => o.items ?? o.repos!.flatMap((r) => r.items));
  assert.ok(!all.some((p) => p.number === 4410));
  assert.equal(v.totalPrs, SAMPLE.length);
});

test("featured PRs fetched separately show even when hidden by priority", () => {
  const extra = pr("facebook/react#1", "2020-01-01");
  const v = buildView(SAMPLE, new Map([["facebook/react#1", extra]]), cfg({ priority: { default: -1 }, featured: ["facebook/react#1"] }), "me");
  assert.equal(v.featured[0]?.pr, extra);
  assert.equal(v.owners.length, 0);
  assert.equal(v.since, "2020-01-01");
});

test("since filters PRs and is shown as given; auto shows the earliest", () => {
  assert.equal(view().since, "2026-07-02");
  const v = view({ since: "2026-10-01", groups: { max_owners: null } });
  assert.equal(v.since, "2026-10-01");
  assert.equal(v.totalPrs, 6);
});

test("exclude by owner, repo or PR, and never counts the user's own repos", () => {
  const prs = [...SAMPLE, pr("me/dotfiles#1", "2026-11-01"), pr("ME/site#2", "2026-11-01")];
  const v = view({ exclude: ["vercel", "withastro/starlight", "honojs/hono#3521"], groups: { max_owners: null } }, prs);
  const logins = v.owners.map((o) => o.login.toLowerCase());
  assert.ok(!logins.includes("vercel") && !logins.includes("me"));
  assert.equal(v.totalPrs, SAMPLE.length - 3);
});

test("title replaces {user}", () => {
  assert.equal(view().title, "me's OSS Contributions");
  assert.equal(view({ title: "OSS by {user}" }).title, "OSS by me");
});

test("no PRs gives an empty view", () => {
  const v = view({}, []);
  assert.equal(v.totalPrs, 0);
  assert.equal(v.since, null);
  assert.deepEqual(v.owners, []);
});
