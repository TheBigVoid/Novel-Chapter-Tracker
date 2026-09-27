# Novel Chapter Tracker

A small, no-install web page for keeping track of which chapters of your novels are outlined, drafted, scheduled, and published.

## Features

### Library
- Keep as many novels as you like on one shelf, each with its **cover**. Upload any image; it's cropped to 2:3 and shrunk automatically. Novels without a cover get a coloured placeholder with the title.
- Each novel card shows how many chapters are published, a progress bar, its status (Planning, Ongoing, On hiatus, Completed), and the next release or anything overdue.
- Totals across all novels: chapters published, chapters in progress, words written.

### Novel details
- Title, author / pen name, genre, platform, release schedule, and synopsis.
- **Target chapters:** the progress bar shows how far you are towards the planned total.
- **Words-per-chapter goal:** unpublished chapters show a mini progress bar towards it.
- **Next release:** shows the next scheduled chapter and date, and warns about scheduled chapters whose date has passed.

### Chapters
- **Statuses:** Outline → Draft → Revising → Scheduled → Published. Each chapter has a one-click button to move it to the next status. Marking one Published fills in today's date if none is set.
- Number, title, word count, date, a link to where it's posted, and notes.
- Click a status tile to show only chapters in that status. Search by number, title or notes. Sort by chapter number, status, date, or most recently edited.
- **Add several:** create a whole range of chapters at once (e.g. 1–30 as Outline).

### Other
- Light, dark, or match-your-system theme.
- **Export all** or **Export this novel** to a JSON file, and **Import** to bring novels back or move them to another device. An imported novel that's already in the library replaces the old copy; other novels are added.
- Data saved by the earlier single-novel version is converted automatically.

## Using it

Open `index.html` in any browser. There's nothing to build or install.

Everything is saved in that browser's local storage, so it stays put between visits on the same device and browser. Export a backup now and then; clearing your browser data erases it. Browsers allow roughly 5 MB per site. A cover takes about 10–60 KB, so that's plenty for dozens of novels. The footer shows how much you're using.

### Hosting it online (optional)

To use it from any device, turn on GitHub Pages: go to **Settings → Pages**, choose **Deploy from a branch**, and select the branch with the root (`/`) folder. The data is still stored separately in each browser, so use Export/Import to move it between devices.

## Files

- `index.html` – page structure and dialogs
- `styles.css` – styling (light and dark)
- `app.js` – all the logic and storage
