import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, DEFAULT_CONFIG, parseConfig } from "../src/config.ts";

test("empty config gives defaults", () => {
  assert.deepEqual(parseConfig(""), DEFAULT_CONFIG);
  assert.deepEqual(parseConfig("# only comments\n"), DEFAULT_CONFIG);
  assert.equal(parseConfig("groups: { max_prs: 3 }").groups.repos, "always");
});

test("parses a full config", () => {
  const c = parseConfig(`
title: "My OSS work"
since: 2024-01-01
groups:
  repos: auto
  sort: count
  max_owners: null
  max_prs: 3
  max_badges: 4
priority:
  default: -1
  owners: { BiomeJS: 10 }
  repos: { honojs/hono: 3 }
featured:
  - pr: biomejs/biome#4410
    note: Added an autofix
  - honojs/hono#1
exclude: [someorg, Foo/Bar#2]
`);
  assert.equal(c.title, "My OSS work");
  assert.equal(c.since, "2024-01-01");
  assert.deepEqual(c.groups, { repos: "auto", sort: "count", maxOwners: null, maxPrs: 3, maxBadges: 4 });
  assert.deepEqual(c.priority, { default: -1, owners: { biomejs: 10 }, repos: { "honojs/hono": 3 } });
  assert.deepEqual(c.featured, [{ pr: "biomejs/biome#4410", note: "Added an autofix" }, { pr: "honojs/hono#1" }]);
  assert.deepEqual(c.exclude, ["someorg", "foo/bar#2"]);
});

test("rejects bad values with a message naming the key", () => {
  assert.throws(() => parseConfig("groups: { max_prs: 0 }"), (e: Error) => e instanceof ConfigError && /groups.max_prs/.test(e.message));
  assert.throws(() => parseConfig("since: last year"), /since/);
  assert.throws(() => parseConfig("featured: [nope]"), /featured\[0\]/);
  assert.throws(() => parseConfig("priority: { repos: { hono: 1 } }"), /owner\/repo/);
  assert.throws(() => parseConfig("groups: { sort: stars }"), /groups.sort/);
  assert.throws(() => parseConfig("- a\n- b"), /YAML map/);
  assert.throws(() => parseConfig("groups: { repos: sometimes }"), /groups.repos/);
  assert.throws(() => parseConfig("credit: no thanks"), /credit/);
});

test("credit is on by default and can be turned off", () => {
  assert.equal(parseConfig("").credit, true);
  assert.equal(parseConfig("credit: false").credit, false);
});

test("the example config in examples/ is valid", async () => {
  const { readFileSync } = await import("node:fs");
  const c = parseConfig(readFileSync(new URL("../examples/oss-card.yml", import.meta.url), "utf8"));
  assert.equal(c.featured.length, 2);
  assert.equal(c.priority.owners["old-hackathon-team"], -1);
});
