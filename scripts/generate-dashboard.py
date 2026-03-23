#!/usr/bin/env python3
"""
Generate docs/dashboard-data.json from all journal files.
The static docs/index.html loads this file via fetch().
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

TAXONOMY_LEVELS = ["kingdom", "phylum", "class", "order", "family", "genus"]


def main():
    journals_dir = Path("journals")
    docs_dir = Path("docs")
    docs_dir.mkdir(exist_ok=True)

    now = datetime.now(timezone.utc)

    total_open_issues = 0
    total_open_prs = 0
    taxonomy = {level: {} for level in TAXONOMY_LEVELS}
    activity = {"last_day": 0, "last_week": 0, "last_month": 0, "last_year": 0}
    repos_list = []

    for journal_path in sorted(journals_dir.glob("*.json")):
        try:
            with open(journal_path) as f:
                j = json.load(f)
        except Exception as e:
            print(f"  Skipping {journal_path}: {e}")
            continue

        nwo = j.get("nameWithOwner", "")
        open_issues_count = len(j.get("openIssues", []))
        open_prs_count = len(j.get("openPRs", []))
        pushed_at_str = j.get("pushedAt", "")

        total_open_issues += open_issues_count
        total_open_prs += open_prs_count

        # Activity windows
        if pushed_at_str:
            try:
                pushed_at = datetime.fromisoformat(pushed_at_str.replace("Z", "+00:00"))
                age = now - pushed_at
                if age <= timedelta(days=1):
                    activity["last_day"] += 1
                if age <= timedelta(weeks=1):
                    activity["last_week"] += 1
                if age <= timedelta(days=30):
                    activity["last_month"] += 1
                if age <= timedelta(days=365):
                    activity["last_year"] += 1
            except Exception:
                pass

        # Taxonomy from accession
        accession = j.get("accession", {})
        for level in TAXONOMY_LEVELS:
            val = accession.get(level) or "Unknown"
            taxonomy[level][val] = taxonomy[level].get(val, 0) + 1

        repos_list.append({
            "nameWithOwner": nwo,
            "pushedAt": pushed_at_str,
            "journalUpdatedAt": j.get("journalUpdatedAt", ""),
            "openIssues": open_issues_count,
            "openPRs": open_prs_count,
            "screenshotCount": j.get("screenshotCount", 0),
            "screenshotCaptions": j.get("screenshotCaptions", []),
            "accession": accession,
        })

    # Sort by most recently pushed
    repos_list.sort(key=lambda r: r.get("pushedAt", ""), reverse=True)

    data = {
        "generatedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalRepos": len(repos_list),
        "totalOpenIssues": total_open_issues,
        "totalOpenPRs": total_open_prs,
        "taxonomy": taxonomy,
        "activity": activity,
        "repos": repos_list,
    }

    out_path = docs_dir / "dashboard-data.json"
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print(f"Wrote {out_path} ({len(repos_list)} repo(s))")


main()
