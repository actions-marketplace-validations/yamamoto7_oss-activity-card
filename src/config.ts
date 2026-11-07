import { parse } from "yaml";
import type { Config, GroupSort, Layout, RepoHeadings } from "./types.ts";

export class ConfigError extends Error {
  override name = "ConfigError";
}

export const DEFAULT_CONFIG: Config = {
  layout: "full",
  compact: { maxWidth: 495 },
  title: "{user}'s OSS Contributions",
  since: "auto",
  groups: { repos: "never", sort: "recent", maxOwners: 5, maxPrs: 2, maxBadges: 12 },
  priority: { default: 0, owners: {}, repos: {} },
  featured: [],
  exclude: [],
};

const PR_REF = /^[\w.-]+\/[\w.-]+#\d+$/;
const EXCLUDE_REF = /^[\w.-]+(\/[\w.-]+(#\d+)?)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function pick(o: Obj, ...keys: string[]): unknown {
  for (const k of keys) if (k in o) return o[k];
  return undefined;
}

function int(v: unknown, path: string, { min }: { min?: number } = {}): number {
  if (typeof v !== "number" || !Number.isInteger(v)) throw new ConfigError(`${path} must be an integer (got ${JSON.stringify(v)})`);
  if (min !== undefined && v < min) throw new ConfigError(`${path} must be ${min} or greater (got ${v})`);
  return v;
}

function priorityMap(v: unknown, path: string, keyPattern: RegExp, keyHint: string): Record<string, number> {
  if (v === undefined || v === null) return {};
  if (!isObj(v)) throw new ConfigError(`${path} must be a map of ${keyHint} to integers`);
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) {
    if (!keyPattern.test(k)) throw new ConfigError(`${path}: "${k}" is not ${keyHint}`);
    out[k.toLowerCase()] = int(n, `${path}.${k}`);
  }
  return out;
}

function repoHeadings(v: unknown): RepoHeadings {
  if (v === undefined || v === null) return DEFAULT_CONFIG.groups.repos;
  if (v === "auto") return "auto";
  if (v === true || v === "always") return "always";
  if (v === false || v === "never") return "never";
  throw new ConfigError(`groups.repos must be auto, true or false (got ${JSON.stringify(v)})`);
}

export function parseConfig(text: string): Config {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    throw new ConfigError(`Config is not valid YAML: ${(e as Error).message}`);
  }
  if (raw === null || raw === undefined) return structuredClone(DEFAULT_CONFIG);
  if (!isObj(raw)) throw new ConfigError("Config must be a YAML map");
  return normalizeConfig(raw);
}

export function normalizeConfig(raw: Obj): Config {
  const c = structuredClone(DEFAULT_CONFIG);

  const layout = raw.layout;
  if (layout !== undefined && layout !== null) {
    if (layout !== "full" && layout !== "compact") throw new ConfigError(`layout must be full or compact (got ${JSON.stringify(layout)})`);
    c.layout = layout as Layout;
  }

  const compact = raw.compact;
  if (compact !== undefined && compact !== null) {
    if (!isObj(compact)) throw new ConfigError("compact must be a map");
    const mw = pick(compact, "max_width", "maxWidth");
    if (mw !== undefined) c.compact.maxWidth = int(mw, "compact.max_width", { min: 200 });
  }

  const title = raw.title;
  if (title !== undefined) {
    if (typeof title !== "string") throw new ConfigError("title must be a string");
    c.title = title;
  }

  const since = raw.since;
  if (since !== undefined && since !== null) {
    // YAML parses bare 2024-01-01 as a string with the default schema, but be lenient with Date objects too.
    const s = since instanceof Date ? since.toISOString().slice(0, 10) : String(since);
    if (s !== "auto" && !(DATE.test(s) && !Number.isNaN(Date.parse(s)))) {
      throw new ConfigError(`since must be "auto" or a date like 2024-01-01 (got ${JSON.stringify(since)})`);
    }
    c.since = s;
  }

  const g = raw.groups;
  if (g !== undefined && g !== null) {
    if (!isObj(g)) throw new ConfigError("groups must be a map");
    c.groups.repos = repoHeadings(g.repos);
    const sort = g.sort;
    if (sort !== undefined) {
      if (sort !== "recent" && sort !== "count") throw new ConfigError(`groups.sort must be recent or count (got ${JSON.stringify(sort)})`);
      c.groups.sort = sort as GroupSort;
    }
    const maxOwners = pick(g, "max_owners", "maxOwners");
    if (maxOwners !== undefined) c.groups.maxOwners = maxOwners === null ? null : int(maxOwners, "groups.max_owners", { min: 1 });
    const maxPrs = pick(g, "max_prs", "maxPrs");
    if (maxPrs !== undefined) c.groups.maxPrs = int(maxPrs, "groups.max_prs", { min: 1 });
    const maxBadges = pick(g, "max_badges", "maxBadges");
    if (maxBadges !== undefined) c.groups.maxBadges = int(maxBadges, "groups.max_badges", { min: 0 });
  }

  const p = raw.priority;
  if (p !== undefined && p !== null) {
    if (!isObj(p)) throw new ConfigError("priority must be a map");
    if (p.default !== undefined) c.priority.default = int(p.default, "priority.default");
    c.priority.owners = priorityMap(p.owners, "priority.owners", /^[\w.-]+$/, "an owner name");
    c.priority.repos = priorityMap(p.repos, "priority.repos", /^[\w.-]+\/[\w.-]+$/, "owner/repo");
  }

  const f = raw.featured;
  if (f !== undefined && f !== null) {
    if (!Array.isArray(f)) throw new ConfigError("featured must be a list");
    c.featured = f.map((item, i) => {
      const entry = typeof item === "string" ? { pr: item } : item;
      if (!isObj(entry) || typeof entry.pr !== "string") throw new ConfigError(`featured[${i}] needs a pr like owner/repo#123`);
      if (!PR_REF.test(entry.pr)) throw new ConfigError(`featured[${i}].pr must look like owner/repo#123 (got "${entry.pr}")`);
      if (entry.note !== undefined && typeof entry.note !== "string") throw new ConfigError(`featured[${i}].note must be a string`);
      return entry.note === undefined ? { pr: entry.pr } : { pr: entry.pr, note: entry.note };
    });
  }

  const ex = raw.exclude;
  if (ex !== undefined && ex !== null) {
    if (!Array.isArray(ex)) throw new ConfigError("exclude must be a list");
    c.exclude = ex.map((v, i) => {
      if (typeof v !== "string" || !EXCLUDE_REF.test(v)) {
        throw new ConfigError(`exclude[${i}] must be owner, owner/repo or owner/repo#123 (got ${JSON.stringify(v)})`);
      }
      return v.toLowerCase();
    });
  }

  return c;
}
