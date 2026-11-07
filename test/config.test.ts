import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, DEFAULT_CONFIG, parseConfig } from "../src/config.ts";

test("empty config gives defaults", () => {
  assert.deepEqual(parseConfig(""), DEFAULT_CONFIG);
});

test("parses a full config", () => {
  const c = parseConfig(`
layout: compact
compact: { max_width: 600 }
title: "My OSS work"
since: 2024-01-01
groups:
  repos: true
  sort: count
  max_owners: null
  max_prs: 3
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
  assert.equal(c.layout, "compact");
  assert.equal(c.compact.maxWidth, 600);
  assert.equal(c.title, "My OSS work");
  assert.equal(c.since, "2024-01-01");
  assert.deepEqual(c.groups, { repos: "always", sort: "count", maxOwners: null, maxPrs: 3 });
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
  assert.throws(() => parseConfig("layout: grid"), /layout/);
  assert.throws(() => parseConfig("compact: { max_width: 50 }"), /compact.max_width/);
});

test("the example config in examples/ is valid", async () => {
  const { readFileSync } = await import("node:fs");
  const c = parseConfig(readFileSync(new URL("../examples/oss-card.yml", import.meta.url), "utf8"));
  assert.equal(c.featured.length, 2);
  assert.equal(c.priority.owners["old-hackathon-team"], -1);
});
