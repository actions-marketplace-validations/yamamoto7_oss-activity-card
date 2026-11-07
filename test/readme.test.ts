import assert from "node:assert/strict";
import { test } from "node:test";
import { END, readmeBlock, replaceBlock, START } from "../src/readme.ts";

const slices = [
  { href: "https://github.com/a", label: `a "quoted" & <b>`, height: 50, light: "oss-card/01-light.svg", dark: "oss-card/01-dark.svg" },
  { href: "https://github.com/a/b/pull/1", label: "a/b#1: fix", height: 48, light: "oss-card/02-light.svg", dark: "oss-card/02-dark.svg" },
];

test("block has one linked picture per slice, as a single HTML block", () => {
  const block = readmeBlock(slices);
  assert.equal((block.match(/<a href=/g) ?? []).length, 2);
  assert.match(block, /<a href="https:\/\/github\.com\/a\/b\/pull\/1" title="a\/b#1: fix"><picture>/);
  assert.match(block, /srcset="oss-card\/01-dark\.svg"/);
  assert.match(block, /<img src="oss-card\/02-light\.svg" alt="a\/b#1: fix" width="495" height="48" align="top">/);
  assert.match(block, /title="a &quot;quoted&quot; &amp; &lt;b&gt;"/);
  assert.ok(!/\n\s*\n/.test(block), "no blank lines, or Markdown would end the HTML block");
  assert.ok(block.startsWith("<div>") && block.endsWith("</div>"));
});

test("replaces only what is between the markers, and is repeatable", () => {
  const readme = `# Hi\n\nintro\n\n${START}\nold\n${END}\n\nafter\n`;
  const once = replaceBlock(readme, "NEW")!;
  assert.equal(once, `# Hi\n\nintro\n\n${START}\nNEW\n${END}\n\nafter\n`);
  assert.equal(replaceBlock(once, "NEW"), once);
});

test("returns null without markers", () => {
  assert.equal(replaceBlock("# Hi\n", "x"), null);
  assert.equal(replaceBlock(`${END}\n${START}`, "x"), null);
});
