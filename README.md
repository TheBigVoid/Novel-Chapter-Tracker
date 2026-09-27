# Novel Chapter Tracker

A small, no-install web page for keeping track of which chapters of your novel are drafted and which are published.

## Features

- **Statuses:** Draft → Revising → Scheduled → Published. Each chapter has a one-click button to move it to the next status.
- **Chapter details:** number, title, word count, publish date, a link to where it's posted, and notes.
- **Overview:** a count for each status, total words written vs. published, and a progress bar.
- **Filter and search:** show only drafts or only published chapters, or search by number, title or notes.
- **Backups:** export everything to a JSON file and import it again, for example to move to another computer.

Marking a chapter **Published** fills in today's date if no date is set.

## Using it

Open `index.html` in any browser. There's nothing to build or install.

Your chapters are saved in that browser's local storage, so they stay put between visits on the same device and browser. Use **Export JSON** now and then as a backup. Clearing your browser data will erase them.

### Hosting it online (optional)

To use it from any device, turn on GitHub Pages: go to **Settings → Pages**, choose **Deploy from a branch**, and select the branch with the root (`/`) folder. The data is still stored separately in each browser, so use Export/Import to move it between devices.

## Files

- `index.html` – page structure
- `styles.css` – styling (follows your system's light/dark mode)
- `app.js` – all the logic and storage
