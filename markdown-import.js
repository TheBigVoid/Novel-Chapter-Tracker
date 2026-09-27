// Reads chapter notes written in Markdown (for example an Obsidian vault) and pulls out
// what the tracker needs: chapter number, title, status, word count, tags, arc, date and link.
// Pure functions with no DOM access, exposed as window.MarkdownImport (and module.exports for tests).
(function (root) {
  'use strict';

  // Words people use for a note's status, mapped to the tracker's statuses.
  const STATUS_WORDS = {
    outline: ['outline', 'outlined', 'outlining', 'idea', 'ideas', 'plan', 'planned', 'planning', 'todo', 'to do',
      'concept', 'stub', 'beats', 'notes', 'not started'],
    draft: ['draft', 'drafting', 'drafted', 'first draft', 'rough', 'rough draft', 'wip', 'writing', 'in progress',
      'started'],
    revising: ['revising', 'revision', 'revise', 'revised', 'editing', 'edit', 'edited', 'review', 'in review',
      'beta', 'beta read', 'proofread', 'proofreading', 'second draft', 'rewrite', 'rewriting', 'polishing'],
    scheduled: ['scheduled', 'ready', 'queued', 'queue', 'final', 'done', 'complete', 'completed', 'finished'],
    published: ['published', 'posted', 'released', 'live', 'public', 'uploaded'],
  };
  const STATUS_LOOKUP = new Map();
  for (const [status, words] of Object.entries(STATUS_WORDS)) for (const w of words) STATUS_LOOKUP.set(w, status);

  const NUMBER_KEYS = ['chapter', 'chapter_number', 'chapter-number', 'chapter number', 'chapternumber', 'chapter_no',
    'number', 'ch', 'no', 'order', 'index'];
  const TITLE_KEYS = ['title', 'chapter_title', 'chapter-title', 'chapter title', 'name'];
  const STATUS_KEYS = ['status', 'state', 'stage', 'progress'];
  const DATE_KEYS = ['published', 'publish_date', 'publish-date', 'publish date', 'published_date', 'published_on',
    'release', 'release_date', 'release-date', 'scheduled', 'posted', 'date'];
  const LINK_KEYS = ['link', 'url', 'published_url', 'post_url'];
  const TAG_KEYS = ['tags', 'tag'];
  const ARC_KEYS = ['arc', 'volume', 'book', 'part', 'act', 'saga'];

  const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
  const WORD = /[\p{L}\p{N}]+(?:['’.\-][\p{L}\p{N}]+)*/gu;

  // ---------- front matter ----------

  function splitFrontmatter(text) {
    text = text.replace(/^﻿/, '');
    const m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
    if (!m) return { data: {}, body: text };
    return { data: parseYaml(m[1]), body: text.slice(m[0].length) };
  }

  // A deliberately small YAML reader: top-level `key: value`, inline lists `[a, b]`,
  // and block lists (`key:` followed by `- item` lines). Nested maps are ignored.
  function parseYaml(src) {
    const data = {};
    let listKey = null;
    for (const line of src.split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const item = line.match(/^\s*-\s+(.*)$/) || line.match(/^\s*-$/);
      if (item && listKey) {
        if (item[1] != null) data[listKey].push(scalar(item[1]));
        continue;
      }
      if (/^\s/.test(line)) continue; // nested content we don't understand
      const kv = line.match(/^([^:]+?)\s*:(?:\s+(.*))?$/);
      if (!kv) { listKey = null; continue; }
      const key = kv[1].trim().toLowerCase().replace(/^["']|["']$/g, '');
      const value = (kv[2] || '').trim();
      if (!value) {
        data[key] = [];
        listKey = key;
      } else if (/^\[.*\]$/.test(value) && !/^\[\[/.test(value)) {
        data[key] = splitInline(value.slice(1, -1)).map(scalar);
        listKey = null;
      } else {
        data[key] = scalar(value);
        listKey = null;
      }
    }
    return data;
  }

  function splitInline(s) {
    const out = [];
    let cur = '';
    let quote = null;
    for (const ch of s) {
      if (quote) {
        if (ch === quote) quote = null;
        cur += ch;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        cur += ch;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
  }

  function scalar(v) {
    v = String(v).trim();
    const quoted = v.match(/^"(.*)"$/) || v.match(/^'(.*)'$/);
    if (quoted) {
      v = quoted[1];
    } else {
      v = v.replace(/\s+#.*$/, ''); // trailing comment
      if (/^(true|yes)$/i.test(v)) return true;
      if (/^(false|no)$/i.test(v)) return false;
      if (/^(null|~)$/i.test(v)) return '';
    }
    return v.replace(/^\[\[([^\]|]*)(?:\|([^\]]*))?\]\]$/, (_, a, b) => b || a); // [[wikilink]] -> text
  }

  function pick(data, keys) {
    for (const k of keys) {
      const v = data[k];
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
      return v;
    }
    return undefined;
  }

  // ---------- field extraction ----------

  function toStatus(v) {
    if (v === true) return 'published';
    if (typeof v !== 'string') return null;
    const key = v.toLowerCase()
      .replace(/^#/, '')
      .replace(/.*\//, '')          // "status/draft" -> "draft"
      .replace(/[_-]+/g, ' ')
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .trim();
    if (STATUS_LOOKUP.has(key)) return STATUS_LOOKUP.get(key);
    for (const [word, status] of STATUS_LOOKUP) {
      if (word.length > 3 && new RegExp(`\\b${word}\\b`).test(key)) return status;
    }
    return null;
  }

  function toTags(v) {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : [];
    const seen = new Set();
    const out = [];
    for (const t of list) {
      const tag = String(t).trim().replace(/^#/, '');
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        out.push(tag);
      }
    }
    return out;
  }

  function numberFrom(v) {
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    const m = String(v).match(/\d+/);
    return m ? Number.parseInt(m[0], 10) : null;
  }

  function numberFromName(name) {
    const m = name.match(/(?:^|[^\p{L}])(?:chapter|chap|ch)\.?[\s_\-#]*(\d+)/iu) || name.match(/^\s*(\d+)(?!\d*\s*(?:st|nd|rd|th)\b)/i);
    return m ? Number.parseInt(m[1], 10) : null;
  }

  // "Chapter 12: The Fall" -> "The Fall", "012 - The Fall" -> "The Fall", "Chapter 12" -> ""
  function cleanTitle(s) {
    const t = String(s)
      .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, a, b) => b || a)
      .replace(/[*`]/g, '')
      .replace(/^\s*(?:chapter|chap|ch)\.?[\s_\-#]*\d+\s*/i, '')
      .replace(/^\s*\d+(?=\s*[-–—:.)_]|\s+\p{L})\s*/u, '')
      .replace(/^\s*[-–—:._)]+\s*/, '')
      .replace(/_/g, ' ')
      .trim();
    return /^\d+$/.test(t) ? '' : t;
  }

  function firstHeading(body) {
    const m = body.match(/^#\s+(.+?)\s*#*\s*$/m);
    return m ? m[1] : null;
  }

  function isoDate(v) {
    if (typeof v !== 'string') return '';
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  // ---------- word count ----------

  // Close to Obsidian's own count: front matter, comments, code blocks, embeds and URLs are ignored;
  // link text counts; each Chinese/Japanese character counts as one word.
  function countWords(body) {
    let t = body
      .replace(/%%[\s\S]*?%%/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, ' ')
      .replace(/!\[\[[^\]]*\]\]/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
      .replace(/\[\[([^\]]*)\]\]/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\bhttps?:\/\/\S+/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^\s*>\s*\[![^\]]*\][+-]?/gm, ' '); // callout markers like > [!note]
    const cjk = (t.match(CJK) || []).length;
    t = t.replace(CJK, ' ');
    return (t.match(WORD) || []).length + cjk;
  }

  // ---------- public ----------

  /**
   * @param {string} text  file contents
   * @param {string} path  path relative to the chosen folder (or just the file name)
   */
  function parseNote(text, path) {
    const parts = path.split('/').filter(Boolean);
    const fileName = parts[parts.length - 1] || path;
    const baseName = fileName.replace(/\.(md|markdown|txt)$/i, '');
    const folder = parts.length > 1 ? parts[parts.length - 2] : '';
    const { data, body } = splitFrontmatter(text);
    const heading = firstHeading(body);

    let number = numberFrom(pick(data, NUMBER_KEYS));
    let numberFromWhere = number != null ? 'front matter' : null;
    if (number == null && (number = numberFromName(baseName)) != null) numberFromWhere = 'file name';
    if (number == null && heading && (number = numberFromName(heading)) != null) numberFromWhere = 'heading';

    const fmTitle = pick(data, TITLE_KEYS);
    const title = cleanTitle(typeof fmTitle === 'string' ? fmTitle : heading != null ? heading : baseName);

    const tags = toTags(pick(data, TAG_KEYS));
    let status = toStatus(pick(data, STATUS_KEYS));
    if (!status && data.published === true) status = 'published';
    if (!status) {
      for (const t of tags) {
        const s = /^status\//i.test(t) || STATUS_LOOKUP.has(t.toLowerCase()) ? toStatus(t) : null;
        if (s) { status = s; break; }
      }
    }

    // `arc: The Siege` -> "The Siege"; `volume: 2` -> "Volume 2"
    let arc = '';
    const arcKey = ARC_KEYS.find((k) => pick(data, [k]) !== undefined);
    if (arcKey) {
      const v = data[arcKey];
      const s = String(Array.isArray(v) ? v[0] : v).trim();
      arc = /^\d+$/.test(s) ? `${arcKey[0].toUpperCase()}${arcKey.slice(1)} ${s}` : s;
      if (s === 'true' || s === 'false') arc = '';
    }

    let date = '';
    for (const k of DATE_KEYS) {
      date = isoDate(data[k]);
      if (date) break;
    }

    const link = pick(data, LINK_KEYS);

    return {
      path,
      fileName,
      folder,
      number,
      numberFrom: numberFromWhere,
      title,
      status,
      words: countWords(body),
      tags,
      arc,
      date,
      link: typeof link === 'string' ? link : '',
    };
  }

  const api = { parseNote, countWords, splitFrontmatter, toStatus, cleanTitle, numberFromName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MarkdownImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
