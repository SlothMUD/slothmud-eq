# SlothMUD EQ Search

A Hugo-powered static EQ search site. The initial data snapshot is in `static/data/items.json`; it contains 6,134 items from the live alpha EQ export, including the four currently hidden items. Hidden items are excluded by default and can be filtered with the **Hidden** Any/Yes/No control. Mob and area names were resolved from the existing importer snapshots where a matching mob record was available.

## Run locally

Initialize the theme submodules if needed, then install Hugo Extended 0.167.0 (the version range declared by the Blowfish submodule) and run:

```powershell
hugo server
```

Open the local URL printed by Hugo. For a production build, run `hugo --minify`; the output is written to `public/`.

## GitHub Pages

The site uses the SlothMUD and Blowfish themes declared in `.gitmodules`, with site menus and layout settings in `config/_default/`. The workflow in `.github/workflows/pages.yml` builds the site and deploys it to GitHub Pages on pushes to `main`. It publishes the `eq.slothmud.net` custom domain; set the repository's Pages build and deployment source to **GitHub Actions** and configure that domain's DNS for GitHub Pages.

This is a one-off data snapshot. The existing PHP/MySQL importer and export workflow are not connected to this site.

## Search coverage

The client uses the item fields available in the JSON export. Text/VNUM search, type, class-level, stat, and flag filters combine; selecting multiple types matches any selected type, while other active filters further narrow those results. `%` and `_` act as SQL-style wildcards. The first 100 matching items are rendered initially; a button loads the remaining matches on demand. Result groups are collapsible. Type groups, class levels, 40x requirements, exported stats, and item flags are filtered in the browser. Linked mob/area names are included where the local importer snapshot has a corresponding mob record; some links remain searchable by VNUM only.

## Shareable searches

The URL tracks the current search and filters, and **Copy link** copies it for sharing. **Download .json** downloads the complete static item dataset. Opening a shared URL restores the query, categories (`cat`), weapon subtypes (`sub`), stats (`stat`), class levels (`Wa`, `Th`, `Ma`, `Cl`, `Dr`, `Mo`, `Ba`, `Ne`, `Av`), item flags (`forge`, `personal`, `shapeshift`, `temporary`, `drachma`), hidden-item filter (`hidden=yes`, `hidden=no`, or `hidden=any`), and sort order (`sort`). By default hidden items are excluded (`hidden=no`); `hidden=1` remains supported as an alias for `hidden=any`. Default settings are omitted to keep links short.
