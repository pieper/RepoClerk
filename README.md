# RepoClerk

RepoClerk is a caching and coordination layer for the [MorphoDepot](https://github.com/MorphoDepot) Slicer extension. A public dashboard showing the overall health and activity of the MorphoDepot ecosystem is available at **[pieper.github.io/RepoClerk](https://pieper.github.io/RepoClerk/)**.

## Dashboard

The [MorphoDepot Dashboard](https://pieper.github.io/RepoClerk/) is a static web page served via GitHub Pages, automatically regenerated after every journal update. It provides a public view of the MorphoDepot ecosystem without requiring a GitHub account or the Slicer extension:

- **Screenshot gallery** — rotating carousel of specimen images drawn from all repositories
- **Summary bar** — total repository, open issue, and open PR counts at a glance
- **Activity chart** — count of repositories with pushes in the last day, week, month, and year
- **Taxonomy chart** — distribution of specimens by taxonomic level (kingdom through genus), with a dropdown to switch levels
- **Repository table** — one row per repo showing last push date, open issues, open PRs, and screenshot count; clicking a row expands a detail panel with full accession metadata and screenshot thumbnails

The dashboard data is stored in `docs/dashboard-data.json` and loaded client-side, so the HTML shell is fully static. Charts are rendered using [Apache ECharts](https://echarts.apache.org/).

## What It Does

MorphoDepot is a 3D Slicer extension for collaborative specimen segmentation. It coordinates work across many GitHub repositories (each tagged with the `morphodepot` topic and structured as forks). The extension has Search, Annotate, and Review tabs that previously queried the GitHub GraphQL API directly on every refresh — causing latency and rate-limit issues with multiple concurrent users.

RepoClerk solves this by acting as a pre-computed journal of the state of all MorphoDepot repositories. Each MorphoDepot repo gets its own JSON file in `journals/`. MorphoDepot clients maintain a local git clone of RepoClerk and read from it instead of querying GitHub directly.

## Repository Structure

```
RepoClerk/
  README.md
  journals/
    {owner}^{repo}.json       # one file per MorphoDepot repository
  docs/
    index.html                # dashboard page (served via GitHub Pages)
    dashboard.js              # ECharts setup and repo table logic
    dashboard-data.json       # aggregated data, regenerated on every journal update
  scripts/
    drain.py                  # drain-loop logic used by update-repo.yml
    sync-all.py               # discovery and queuing logic used by sync-all.yml
    generate-dashboard.py     # reads journals/, writes docs/dashboard-data.json
  .github/
    workflows/
      update-repo.yml         # drain loop: processes update-request issues, then regenerates dashboard
      sync-all.yml            # cron: queues stale/missing repos, deletes removed ones, regenerates dashboard
```

The `^` separator in filenames is used (rather than `/`) because `/` is not valid in filenames. The `owner` and `repo` fields correspond to a GitHub repository at `github.com/{owner}/{repo}`.

## Journal File Schema

Each file at `journals/{owner}^{repo}.json` has this structure:

```json
{
  "$schema": "...",
  "schemaVersion": 1,
  "nameWithOwner": "owner/repo",
  "journalUpdatedAt": "2026-03-23T10:00:00Z",
  "pushedAt": "2026-03-23T09:55:00Z",
  "openIssues": [
    {
      "number": 5,
      "title": "Segment specimen X",
      "url": "https://github.com/owner/repo/issues/5",
      "author": "github-login",
      "assignees": ["login1", "login2"]
    }
  ],
  "openPRs": [
    {
      "number": 3,
      "title": "Segmentation of specimen X",
      "isDraft": false,
      "url": "https://github.com/owner/repo/pull/3",
      "author": "github-login",
      "closingIssue": {
        "number": 5,
        "title": "Segment specimen X",
        "repoOwner": "owner"
      }
    }
  ],
  "accession": {
    "comment": "Contents of MorphoDepotAccession.json from the repo's main branch, merged in here verbatim"
  },
  "screenshotCount": 3,
  "screenshotCaptions": [
    { "comment": "Contents of screenshots/captions.json from the repo's main branch" }
  ]
}
```

### Field Notes

- **`journalUpdatedAt`**: when this journal file was last written by a RepoClerk action
- **`pushedAt`**: the GitHub `pushedAt` timestamp of the repo at the time the journal was written — used by clients to detect staleness
- **`openIssues`**: all currently open issues; clients filter client-side by assignee using their own `gh auth` identity
- **`openPRs.closingIssue.repoOwner`**: the owner login of the repo the closing issue belongs to — used by the Review tab to determine if the current user is the curator for that PR
- **`accession`**: verbatim contents of `MorphoDepotAccession.json` from main branch — specimen metadata used by the Search tab
- **`screenshotCaptions`**: verbatim contents of `screenshots/captions.json` if present; omitted (or `[]`) if not present

## How MorphoDepot Clients Use RepoClerk

### Setup (once per user)

Clone the RepoClerk repo into the user's local MorphoDepot directory:

```sh
git clone https://github.com/{RepoClerkOrg}/RepoClerk
```

### On Each Tab Refresh

Instead of calling the GitHub GraphQL API, the client:

1. Runs `git pull` on the local RepoClerk clone (fast, no API rate limits)
2. Reads the relevant `journals/*.json` files from disk
3. Filters client-side (e.g., issues assigned to `whoami()`, PRs authored by current user)

### Triggering a Journal Update After State Changes

When MorphoDepot performs a state-changing operation (assign issue, push commits, request review, approve/merge PR, create release), notify RepoClerk:

```sh
gh api repos/{RepoClerkOrg}/RepoClerk/dispatches \
  --method POST \
  --field event_type=update-repo \
  --field client_payload[owner]={owner} \
  --field client_payload[repo]={repo}
```

### Fallback

If the RepoClerk clone is not present or `git pull` fails, MorphoDepot falls back to the existing direct GitHub API calls so the extension remains functional without RepoClerk.

## Key Design Decisions

- **Per-repo files** (not a single combined file) to avoid write conflicts when multiple repos are updated concurrently
- **`^` separator** in filenames for filesystem compatibility
- **Accession data embedded** in the journal so the Search tab requires only a `git pull`, not a separate HTTP fetch per repo
- **Client-side filtering** by assignee/author — the journal stores all open issues/PRs; the client filters using its own identity
- **`pushedAt` preserved** from GitHub so the cron job can detect staleness without fetching full issue/PR data for every repo on every run
- **Cron as safety net** — the primary update path is on-demand dispatch; cron catches gaps and handles initial population
- **`viewerPermission` is NOT in the journal** — this is viewer-specific and cannot be pre-computed; `administratedRepoList()` in MorphoDepot still needs a direct `gh` API call
