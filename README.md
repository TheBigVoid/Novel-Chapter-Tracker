# Novel Chapter Tracker

A small, no-install web page for keeping track of which chapters of your novels are outlined, drafted, scheduled, and published.

## Features

### Library
- Keep as many novels as you like on one shelf, each with its **cover**. Upload an image, drag one onto the cover, or paste one (Ctrl/⌘+V). It's cropped to 2:3 and shrunk automatically. Novels without a cover get a coloured placeholder with the title.
- Each card shows chapters published, a progress bar, the novel's status, the next release (or anything overdue), and how many chapters are in the buffer.
- Totals across all novels, plus a **calendar** and **writing log** covering every book.

### Novel details
- Title, author / pen name, genre, platform, status (Planning, Ongoing, On hiatus, Completed), synopsis.
- **Release days** (e.g. Mon & Thu), used by the calendar and the buffer.
- **Target chapters** (the progress bar counts towards it) and a **words-per-chapter goal** (unpublished chapters show a bar towards it).

### Chapters
- **Statuses:** Outline → Draft → Revising → Scheduled → Published, with a one-click button to move to the next. Marking a chapter Published fills in today's date if none is set.
- Number, title, arc, word count, date, **tags**, link, notes.
- **Arcs & volumes:** group chapters into arcs, volumes, books or parts. The list is grouped by arc (collapsible), each with its own progress.
- Filter by status (click a tile), arc, or tag (or click a tag on a chapter). Search, and sort by number, status, date, or most recently edited.
- **Add several:** create a whole range at once (e.g. 1–30 as Outline, in Arc 2).
- Most changes can be undone from the message that pops up.

### Buffer
Chapters marked **Scheduled** are your buffer. With release days set, the page says how long it lasts, e.g. *"Buffer: 4 chapters ready, enough for about 2 weeks at Mon & Thu (through Thu, 16 Oct)"*. It warns when the buffer is empty. One click gives undated Scheduled chapters the next free release days, in chapter order.

### Release calendar
A month view of published, scheduled and planned chapters, with words written each day. Release days with nothing scheduled are outlined, so gaps stand out. Click a day to add a chapter on that date. The library calendar shows every novel.

### Writing log & streaks
- Log words per day, or let it happen automatically: when a chapter's word count goes up, the difference is added to today's log (you can turn this off).
- Current and longest streak, words today, last 7 and 30 days, and a 30-day chart.
- Optional daily goal: a day counts towards your streak once you hit it.

### Import from Obsidian / Markdown
Open a novel and choose **Import from Obsidian / Markdown**. Pick files, pick a whole folder, or drag them in. Each note becomes a chapter:

| What | Where it comes from |
|---|---|
| Chapter number | `chapter:` / `number:` in front matter, else the file name (`Chapter 12.md`, `Ch 12 - Title.md`, `012 Title.md`), else the first heading. Notes without one are numbered after your last chapter. |
| Title | `title:` in front matter, else the first `# Heading`, else the file name (with "Chapter 12 –" stripped) |
| Status | `status:` in front matter (understands words like *wip*, *editing*, *ready*, *posted*), or a status tag. Otherwise the default you choose. |
| Words | Counted like Obsidian: front matter, `%% comments %%`, code blocks and embeds are ignored |
| Arc | `arc:` / `volume:` / `book:` / `part:` in front matter, else the subfolder name |
| Tags, date, link | `tags:`, `published:` / `date:`, `link:` / `url:` |

You see a preview first and can untick any file. Hidden folders like `.obsidian` are skipped, and notes in a `Templates` folder start unticked. **Import again any time to refresh word counts.** Existing chapters are matched by file, then by chapter number, and updated; you can also have the new words added to today's writing log.

Example front matter:

```yaml
---
chapter: 12
title: The Fall
status: editing
arc: The Siege
tags: [flashback, needs beta read]
published: 2026-10-02
---
```

### Export & backup
- **Export JSON:** one novel, or everything. **Import JSON** brings novels back or moves them to another device (a novel that's already here is replaced by the imported copy).
- **Export CSV:** one novel, or everything, for Excel or Google Sheets.
- Light, dark, or match-your-system theme.

## Using it

Open `index.html` in any browser. There's nothing to build or install.

Everything is saved in that browser's local storage, so it stays put between visits on the same device and browser. Export a backup now and then; clearing your browser data erases it. Browsers allow roughly 5 MB per site. A cover takes about 10–60 KB, so that's plenty for dozens of novels. The footer shows how much you're using.

### Hosting it online (optional)

To use it from any device, turn on GitHub Pages: go to **Settings → Pages**, choose **Deploy from a branch**, and select the branch with the root (`/`) folder. The data is still stored separately in each browser, so use Export/Import to move it between devices.

## Files

- `index.html`: page structure and dialogs
- `styles.css`: styling (light and dark)
- `app.js`: the app: storage, views, calendar, writing log, import/export
- `markdown-import.js`: reads Markdown / Obsidian notes (front matter, titles, numbers, word counts)
