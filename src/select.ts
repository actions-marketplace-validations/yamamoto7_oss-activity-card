import type { CardView, Config, PullRequest, ViewOwner, ViewRepo } from "./types.ts";

export const prKey = (pr: Pick<PullRequest, "owner" | "repo" | "number">) =>
  `${pr.owner}/${pr.repo}#${pr.number}`.toLowerCase();
const repoKey = (pr: Pick<PullRequest, "owner" | "repo">) => `${pr.owner}/${pr.repo}`.toLowerCase();

interface Group {
  key: string;
  prs: PullRequest[]; // newest first
  pri: number;
}

function sortGroups<T extends Group>(groups: T[], sort: Config["groups"]["sort"]): T[] {
  const latest = (g: Group) => g.prs[0]?.mergedAt ?? "";
  return groups.sort(
    (a, b) =>
      b.pri - a.pri ||
      (sort === "count" ? b.prs.length - a.prs.length : 0) ||
      latest(b).localeCompare(latest(a)) ||
      a.key.localeCompare(b.key),
  );
}

function isExcluded(pr: PullRequest, exclude: string[]): boolean {
  const o = pr.owner.toLowerCase();
  return exclude.some((e) => e === o || e === repoKey(pr) || e === prKey(pr));
}

/**
 * Turns the fetched pull requests into exactly what the card shows.
 *
 * Visibility rules:
 * - An owner's priority is `priority.owners[owner]`, falling back to `priority.default`.
 * - A repo is shown when `priority.repos[owner/repo]` (or, if unset, the owner's priority) is 0 or more.
 *   So a repo listed explicitly is shown even when its owner is hidden by `default: -1`.
 * - Featured PRs are always shown, in their own section, and are not repeated in the groups.
 */
export function buildView(
  prs: PullRequest[],
  featuredPrs: Map<string, PullRequest>,
  config: Config,
  user: string,
): CardView {
  const me = user.toLowerCase();
  const { priority, groups: g } = config;
  const ownerPri = (owner: string) => priority.owners[owner.toLowerCase()] ?? priority.default;
  const repoVisible = (pr: PullRequest) => (priority.repos[repoKey(pr)] ?? ownerPri(pr.owner)) >= 0;

  const seen = new Set<string>();
  const counted = prs
    .filter((pr) => {
      const k = prKey(pr);
      if (seen.has(k)) return false;
      seen.add(k);
      return (
        pr.owner.toLowerCase() !== me &&
        !isExcluded(pr, config.exclude) &&
        (config.since === "auto" || pr.mergedAt.slice(0, 10) >= config.since)
      );
    })
    .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));

  const visible = counted.filter(repoVisible);

  const featured = config.featured.flatMap((f) => {
    const pr = featuredPrs.get(f.pr.toLowerCase()) ?? prs.find((p) => prKey(p) === f.pr.toLowerCase());
    return pr ? [{ pr, ...(f.note ? { note: f.note } : {}) }] : [];
  });
  const featuredKeys = new Set(featured.map((f) => prKey(f.pr)));

  // Totals cover everything the card represents: the listed groups plus featured PRs.
  const representedMap = new Map<string, PullRequest>();
  for (const pr of visible) representedMap.set(prKey(pr), pr);
  for (const f of featured) if (f.pr.mergedAt) representedMap.set(prKey(f.pr), f.pr);
  const represented = [...representedMap.values()];

  // Group what is left after featured PRs are pulled out.
  const byOwner = new Map<string, PullRequest[]>();
  for (const pr of visible) {
    if (featuredKeys.has(prKey(pr))) continue;
    const k = pr.owner.toLowerCase();
    byOwner.set(k, [...(byOwner.get(k) ?? []), pr]);
  }

  const ownerGroups = sortGroups(
    [...byOwner.entries()].map(([key, list]) => {
      const own = ownerPri(key);
      // An owner shown only because some of its repos are listed takes the highest of those repos' priorities.
      const pri =
        own >= 0 ? own : Math.max(...list.map((pr) => priority.repos[repoKey(pr)] ?? Number.NEGATIVE_INFINITY));
      return { key, prs: list, pri };
    }),
    g.sort,
  );

  const shownGroups = g.maxOwners === null ? ownerGroups : ownerGroups.slice(0, g.maxOwners);
  const cutGroups = ownerGroups.slice(shownGroups.length);

  const owners: ViewOwner[] = shownGroups.map((group) => {
    const first = group.prs[0]!;
    const base = {
      login: first.owner,
      type: first.ownerType,
      avatarUrl: first.avatarUrl,
      total: group.prs.length,
    };

    const byRepo = new Map<string, PullRequest[]>();
    for (const pr of group.prs) byRepo.set(pr.repo, [...(byRepo.get(pr.repo) ?? []), pr]);
    const showRepos = g.repos === "always" || (g.repos === "auto" && byRepo.size >= 2);

    if (!showRepos) {
      return { ...base, items: group.prs.slice(0, g.maxPrs), hidden: Math.max(0, group.prs.length - g.maxPrs) };
    }

    const repoGroups = sortGroups(
      [...byRepo.entries()].map(([name, list]) => ({
        key: name.toLowerCase(),
        name,
        prs: list,
        pri: priority.repos[`${group.key}/${name.toLowerCase()}`] ?? 0,
      })),
      g.sort,
    );
    const repos: ViewRepo[] = repoGroups.map((r) => ({
      name: r.name,
      total: r.prs.length,
      items: r.prs.slice(0, g.maxPrs),
      hidden: Math.max(0, r.prs.length - g.maxPrs),
    }));
    return { ...base, repos, hidden: 0 };
  });

  const earliest = represented.reduce<string | null>(
    (min, pr) => (min === null || pr.mergedAt < min ? pr.mergedAt : min),
    null,
  );

  return {
    title: config.title.replaceAll("{user}", user),
    totalPrs: represented.length,
    totalOwners: new Set(represented.map((pr) => pr.owner.toLowerCase())).size,
    featured,
    owners,
    cutOwners: cutGroups.length,
    cutPrs: cutGroups.reduce((n, grp) => n + grp.prs.length, 0),
    since: config.since !== "auto" ? config.since : earliest ? earliest.slice(0, 10) : null,
  };
}
