# SlothMUD EQ Search

A Hugo-powered static EQ search site. The initial data snapshot is in `static/data/items.json`; it contains 6,134 items from the live alpha EQ export, including the four currently hidden items. Those items are marked in the JSON and hidden unless **Include hidden** is selected. Mob and area names were resolved from the existing importer snapshots where a matching mob record was available.

## Run locally

Install Hugo Extended 0.168.0 or later, then run:

```powershell
hugo server
```

Open the local URL printed by Hugo. For a production build, run `hugo --minify`; the output is written to `public/`.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` builds the site and deploys it to GitHub Pages on pushes to `main`. Set the repository's Pages build and deployment source to **GitHub Actions**.

This is a one-off data snapshot. The existing PHP/MySQL importer and export workflow are not connected to this site.

## Search coverage

The client uses the item fields available in the JSON export and preserves the current search precedence: a text/VNUM search takes precedence over the other filters. `%` and `_` act as SQL-style wildcards. Type groups, class levels, 40x requirements, exported stats, and item flags are filtered in the browser. Linked mob/area names are included where the local importer snapshot has a corresponding mob record; some links remain searchable by VNUM only.
