import type { OwnerType, PullRequest } from "./types.ts";

const API = "https://api.github.com/graphql";

const PR_FIELDS = `
  number title url mergedAt additions deletions
  repository { name isPrivate owner { __typename login avatarUrl(size: 80) } }
`;

interface RawPr {
  number: number;
  title: string;
  url: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  repository: { name: string; isPrivate: boolean; owner: { __typename: string; login: string; avatarUrl: string } };
}

export class GitHubClient {
  private token: string;
  private userAgent: string;

  constructor(token: string, userAgent = "oss-activity-card") {
    this.token = token;
    this.userAgent = userAgent;
  }

  private async request<T>(query: string, variables: Record<string, unknown> = {}) {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        authorization: `bearer ${this.token}`,
        "content-type": "application/json",
        "user-agent": this.userAgent,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}: ${await res.text()}`);
    return (await res.json()) as { data?: T; errors?: { message: string }[] };
  }

  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const json = await this.request<T>(query, variables);
    if (json.errors?.length) throw new Error(`GitHub API error: ${json.errors.map((e) => e.message).join("; ")}`);
    return json.data as T;
  }

  /**
   * Merged PRs by `user` to repositories the user doesn't own.
   * The search API returns at most 1,000 results, which is the practical ceiling here.
   */
  async mergedPullRequests(user: string, since?: string): Promise<PullRequest[]> {
    const q = `is:pr is:merged is:public author:${user} -user:${user}${since ? ` merged:>=${since}` : ""}`;
    const query = `query($q: String!, $after: String) {
      search(type: ISSUE, query: $q, first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ... on PullRequest { ${PR_FIELDS} } }
      }
    }`;
    const prs: PullRequest[] = [];
    let after: string | null = null;
    for (let page = 0; page < 10; page++) {
      const data: { search: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: Partial<RawPr>[] } } =
        await this.graphql(query, { q, after });
      for (const node of data.search.nodes) {
        if (node.number !== undefined) {
          const pr = toPullRequest(node as RawPr);
          if (pr) prs.push(pr);
        }
      }
      if (!data.search.pageInfo.hasNextPage) break;
      after = data.search.pageInfo.endCursor;
    }
    return prs;
  }

  /** Looks up PRs by "owner/repo#123". Missing or private PRs are left out of the result. */
  async pullRequests(refs: string[]): Promise<Map<string, PullRequest>> {
    const out = new Map<string, PullRequest>();
    if (!refs.length) return out;
    const parts = refs.map((ref, i) => {
      const m = /^([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(ref)!;
      return `p${i}: repository(owner: ${JSON.stringify(m[1])}, name: ${JSON.stringify(m[2])}) { pullRequest(number: ${m[3]}) { ${PR_FIELDS} } }`;
    });
    // A missing repo or PR is an error for that alias only, so read the partial data instead of failing the run.
    const json = await this.request<Record<string, { pullRequest: RawPr | null } | null>>(`query { ${parts.join("\n")} }`);
    refs.forEach((ref, i) => {
      const raw = json.data?.[`p${i}`]?.pullRequest;
      const pr = raw ? toPullRequest(raw, true) : null;
      if (pr) out.set(ref.toLowerCase(), pr);
    });
    return out;
  }
}

function toPullRequest(raw: RawPr, allowUnmerged = false): PullRequest | null {
  if (raw.repository.isPrivate) return null;
  if (!raw.mergedAt && !allowUnmerged) return null;
  const owner = raw.repository.owner;
  return {
    owner: owner.login,
    ownerType: (owner.__typename === "Organization" ? "Organization" : "User") as OwnerType,
    avatarUrl: owner.avatarUrl,
    repo: raw.repository.name,
    number: raw.number,
    title: raw.title,
    url: raw.url,
    mergedAt: raw.mergedAt ?? "",
    additions: raw.additions,
    deletions: raw.deletions,
  };
}

/** Downloads avatars and returns them as data: URIs, since GitHub strips external images from SVGs. */
export async function fetchAvatars(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    [...new Set(urls)].map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const type = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
        if (!type.startsWith("image/")) return;
        const buf = Buffer.from(await res.arrayBuffer());
        out.set(url, `data:${type};base64,${buf.toString("base64")}`);
      } catch {
        // Fall back to the initial tile for this owner.
      }
    }),
  );
  return out;
}
