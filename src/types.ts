export type OwnerType = "Organization" | "User";

export interface PullRequest {
  owner: string;
  ownerType: OwnerType;
  avatarUrl: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  mergedAt: string; // ISO 8601
  additions: number;
  deletions: number;
}

export type RepoHeadings = "auto" | "always" | "never";
export type GroupSort = "recent" | "count";

export type Layout = "full" | "compact";

export interface Config {
  /** full: the card with featured PRs and groups. compact: one chip per owner. */
  layout: Layout;
  compact: {
    /** Chips wrap to a new row past this width. */
    maxWidth: number;
  };
  title: string;
  /** "auto" or YYYY-MM-DD */
  since: string;
  groups: {
    repos: RepoHeadings;
    sort: GroupSort;
    /** null = no limit */
    maxOwners: number | null;
    maxPrs: number;
  };
  priority: {
    default: number;
    owners: Record<string, number>;
    repos: Record<string, number>;
  };
  featured: { pr: string; note?: string }[];
  /** "owner", "owner/repo" or "owner/repo#123" */
  exclude: string[];
}

/* ---------- view model consumed by the renderer ---------- */

export interface ViewRepo {
  name: string;
  total: number;
  items: PullRequest[];
  hidden: number;
}

export interface ViewOwner {
  login: string;
  type: OwnerType;
  avatarUrl: string;
  total: number;
  /** Present when repo headings are shown for this owner. */
  repos?: ViewRepo[];
  /** Present when PRs are listed directly under the owner. */
  items?: PullRequest[];
  hidden: number;
}

export interface ViewFeatured {
  pr: PullRequest;
  note?: string;
}

export interface CardView {
  title: string;
  totalPrs: number;
  totalOwners: number;
  featured: ViewFeatured[];
  owners: ViewOwner[];
  cutOwners: number;
  cutPrs: number;
  /** YYYY-MM-DD, or null when there is nothing to count */
  since: string | null;
}
