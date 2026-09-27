(() => {
  'use strict';

  const STORAGE_KEY = 'novel-chapter-tracker:v2';
  const LEGACY_KEY = 'novel-chapter-tracker:v1';

  // Ordered by workflow. The quick-advance button on a chapter moves it to the next one.
  const STATUSES = [
    { id: 'outline',   label: 'Outline',   color: 'var(--outline)' },
    { id: 'draft',     label: 'Draft',     color: 'var(--draft)' },
    { id: 'revising',  label: 'Revising',  color: 'var(--revising)' },
    { id: 'scheduled', label: 'Scheduled', color: 'var(--scheduled)' },
    { id: 'published', label: 'Published', color: 'var(--published)' },
  ];
  const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));
  const statusIndex = (id) => STATUSES.findIndex((s) => s.id === id);

  const NOVEL_STATUSES = [
    { id: 'planning',  label: 'Planning' },
    { id: 'ongoing',   label: 'Ongoing' },
    { id: 'hiatus',    label: 'On hiatus' },
    { id: 'completed', label: 'Completed' },
  ];
  const NOVEL_STATUS_BY_ID = Object.fromEntries(NOVEL_STATUSES.map((s) => [s.id, s]));

  // Background colours for novels without an uploaded cover.
  const COVER_COLORS = ['#4c6ef5', '#d6336c', '#0ca678', '#e8590c', '#7048e8', '#1098ad', '#5c940d', '#495057'];

  const SORTS = {
    'number-asc':  { label: 'Chapter 1 → 9',   fn: (a, b) => a.number - b.number || a.title.localeCompare(b.title) },
    'number-desc': { label: 'Chapter 9 → 1',   fn: (a, b) => b.number - a.number || a.title.localeCompare(b.title) },
    status:        { label: 'By status',       fn: (a, b) => statusIndex(a.status) - statusIndex(b.status) || a.number - b.number },
    date:          { label: 'By date',         fn: (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.number - b.number },
    updated:       { label: 'Recently edited', fn: (a, b) => b.updatedAt - a.updatedAt || a.number - b.number },
  };

  const LIBRARY_TABS = [
    { id: 'shelf', label: 'Novels' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'writing', label: 'Writing log' },
  ];
  const NOVEL_TABS = [
    { id: 'chapters', label: 'Chapters' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'writing', label: 'Writing log' },
  ];

  const MAX_COVER_CHARS = 2_000_000;
  const MAX_BULK = 500;
  const MAX_IMPORT_FILES = 2000;
  const CHART_DAYS = 30;

  const WEEK_START = (() => {
    try {
      const loc = new Intl.Locale(navigator.language || 'en');
      const info = (loc.getWeekInfo && loc.getWeekInfo()) || loc.weekInfo;
      return info && info.firstDay ? info.firstDay % 7 : 1;
    } catch {
      return 1;
    }
  })();
  // Weekday numbers (0 = Sunday) in the order this locale shows a week.
  const WEEK_ORDER = Array.from({ length: 7 }, (_, i) => (WEEK_START + i) % 7);
  const dayName = (d, style = 'short') =>
    new Intl.DateTimeFormat(undefined, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + d)));

  const $ = (id) => document.getElementById(id);
  const els = {
    libraryView: $('library-view'),
    novelView: $('novel-view'),
    newNovelBtn: $('new-novel-btn'),
    libraryStats: $('library-stats'),
    libraryTabs: $('library-tabs'),
    shelf: $('shelf'),
    libraryCalendar: $('library-calendar'),
    libraryWriting: $('library-writing'),

    heroCover: $('hero-cover'),
    heroKicker: $('hero-kicker'),
    heroTitle: $('hero-title'),
    heroAuthor: $('hero-author'),
    heroSynopsis: $('hero-synopsis'),
    nextRelease: $('next-release'),
    bufferLine: $('buffer-line'),
    editNovelBtn: $('edit-novel-btn'),
    arcsBtn: $('arcs-btn'),
    mdImportBtn: $('md-import-btn'),
    exportNovelBtn: $('export-novel-btn'),
    exportNovelCsvBtn: $('export-novel-csv-btn'),
    progress: $('progress'),
    progressCaption: $('progress-caption'),
    novelTabs: $('novel-tabs'),
    novelChapters: $('novel-chapters'),
    novelCalendar: $('novel-calendar'),
    novelWriting: $('novel-writing'),
    statusTiles: $('status-tiles'),
    search: $('search'),
    arcFilter: $('arc-filter'),
    tagFilter: $('tag-filter'),
    sort: $('sort'),
    bulkBtn: $('bulk-btn'),
    addBtn: $('add-btn'),
    list: $('list'),

    themeSelect: $('theme-select'),
    storageInfo: $('storage-info'),
    exportBtn: $('export-btn'),
    exportCsvBtn: $('export-csv-btn'),
    importFile: $('import-file'),

    chapterDialog: $('chapter-dialog'),
    chapterForm: $('chapter-form'),
    chapterDialogTitle: $('chapter-dialog-title'),
    chapterFormError: $('chapter-form-error'),
    chapterDeleteBtn: $('chapter-delete-btn'),
    chapterArcField: $('chapter-arc-field'),
    tagSuggest: $('tag-suggest'),

    novelDialog: $('novel-dialog'),
    novelForm: $('novel-form'),
    novelDialogTitle: $('novel-dialog-title'),
    novelFormError: $('novel-form-error'),
    novelDeleteBtn: $('novel-delete-btn'),
    coverPreview: $('cover-preview'),
    coverFile: $('cover-file'),
    coverRemove: $('cover-remove'),
    releaseDays: $('release-days'),

    bulkDialog: $('bulk-dialog'),
    bulkForm: $('bulk-form'),
    bulkFormError: $('bulk-form-error'),
    bulkArcField: $('bulk-arc-field'),

    arcsDialog: $('arcs-dialog'),
    arcsForm: $('arcs-form'),
    arcList: $('arc-list'),
    arcAdd: $('arc-add'),
    arcsFormError: $('arcs-form-error'),

    mdDialog: $('md-dialog'),
    mdForm: $('md-form'),
    mdDrop: $('md-drop'),
    mdFiles: $('md-files'),
    mdFolder: $('md-folder'),
    mdPreview: $('md-preview'),
    mdFormError: $('md-form-error'),
    mdSubmit: $('md-submit'),

    toast: $('toast'),
    chartTip: $('chart-tip'),
  };

  let state = load();
  let currentId = null;         // novel being viewed, or null for the library
  let libraryTab = 'shelf';
  let novelTab = 'chapters';
  let filter = 'all';
  let arcFilter = 'all';        // 'all', 'none', or an arc id
  let tagFilter = 'all';
  let query = '';
  let calMonth = monthOf(todayIso());
  const collapsedArcs = new Set();
  let editingChapterId = null;
  let editingNovelId = null;    // null while creating a new novel
  let pendingCover = '';        // cover chosen in the novel dialog, applied on save
  let draftArcs = [];           // arcs being edited in the arcs dialog
  let pendingChapterOpen = null; // chapter to open once the novel view is showing
  let mdNotes = [];             // parsed Markdown notes waiting to be imported
  let mdExcluded = new Set();   // paths the user unticked in the preview

  // ---------- persistence ----------

  function emptyState() {
    return { version: 3, settings: normalizeSettings(), novels: [] };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
      return raw ? normalizeLibrary(JSON.parse(raw)) : emptyState();
    } catch {
      return emptyState();
    }
  }

  // Returns false (and rolls back to the last saved state) if the browser refuses the write.
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.removeItem(LEGACY_KEY);
      return true;
    } catch {
      toast('Couldn’t save: browser storage is full. Try a smaller cover, or export a backup and remove old novels.');
      state = load();
      render();
      return false;
    }
  }

  // Saves, re-renders, and offers to undo the change via the toast.
  function commit(snapshot, message) {
    if (!save()) return false;
    render();
    if (message) {
      toast(message, {
        label: 'Undo',
        fn: () => {
          state = normalizeLibrary(JSON.parse(snapshot));
          save();
          render();
        },
      });
    }
    return true;
  }
  const snapshot = () => JSON.stringify(state);

  // Coerces untrusted data (from storage or an imported file) into a valid library.
  // Accepts the current format and the original single-novel format.
  function normalizeLibrary(data) {
    if (!data || typeof data !== 'object') throw new Error('Not a tracker file');
    if (Array.isArray(data.novels)) {
      return {
        version: 3,
        settings: normalizeSettings(data.settings),
        novels: data.novels.filter(isObj).map(normalizeNovel),
      };
    }
    if (Array.isArray(data.chapters)) {
      const hasContent = data.chapters.length || str(data.novelTitle).trim();
      return {
        version: 3,
        settings: normalizeSettings(),
        novels: hasContent ? [normalizeNovel({ title: data.novelTitle, chapters: data.chapters })] : [],
      };
    }
    throw new Error('Not a tracker file');
  }

  function normalizeSettings(s) {
    s = isObj(s) ? s : {};
    return {
      theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : 'system',
      sort: SORTS[s.sort] ? s.sort : 'number-asc',
      dailyGoal: positiveInt(s.dailyGoal),
      autoLog: s.autoLog !== false,
    };
  }

  function normalizeNovel(n) {
    const now = Date.now();
    const arcs = (Array.isArray(n.arcs) ? n.arcs : [])
      .filter(isObj)
      .map((a) => ({ id: str(a.id) || newId(), name: str(a.name).trim() || 'Untitled arc' }));
    const arcIds = new Set(arcs.map((a) => a.id));
    return {
      id: str(n.id) || newId(),
      title: str(n.title).trim() || 'Untitled novel',
      author: str(n.author),
      genre: str(n.genre),
      platform: str(n.platform),
      synopsis: str(n.synopsis),
      status: NOVEL_STATUS_BY_ID[n.status] ? n.status : 'ongoing',
      cover: safeCover(n.cover),
      color: /^#[0-9a-f]{6}$/i.test(n.color) ? n.color : randomColor(),
      targetChapters: positiveInt(n.targetChapters),
      wordGoal: positiveInt(n.wordGoal),
      releaseDays: normalizeDays(n.releaseDays, n.schedule),
      arcs,
      log: normalizeLog(n.log),
      createdAt: toInt(n.createdAt) ?? now,
      updatedAt: toInt(n.updatedAt) ?? now,
      chapters: (Array.isArray(n.chapters) ? n.chapters : []).filter(isObj).map((c) => normalizeChapter(c, arcIds)),
    };
  }

  function normalizeChapter(c, arcIds) {
    return {
      id: str(c.id) || newId(),
      number: toInt(c.number) ?? 0,
      title: str(c.title),
      status: STATUS_BY_ID[c.status] ? c.status : 'draft',
      arcId: arcIds && arcIds.has(c.arcId) ? c.arcId : '',
      words: toInt(c.words),
      date: isIso(c.date) ? c.date : '',
      link: safeUrl(c.link),
      tags: normalizeTags(c.tags),
      notes: str(c.notes),
      source: str(c.source),
      updatedAt: toInt(c.updatedAt) ?? 0,
    };
  }

  // Release days are weekday numbers (0 = Sunday). Older data had a free-text schedule like "Mon & Thu".
  function normalizeDays(days, legacyText) {
    if (Array.isArray(days)) {
      return [...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    }
    const text = str(legacyText).toLowerCase();
    const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return names.map((nm, i) => (new RegExp(`\\b${nm}`).test(text) ? i : -1)).filter((i) => i >= 0);
  }

  function normalizeLog(log) {
    const byDate = new Map();
    for (const e of Array.isArray(log) ? log : []) {
      if (!isObj(e) || !isIso(e.date)) continue;
      const w = toInt(e.words);
      if (w) byDate.set(e.date, (byDate.get(e.date) || 0) + w);
    }
    return [...byDate].map(([date, words]) => ({ date, words })).sort((a, b) => a.date.localeCompare(b.date));
  }

  function normalizeTags(v) {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
    const seen = new Set();
    const out = [];
    for (const t of list) {
      const tag = str(t).trim().replace(/^#/, '').slice(0, 60);
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        out.push(tag);
      }
    }
    return out;
  }

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function str(v) { return typeof v === 'string' ? v : ''; }
  function isIso(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

  function toInt(v) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function positiveInt(v) {
    const n = toInt(v);
    return n ? n : null;
  }

  function safeUrl(v) {
    if (typeof v !== 'string' || !v.trim()) return '';
    try {
      const u = new URL(v.trim());
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
    } catch {
      return '';
    }
  }

  function safeCover(v) {
    return typeof v === 'string'
      && v.length <= MAX_COVER_CHARS
      && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '';
  }

  function newId() {
    return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function randomColor() {
    return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
  }

  // ---------- dates (ISO strings, UTC maths so DST never shifts a day) ----------

  function todayIso() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function parseIso(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const toIso = (dt) => dt.toISOString().slice(0, 10);
  function addDays(iso, n) {
    const d = parseIso(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return toIso(d);
  }
  const weekday = (iso) => parseIso(iso).getUTCDay();
  function monthOf(iso) {
    const [y, m] = iso.split('-').map(Number);
    return { y, m: m - 1 };
  }

  function fmtDate(iso, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
    if (!iso) return '';
    return parseIso(iso).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
  }

  // The next `count` release dates on or after `from`.
  function releaseDates(days, from, count) {
    const out = [];
    if (!days.length) return out;
    for (let d = from, i = 0; out.length < count && i < 3700; i++, d = addDays(d, 1)) {
      if (days.includes(weekday(d))) out.push(d);
    }
    return out;
  }

  function daysLabel(days) {
    const ordered = WEEK_ORDER.filter((d) => days.includes(d));
    if (ordered.length === 7) return 'daily';
    return ordered.map((d) => dayName(d)).join(' & ').replace(/ & (?=.* & )/g, ', ');
  }

  // ---------- helpers ----------

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children) if (c != null && c !== false) node.append(c);
    return node;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs = {}, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
    for (const c of children) if (c != null) node.append(c);
    return node;
  }

  function fmt(n) { return (n || 0).toLocaleString(); }
  function compact(n) {
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);
  }

  function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'novel';
  }

  function plural(n, word, pluralWord = `${word}s`) { return `${fmt(n)} ${n === 1 ? word : pluralWord}`; }

  let toastTimer;
  function toast(msg, action) {
    els.toast.replaceChildren(el('span', {}, msg));
    if (action) {
      els.toast.append(el('button', {
        class: 'toast-action',
        type: 'button',
        onclick: () => { els.toast.hidden = true; action.fn(); },
      }, action.label));
    }
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, action ? 8000 : 4000);
  }

  function getNovel(id) { return state.novels.find((n) => n.id === id); }
  function currentNovel() { return getNovel(currentId); }
  function touch(n) { n.updatedAt = Date.now(); }
  function arcName(n, arcId) { const a = n.arcs.find((x) => x.id === arcId); return a ? a.name : ''; }
  const maxNumber = (n) => n.chapters.reduce((max, x) => Math.max(max, x.number), 0);

  function chapterStats(chapters) {
    const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0]));
    let words = 0;
    let publishedWords = 0;
    for (const c of chapters) {
      counts[c.status]++;
      words += c.words || 0;
      if (c.status === 'published') publishedWords += c.words || 0;
    }
    return { counts, total: chapters.length, words, publishedWords };
  }

  function releaseInfo(n) {
    const today = todayIso();
    const scheduled = n.chapters
      .filter((c) => c.status === 'scheduled' && c.date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
    return {
      next: scheduled.find((c) => c.date >= today),
      overdue: scheduled.filter((c) => c.date < today),
    };
  }

  // Buffer = chapters that are ready to go out (Scheduled). With release days we can say how long it lasts.
  function bufferInfo(n) {
    const ready = n.chapters.filter((c) => c.status === 'scheduled');
    const undated = ready.filter((c) => !c.date).length;
    const days = n.releaseDays;
    let until = null;
    let weeks = null;
    if (days.length && ready.length) {
      until = releaseDates(days, todayIso(), ready.length).at(-1);
      weeks = ready.length / days.length;
    }
    return { count: ready.length, undated, until, weeks };
  }

  function weeksLabel(w) {
    if (w < 1) return 'under a week';
    const r = Math.round(w * 2) / 2;
    return `about ${r === 1 ? '1 week' : `${r} weeks`}`;
  }

  // Progress bar segments. With a target, widths are relative to it, so the empty part shows what's left.
  function progressSegments(stats, target) {
    const denom = Math.max(target || 0, stats.total) || 1;
    return [...STATUSES].reverse().map((s) =>
      el('span', {
        style: `width:${(stats.counts[s.id] / denom) * 100}%;background:${s.color}`,
        title: `${s.label}: ${stats.counts[s.id]}`,
      }),
    );
  }

  function coverEl(n) {
    if (n.cover) return el('img', { class: 'cover', src: n.cover, alt: `Cover of ${n.title}` });
    return el('div', { class: 'cover placeholder', style: `--cover:${n.color}`, role: 'img', 'aria-label': `${n.title} (no cover)` },
      el('span', { class: 'ph-title' }, n.title),
      n.author ? el('span', { class: 'ph-author' }, n.author) : null,
    );
  }

  function allTags(n) {
    const seen = new Map();
    for (const c of n.chapters) for (const t of c.tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }

  // ---------- writing log ----------

  function addLog(n, date, words) {
    if (!words) return;
    const e = n.log.find((x) => x.date === date);
    if (e) e.words += words;
    else n.log.push({ date, words });
    n.log.sort((a, b) => a.date.localeCompare(b.date));
  }

  function logTotals(novels) {
    const m = new Map();
    for (const n of novels) for (const e of n.log) m.set(e.date, (m.get(e.date) || 0) + e.words);
    return m;
  }

  // A day counts toward a streak when you hit your daily goal (or wrote anything, with no goal set).
  function streaks(totals) {
    const goal = state.settings.dailyGoal || 1;
    const hit = (d) => (totals.get(d) || 0) >= goal;
    const today = todayIso();
    let current = 0;
    let d = hit(today) ? today : addDays(today, -1);
    while (hit(d)) { current++; d = addDays(d, -1); }
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const date of [...totals.keys()].filter(hit).sort()) {
      run = prev && addDays(prev, 1) === date ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = date;
    }
    return { current, longest, today: totals.get(today) || 0 };
  }

  function sumSince(totals, from) {
    let s = 0;
    for (const [d, w] of totals) if (d >= from) s += w;
    return s;
  }

  // ---------- routing ----------

  function route() {
    const m = location.hash.match(/^#\/novel\/(.+)$/);
    const id = m ? decodeURIComponent(m[1]) : null;
    const next = id && getNovel(id) ? id : null;
    if (id && !next) history.replaceState(null, '', '#/');
    if (next !== currentId) {
      currentId = next;
      filter = 'all';
      arcFilter = 'all';
      tagFilter = 'all';
      query = '';
      els.search.value = '';
      collapsedArcs.clear();
      window.scrollTo(0, 0);
    }
    render();
    if (pendingChapterOpen && currentId) {
      const c = pendingChapterOpen;
      pendingChapterOpen = null;
      openChapterDialog(c);
    }
  }

  function goTo(id) { location.hash = id ? `#/novel/${encodeURIComponent(id)}` : '#/'; }

  // ---------- rendering ----------

  function render() {
    applyTheme();
    els.chartTip.hidden = true;
    const n = currentNovel();
    els.libraryView.hidden = !!n;
    els.novelView.hidden = !n;
    if (n) renderNovel(n);
    else renderLibrary();
    renderFooter();
  }

  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    els.themeSelect.value = t;
  }

  function renderFooter() {
    const kb = Math.ceil((localStorage.getItem(STORAGE_KEY) || '').length / 1024);
    els.storageInfo.textContent = `Saved in this browser · ${fmt(kb)} KB used`;
  }

  function renderTabs(host, tabs, current, onPick) {
    host.replaceChildren(...tabs.map((t) => el('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      'aria-selected': String(t.id === current),
      onclick: () => onPick(t.id),
    }, t.label)));
  }

  // ----- library -----

  function renderLibrary() {
    document.title = 'Novel Chapter Tracker';
    const novels = [...state.novels].sort((a, b) => b.updatedAt - a.updatedAt);
    let published = 0, inProgress = 0, words = 0;
    for (const n of novels) {
      const s = chapterStats(n.chapters);
      published += s.counts.published;
      inProgress += s.total - s.counts.published;
      words += s.words;
    }
    const st = streaks(logTotals(novels));

    els.libraryStats.hidden = !novels.length;
    els.libraryStats.replaceChildren(
      stat('Novels', fmt(novels.length)),
      stat('Chapters published', fmt(published)),
      stat('Chapters in progress', fmt(inProgress)),
      stat('Words written', fmt(words)),
      stat('Writing streak', plural(st.current, 'day')),
    );

    els.libraryTabs.hidden = !novels.length;
    renderTabs(els.libraryTabs, LIBRARY_TABS, libraryTab, (t) => { libraryTab = t; render(); });
    const tab = novels.length ? libraryTab : 'shelf';
    els.shelf.hidden = tab !== 'shelf';
    els.libraryCalendar.hidden = tab !== 'calendar';
    els.libraryWriting.hidden = tab !== 'writing';

    if (tab === 'calendar') renderCalendar(els.libraryCalendar, null);
    else if (tab === 'writing') renderWriting(els.libraryWriting, null);
    else if (!novels.length) {
      els.shelf.replaceChildren(el('div', { class: 'empty' },
        'No novels yet. ',
        el('button', { class: 'btn primary', type: 'button', onclick: () => openNovelDialog() }, '+ Add your first novel'),
      ));
    } else {
      els.shelf.replaceChildren(
        ...novels.map(novelCard),
        el('button', { class: 'new-card', type: 'button', onclick: () => openNovelDialog() }, '+ New novel'),
      );
    }
  }

  function stat(label, value) {
    return el('div', { class: 'stat' }, el('div', { class: 'value' }, value), el('div', { class: 'label' }, label));
  }

  function novelCard(n) {
    const s = chapterStats(n.chapters);
    const { next, overdue } = releaseInfo(n);
    const buf = bufferInfo(n);
    const extra = [];
    if (overdue.length) extra.push(el('span', { class: 'warn' }, `${overdue.length} overdue`));
    else if (next) extra.push(el('span', {}, `Next: Ch. ${next.number} · ${fmtDate(next.date, { month: 'short', day: 'numeric' })}`));
    if (buf.count) extra.push(el('span', {}, `${buf.count} in buffer`));

    return el('a', { class: 'novel-card', href: `#/novel/${encodeURIComponent(n.id)}` },
      coverEl(n),
      el('div', {},
        el('div', { class: 'card-title' }, n.title),
        n.author || n.genre ? el('div', { class: 'card-sub' }, [n.author, n.genre].filter(Boolean).join(' · ')) : null,
      ),
      el('div', { class: 'mini-progress', 'aria-hidden': 'true' }, ...progressSegments(s, n.targetChapters)),
      el('div', { class: 'card-row' },
        el('span', {}, `${fmt(s.counts.published)}/${fmt(n.targetChapters || s.total)} published`),
        el('span', { class: 'pill' }, NOVEL_STATUS_BY_ID[n.status].label),
      ),
      extra.length ? el('div', { class: 'card-row' }, ...extra) : null,
    );
  }

  // ----- novel -----

  function renderNovel(n) {
    document.title = `${n.title} · Chapter Tracker`;
    const s = chapterStats(n.chapters);

    els.heroCover.replaceChildren(coverEl(n));
    els.heroKicker.replaceChildren(
      el('span', { class: 'pill' }, NOVEL_STATUS_BY_ID[n.status].label),
      ...[n.genre, n.platform, n.releaseDays.length && `Releases ${daysLabel(n.releaseDays)}`]
        .filter(Boolean).map((t) => el('span', {}, t)),
    );
    els.heroTitle.textContent = n.title;
    els.heroAuthor.textContent = n.author ? `by ${n.author}` : '';
    els.heroAuthor.hidden = !n.author;
    els.heroSynopsis.textContent = n.synopsis;
    els.heroSynopsis.hidden = !n.synopsis;

    const { next, overdue } = releaseInfo(n);
    const parts = [];
    if (next) {
      parts.push(`Next release: Chapter ${next.number}${next.title ? ` “${next.title}”` : ''} on ${fmtDate(next.date, { weekday: 'short', month: 'short', day: 'numeric' })}`);
    }
    if (overdue.length) {
      parts.push(el('span', { class: 'warn' }, `${plural(overdue.length, 'scheduled chapter')} past ${overdue.length === 1 ? 'its' : 'their'} date`));
    }
    els.nextRelease.replaceChildren(...parts.flatMap((p, i) => (i ? [' · ', p] : [p])));
    els.nextRelease.hidden = !parts.length;
    renderBuffer(n);

    els.progress.replaceChildren(...progressSegments(s, n.targetChapters));
    const pub = s.counts.published;
    const captionParts = [
      n.targetChapters
        ? `${fmt(pub)} of ${fmt(n.targetChapters)} planned chapters published (${Math.round((pub / n.targetChapters) * 100)}%)`
        : `${fmt(pub)} of ${plural(s.total, 'chapter')} published`,
      `${fmt(s.words)} words written`,
      `${fmt(s.publishedWords)} published`,
    ];
    if (pub) captionParts.push(`avg ${fmt(Math.round(s.publishedWords / pub))} words per published chapter`);
    els.progressCaption.textContent = captionParts.join(' · ');

    renderTabs(els.novelTabs, NOVEL_TABS, novelTab, (t) => { novelTab = t; render(); });
    els.novelChapters.hidden = novelTab !== 'chapters';
    els.novelCalendar.hidden = novelTab !== 'calendar';
    els.novelWriting.hidden = novelTab !== 'writing';
    if (novelTab === 'calendar') renderCalendar(els.novelCalendar, n);
    else if (novelTab === 'writing') renderWriting(els.novelWriting, n);
    else renderChapters(n, s);
  }

  function renderBuffer(n) {
    const b = bufferInfo(n);
    const parts = [];
    if (b.count) {
      let text = `Buffer: ${plural(b.count, 'chapter')} ready`;
      if (b.until) text += `, enough for ${weeksLabel(b.weeks)} at ${daysLabel(n.releaseDays)} (through ${fmtDate(b.until, { weekday: 'short', month: 'short', day: 'numeric' })})`;
      parts.push(text);
      if (!n.releaseDays.length) parts.push(el('span', { class: 'muted' }, 'Set release days in “Edit details” to see how long it lasts.'));
      if (b.undated && n.releaseDays.length) {
        parts.push(el('button', { class: 'btn small', type: 'button', onclick: () => assignDates(n) },
          `Give ${plural(b.undated, 'undated chapter')} release dates`));
      }
    } else if (n.releaseDays.length && n.status === 'ongoing') {
      parts.push(el('span', { class: 'warn' }, 'Buffer empty: no chapters are marked Scheduled.'));
    }
    els.bufferLine.replaceChildren(...parts.flatMap((p, i) => (i ? [' ', p] : [p])));
    els.bufferLine.hidden = !parts.length;
  }

  // Gives undated Scheduled chapters the next free release days, in chapter order,
  // after anything already scheduled so the order stays right.
  function assignDates(n) {
    const snap = snapshot();
    const today = todayIso();
    const dated = n.chapters.filter((c) => c.date && (c.status === 'scheduled' || c.status === 'published'));
    const taken = new Set(dated.map((c) => c.date));
    const lastScheduled = n.chapters
      .filter((c) => c.status === 'scheduled' && c.date >= today)
      .reduce((max, c) => (c.date > max ? c.date : max), '');
    let d = lastScheduled ? addDays(lastScheduled, 1) : today;
    const undated = n.chapters.filter((c) => c.status === 'scheduled' && !c.date).sort((a, b) => a.number - b.number);
    for (const c of undated) {
      let guard = 0;
      while ((!n.releaseDays.includes(weekday(d)) || taken.has(d)) && guard++ < 3700) d = addDays(d, 1);
      c.date = d;
      c.updatedAt = Date.now();
      taken.add(d);
      d = addDays(d, 1);
    }
    touch(n);
    commit(snap, `Scheduled ${plural(undated.length, 'chapter')} on your release days.`);
  }

  // ----- chapters tab -----

  function renderChapters(n, s) {
    els.statusTiles.replaceChildren(
      tile('all', 'All', s.total, null),
      ...STATUSES.map((st) => tile(st.id, st.label, s.counts[st.id], st.color)),
    );

    // Arc filter
    if (arcFilter !== 'all' && arcFilter !== 'none' && !n.arcs.some((a) => a.id === arcFilter)) arcFilter = 'all';
    els.arcFilter.hidden = !n.arcs.length;
    els.arcFilter.replaceChildren(
      el('option', { value: 'all' }, 'All arcs'),
      ...n.arcs.map((a) => el('option', { value: a.id }, a.name)),
      el('option', { value: 'none' }, 'No arc'),
    );
    els.arcFilter.value = arcFilter;

    // Tag filter
    const tags = allTags(n);
    if (tagFilter !== 'all') tagFilter = tags.find((t) => t.toLowerCase() === tagFilter.toLowerCase()) || 'all';
    els.tagFilter.hidden = !tags.length;
    els.tagFilter.replaceChildren(
      el('option', { value: 'all' }, 'All tags'),
      ...tags.map((t) => el('option', { value: t }, `#${t}`)),
    );
    els.tagFilter.value = tagFilter;

    renderList(n);
  }

  function tile(id, label, count, color) {
    return el('button', {
      class: 'tile',
      type: 'button',
      'aria-pressed': String(filter === id),
      style: color ? `--status-color:${color}` : null,
      onclick: () => { filter = filter === id ? 'all' : id; renderNovel(currentNovel()); },
    },
      el('div', { class: 'value' }, fmt(count)),
      el('div', { class: 'label' }, color ? el('span', { class: 'dot' }) : null, label),
    );
  }

  function renderList(n) {
    const q = query.trim().toLowerCase();
    const tf = tagFilter.toLowerCase();
    const sort = state.settings.sort;
    const visible = n.chapters
      .filter((c) => filter === 'all' || c.status === filter)
      .filter((c) => arcFilter === 'all' || (arcFilter === 'none' ? !c.arcId : c.arcId === arcFilter))
      .filter((c) => tagFilter === 'all' || c.tags.some((t) => t.toLowerCase() === tf))
      .filter((c) => !q || `${c.number} ${c.title} ${c.notes} ${c.tags.join(' ')}`.toLowerCase().includes(q))
      .sort(SORTS[sort].fn);

    if (!visible.length) {
      els.list.replaceChildren(el('div', { class: 'empty' }, n.chapters.length
        ? 'No chapters match these filters.'
        : 'No chapters yet. Use “+ Add chapter”, “Add several”, or import your notes from Obsidian.'));
      return;
    }
    const today = todayIso();

    // Group by arc when there are arcs and the list is in chapter order.
    const grouped = n.arcs.length && arcFilter === 'all' && (sort === 'number-asc' || sort === 'number-desc');
    if (!grouped) {
      els.list.replaceChildren(...visible.map((c) => chapterRow(n, c, today)));
      return;
    }
    const groups = [...n.arcs.map((a) => ({ id: a.id, name: a.name })), { id: '', name: 'No arc' }];
    if (sort === 'number-desc') groups.reverse();
    const out = [];
    for (const g of groups) {
      const items = visible.filter((c) => c.arcId === g.id);
      if (!items.length) continue;
      const all = n.chapters.filter((c) => c.arcId === g.id);
      out.push(arcGroup(g, items, chapterStats(all), n, today));
    }
    els.list.replaceChildren(...out);
  }

  function arcGroup(g, items, s, n, today) {
    const key = g.id || '__none__';
    const details = el('details', { class: 'arc-group', open: !collapsedArcs.has(key) },
      el('summary', {},
        el('span', { class: 'arc-name' }, g.name),
        el('span', { class: 'arc-meta' },
          `${fmt(s.counts.published)}/${fmt(s.total)} published · ${fmt(s.words)} words`),
        el('span', { class: 'mini-progress arc-progress', 'aria-hidden': 'true' }, ...progressSegments(s)),
      ),
      el('div', { class: 'arc-items' }, ...items.map((c) => chapterRow(n, c, today))),
    );
    details.addEventListener('toggle', () => {
      if (details.open) collapsedArcs.delete(key);
      else collapsedArcs.add(key);
    });
    return details;
  }

  function chapterRow(n, c, today) {
    const s = STATUS_BY_ID[c.status];
    const next = STATUSES[statusIndex(c.status) + 1];

    const meta = [];
    if (n.wordGoal && c.status !== 'published') {
      const pct = Math.min(100, ((c.words || 0) / n.wordGoal) * 100);
      meta.push(el('span', { class: 'goal', title: `${Math.round(pct)}% of your ${fmt(n.wordGoal)}-word goal` },
        `${fmt(c.words)} / ${fmt(n.wordGoal)} words`,
        el('span', { class: 'bar' }, el('span', { style: `width:${pct}%` })),
      ));
    } else if (c.words) {
      meta.push(el('span', {}, `${fmt(c.words)} words`));
    }
    if (c.date) {
      const label = { published: 'Published', scheduled: 'Scheduled for' }[c.status] || 'Planned for';
      meta.push(el('span', {}, `${label} ${fmtDate(c.date)}`));
      if (c.status === 'scheduled' && c.date < today) meta.push(el('span', { class: 'warn' }, 'Past scheduled date'));
    }
    if (c.arcId && (arcFilter !== 'all' || !['number-asc', 'number-desc'].includes(state.settings.sort))) {
      meta.push(el('span', {}, arcName(n, c.arcId)));
    }
    if (c.link) {
      meta.push(el('a', {
        href: c.link, target: '_blank', rel: 'noopener noreferrer',
        onclick: (e) => e.stopPropagation(),
      }, 'Open link ↗'));
    }

    const tags = c.tags.length ? el('div', { class: 'tags' }, ...c.tags.map((t) => el('button', {
      class: 'tag',
      type: 'button',
      title: `Show chapters tagged #${t}`,
      'aria-pressed': String(tagFilter.toLowerCase() === t.toLowerCase()),
      onclick: (e) => {
        e.stopPropagation();
        tagFilter = tagFilter.toLowerCase() === t.toLowerCase() ? 'all' : t;
        renderNovel(currentNovel());
      },
    }, `#${t}`))) : null;

    return el('article', {
      class: 'chapter',
      style: `--status-color:${s.color}`,
      tabindex: '0',
      'aria-label': `Chapter ${c.number}${c.title ? `: ${c.title}` : ''}, ${s.label}`,
      onclick: () => openChapterDialog(c.id),
      onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openChapterDialog(c.id); },
    },
      el('div', { class: 'num' }, String(c.number)),
      el('div', {},
        el('div', { class: 'title' }, c.title || `Chapter ${c.number}`),
        meta.length ? el('div', { class: 'meta' }, ...meta) : null,
        tags,
        c.notes ? el('div', { class: 'notes' }, c.notes) : null,
      ),
      el('div', { class: 'actions' },
        el('span', { class: 'pill' }, el('span', { class: 'dot' }), s.label),
        next ? el('button', {
          class: 'btn small',
          type: 'button',
          title: `Move to ${next.label}`,
          onclick: (e) => { e.stopPropagation(); advance(c.id, next.id); },
        }, `→ ${next.label}`) : null,
      ),
    );
  }

  // ----- calendar -----

  // `n` is a novel, or null for every novel.
  function renderCalendar(host, n) {
    const novels = n ? [n] : state.novels;
    const { y, m } = calMonth;
    const first = toIso(new Date(Date.UTC(y, m, 1)));
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lead = (weekday(first) - WEEK_START + 7) % 7;
    const start = addDays(first, -lead);
    const weeks = Math.ceil((lead + daysInMonth) / 7);
    const today = todayIso();

    const byDate = new Map();
    for (const nv of novels) {
      for (const c of nv.chapters) {
        if (!c.date) continue;
        if (!byDate.has(c.date)) byDate.set(c.date, []);
        byDate.get(c.date).push({ n: nv, c });
      }
    }
    const written = logTotals(novels);

    const monthLabel = new Date(Date.UTC(y, m, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const shift = (delta) => {
      const d = new Date(Date.UTC(y, m + delta, 1));
      calMonth = { y: d.getUTCFullYear(), m: d.getUTCMonth() };
      render();
    };

    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i);
      const inMonth = d.slice(0, 7) === first.slice(0, 7);
      const items = (byDate.get(d) || []).sort((a, b) => a.n.title.localeCompare(b.n.title) || a.c.number - b.c.number);
      const isRelease = n && n.releaseDays.includes(weekday(d)) && d >= today;
      const openSlot = isRelease && !items.some((x) => x.c.status === 'scheduled' || x.c.status === 'published');
      const words = written.get(d);

      const cls = ['cal-day'];
      if (!inMonth) cls.push('other-month');
      if (d === today) cls.push('today');
      if (openSlot) cls.push('open-slot');

      cells.push(el('div', {
        class: cls.join(' '),
        role: 'gridcell',
        title: openSlot ? 'Release day with nothing scheduled. Click to add a chapter.' : null,
        onclick: n ? (e) => {
          if (e.target.closest('.cal-chip')) return;
          openChapterDialog(null, { date: d, status: d >= today ? 'scheduled' : 'published' });
        } : null,
      },
        el('div', { class: 'cal-date' },
          el('span', { class: 'cal-num' }, String(Number(d.slice(8)))),
          words ? el('span', { class: 'cal-words', title: `${fmt(words)} words written` }, `✎ ${compact(words)}`) : null,
        ),
        ...items.map(({ n: nv, c }) => el('button', {
          class: 'cal-chip',
          type: 'button',
          style: `--status-color:${STATUS_BY_ID[c.status].color}`,
          title: `${n ? '' : `${nv.title}: `}Chapter ${c.number}${c.title ? ` “${c.title}”` : ''} (${STATUS_BY_ID[c.status].label})`,
          onclick: () => {
            if (n) openChapterDialog(c.id);
            else { pendingChapterOpen = c.id; novelTab = 'calendar'; goTo(nv.id); }
          },
        },
          el('span', { class: 'dot' }),
          n ? null : el('span', { class: 'chip-novel' }, nv.title),
          el('span', { class: 'chip-num' }, `Ch ${c.number}`),
        )),
      ));
    }

    host.replaceChildren(
      el('div', { class: 'cal-head' },
        el('button', { class: 'btn small', type: 'button', 'aria-label': 'Previous month', onclick: () => shift(-1) }, '‹'),
        el('h2', { class: 'cal-title' }, monthLabel),
        el('button', { class: 'btn small', type: 'button', 'aria-label': 'Next month', onclick: () => shift(1) }, '›'),
        el('button', { class: 'btn small', type: 'button', onclick: () => { calMonth = monthOf(today); render(); } }, 'Today'),
      ),
      el('div', { class: 'calendar', role: 'grid', 'aria-label': monthLabel },
        ...WEEK_ORDER.map((d) => el('div', { class: 'cal-weekday', role: 'columnheader' }, dayName(d))),
        ...cells,
      ),
      el('div', { class: 'cal-legend' },
        ...STATUSES.map((s) => el('span', { style: `--status-color:${s.color}` }, el('span', { class: 'dot' }), s.label)),
        n && n.releaseDays.length ? el('span', {}, el('span', { class: 'legend-slot' }), 'Release day with nothing scheduled') : null,
        el('span', {}, '✎ words written that day'),
        n ? el('span', { class: 'muted' }, 'Click a day to add a chapter on that date.') : null,
      ),
    );
  }

  // ----- writing log -----

  function renderWriting(host, n) {
    const novels = n ? [n] : state.novels;
    const totals = logTotals(novels);
    const st = streaks(totals);
    const today = todayIso();
    const goal = state.settings.dailyGoal;

    const stats = el('div', { class: 'stats' },
      stat('Current streak', plural(st.current, 'day')),
      stat('Longest streak', plural(st.longest, 'day')),
      stat(goal ? `Written today (goal ${fmt(goal)})` : 'Written today', fmt(st.today)),
      stat('Last 7 days', fmt(sumSince(totals, addDays(today, -6)))),
      stat('Last 30 days', fmt(sumSince(totals, addDays(today, -29)))),
    );
    stats.classList.add('stats-5');

    // Add form
    const novelSelect = n ? null : el('select', { name: 'novel', 'aria-label': 'Novel' },
      ...[...state.novels].sort((a, b) => b.updatedAt - a.updatedAt).map((nv) => el('option', { value: nv.id }, nv.title)));
    const dateInput = el('input', { type: 'date', name: 'date', value: today, max: today, required: true, 'aria-label': 'Date' });
    const wordsInput = el('input', { type: 'number', name: 'words', min: '1', step: '1', placeholder: 'Words written', required: true, 'aria-label': 'Words written' });
    const form = el('form', {
      class: 'log-form',
      onsubmit: (e) => {
        e.preventDefault();
        const words = positiveInt(wordsInput.value);
        const target = n || getNovel(novelSelect.value);
        if (!words || !target || !isIso(dateInput.value)) return;
        const snap = snapshot();
        addLog(target, dateInput.value, words);
        commit(snap, `Logged ${fmt(words)} words for ${fmtDate(dateInput.value, { month: 'short', day: 'numeric' })}.`);
      },
    },
      el('strong', {}, 'Log words'),
      novelSelect, dateInput, wordsInput,
      el('button', { class: 'btn primary', type: 'submit' }, 'Add'),
    );

    // Settings
    const goalInput = el('input', { type: 'number', min: '1', step: '1', value: goal || '', placeholder: 'None', 'aria-label': 'Daily word goal' });
    goalInput.addEventListener('change', () => {
      // Re-rendering removes this input, which can fire another change on blur; ignore repeats.
      const next = positiveInt(goalInput.value);
      if (next === state.settings.dailyGoal) return;
      state.settings.dailyGoal = next;
      if (save()) render();
    });
    const autoLog = el('input', { type: 'checkbox', checked: state.settings.autoLog });
    autoLog.addEventListener('change', () => { state.settings.autoLog = autoLog.checked; save(); });
    const settings = el('div', { class: 'log-settings' },
      el('label', { class: 'inline' }, 'Daily goal', goalInput, 'words'),
      el('label', { class: 'check' }, autoLog, 'When a chapter’s word count goes up, add the difference to today’s log'),
    );

    // Entries (also the chart's table view)
    const entries = [];
    for (const nv of novels) for (const e of nv.log) entries.push({ n: nv, ...e });
    entries.sort((a, b) => b.date.localeCompare(a.date) || a.n.title.localeCompare(b.n.title));
    const shown = entries.slice(0, 60);
    const table = entries.length ? el('table', { class: 'log-table' },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col' }, 'Date'),
        n ? null : el('th', { scope: 'col' }, 'Novel'),
        el('th', { scope: 'col', class: 'num-col' }, 'Words'),
        el('th', { scope: 'col' }, el('span', { class: 'sr-only' }, 'Actions')),
      )),
      el('tbody', {}, ...shown.map((e) => el('tr', {},
        el('td', {}, fmtDate(e.date, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })),
        n ? null : el('td', {}, e.n.title),
        el('td', { class: 'num-col' }, fmt(e.words)),
        el('td', { class: 'row-actions' }, el('button', {
          class: 'btn small',
          type: 'button',
          'aria-label': `Remove ${fmt(e.words)} words on ${e.date}`,
          onclick: () => {
            const snap = snapshot();
            e.n.log = e.n.log.filter((x) => x.date !== e.date);
            commit(snap, 'Removed log entry.');
          },
        }, 'Remove')),
      ))),
    ) : el('div', { class: 'empty' }, n
      ? 'Nothing logged for this novel yet. Add today’s words above, or just update a chapter’s word count.'
      : 'Nothing logged yet. Add today’s words above, or just update a chapter’s word count.');

    const chartHost = el('div', { class: 'chart-card' },
      el('div', { class: 'chart-head' },
        el('h3', {}, `Words per day, last ${CHART_DAYS} days`),
        goal ? el('span', { class: 'muted' }, `Grey line: daily goal of ${fmt(goal)} words`) : null,
      ),
    );

    host.replaceChildren(stats, form, chartHost, settings, el('h3', { class: 'section-title' }, 'Entries'), table);
    if (entries.length > shown.length) {
      host.append(el('p', { class: 'muted' }, `Showing the latest ${shown.length} of ${entries.length} entries. Export to see them all.`));
    }
    // Draw after insertion so the chart can measure its width.
    chartHost.append(wordsChart(totals, chartHost.clientWidth || 600));
  }

  // Single-series column chart of the last CHART_DAYS days, with an optional goal line.
  function wordsChart(totals, width) {
    const today = todayIso();
    const days = Array.from({ length: CHART_DAYS }, (_, i) => addDays(today, i - CHART_DAYS + 1));
    const values = days.map((d) => totals.get(d) || 0);
    const goal = state.settings.dailyGoal;
    const H = 200, padL = 44, padR = 8, padT = 12, padB = 26;
    const W = Math.max(280, width - 2);
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const maxV = niceMax(Math.max(...values, goal || 0, 100));
    const y = (v) => padT + plotH - (v / maxV) * plotH;
    const slot = plotW / CHART_DAYS;
    const barW = Math.max(2, Math.min(24, slot - 2));

    const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, class: 'chart', role: 'img',
      'aria-label': `Words written per day over the last ${CHART_DAYS} days. Total ${fmt(values.reduce((a, b) => a + b, 0))}.` });

    // Gridlines and y ticks
    for (const t of [0, maxV / 2, maxV]) {
      g.append(
        svg('line', { x1: padL, x2: W - padR, y1: y(t), y2: y(t), class: 'grid-line' }),
        Object.assign(svg('text', { x: padL - 6, y: y(t) + 4, 'text-anchor': 'end', class: 'axis-text' }), { textContent: fmt(t) }),
      );
    }

    // Columns: rounded data end, square at the baseline
    days.forEach((d, i) => {
      const v = values[i];
      const x = padL + i * slot + (slot - barW) / 2;
      if (v > 0) {
        const top = y(v);
        const h = padT + plotH - top;
        const r = Math.min(4, barW / 2, h);
        g.append(svg('path', {
          class: 'bar',
          'data-i': i,
          d: `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`,
        }));
      }
      // x labels: every 5th day, counted back from today
      if ((CHART_DAYS - 1 - i) % 5 === 0) {
        g.append(Object.assign(svg('text', { x: x + barW / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis-text' }),
          { textContent: i === CHART_DAYS - 1 ? 'Today' : fmtDate(d, { month: 'short', day: 'numeric' }) }));
      }
    });

    // Goal reference line; its value is named in the chart heading, so it needs no label that could collide with bars.
    if (goal) g.append(svg('line', { x1: padL, x2: W - padR, y1: y(goal), y2: y(goal), class: 'goal-line' }));

    // Hover layer: each day's whole column is its hit area.
    const hit = svg('rect', { x: padL, y: padT, width: plotW, height: plotH, fill: 'transparent', class: 'hit' });
    const showTip = (e) => {
      const rect = g.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const i = Math.floor((px - padL) / slot);
      if (i < 0 || i >= CHART_DAYS) return hideTip();
      g.querySelectorAll('.bar.active').forEach((b) => b.classList.remove('active'));
      const bar = g.querySelector(`.bar[data-i="${i}"]`);
      if (bar) bar.classList.add('active');
      els.chartTip.replaceChildren(
        el('div', { class: 'tip-label' }, fmtDate(days[i], { weekday: 'short', month: 'short', day: 'numeric' })),
        el('div', { class: 'tip-value' }, `${fmt(values[i])} words`),
      );
      els.chartTip.hidden = false;
      const tipW = els.chartTip.offsetWidth;
      const left = Math.min(window.innerWidth - tipW - 8, Math.max(8, e.clientX - tipW / 2));
      els.chartTip.style.left = `${left}px`;
      els.chartTip.style.top = `${e.clientY - els.chartTip.offsetHeight - 12}px`;
    };
    const hideTip = () => {
      els.chartTip.hidden = true;
      g.querySelectorAll('.bar.active').forEach((b) => b.classList.remove('active'));
    };
    hit.addEventListener('pointermove', showTip);
    hit.addEventListener('pointerleave', hideTip);
    g.append(hit);
    return g;
  }

  function niceMax(v) {
    const pow = 10 ** Math.floor(Math.log10(v));
    for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= v) return step * pow;
    return 10 * pow;
  }

  // ---------- chapter actions ----------

  function advance(chapterId, status) {
    const n = currentNovel();
    const c = n && n.chapters.find((x) => x.id === chapterId);
    if (!c) return;
    const snap = snapshot();
    const from = STATUS_BY_ID[c.status].label;
    c.status = status;
    if (status === 'published' && !c.date) c.date = todayIso();
    c.updatedAt = Date.now();
    touch(n);
    commit(snap, `Chapter ${c.number}: ${from} → ${STATUS_BY_ID[status].label}`);
  }

  function arcOptions(n, select) {
    select.replaceChildren(
      el('option', { value: '' }, 'No arc'),
      ...n.arcs.map((a) => el('option', { value: a.id }, a.name)),
    );
  }

  function openChapterDialog(chapterId = null, preset = {}) {
    const n = currentNovel();
    editingChapterId = chapterId;
    const c = chapterId ? n.chapters.find((x) => x.id === chapterId) : null;
    const f = els.chapterForm.elements;

    els.chapterDialogTitle.textContent = c ? `Edit chapter ${c.number}` : 'Add chapter';
    els.chapterDeleteBtn.hidden = !c;
    els.chapterFormError.textContent = '';
    arcOptions(n, f.arcId);
    els.chapterArcField.hidden = !n.arcs.length;

    // New chapters go into the arc being filtered, or the arc of the last chapter.
    const lastArc = [...n.chapters].sort((a, b) => b.number - a.number)[0]?.arcId || '';
    const defaultArc = arcFilter !== 'all' && arcFilter !== 'none' ? arcFilter : lastArc;

    f.number.value = c ? c.number : maxNumber(n) + 1;
    f.title.value = c ? c.title : '';
    f.status.value = c ? c.status : preset.status || (filter !== 'all' ? filter : 'draft');
    f.arcId.value = c ? c.arcId : defaultArc;
    f.words.value = c && c.words != null ? c.words : '';
    f.date.value = c ? c.date : preset.date || '';
    f.tags.value = c ? c.tags.join(', ') : (tagFilter !== 'all' ? tagFilter : '');
    f.link.value = c ? c.link : '';
    f.notes.value = c ? c.notes : '';
    renderTagSuggestions();

    els.chapterDialog.showModal();
    (c ? f.title : f.number).focus();
  }

  function renderTagSuggestions() {
    const n = currentNovel();
    const input = els.chapterForm.elements.tags;
    const current = new Set(normalizeTags(input.value).map((t) => t.toLowerCase()));
    const options = allTags(n).filter((t) => !current.has(t.toLowerCase())).slice(0, 20);
    els.tagSuggest.replaceChildren(...options.map((t) => el('button', {
      class: 'tag',
      type: 'button',
      title: `Add #${t}`,
      onclick: () => {
        const list = normalizeTags(input.value);
        list.push(t);
        input.value = list.join(', ');
        renderTagSuggestions();
      },
    }, `+ ${t}`)));
  }

  function submitChapter(e) {
    e.preventDefault();
    const n = currentNovel();
    const f = els.chapterForm.elements;
    const number = toInt(f.number.value);
    if (number == null) {
      els.chapterFormError.textContent = 'Enter a chapter number (0 or higher).';
      return;
    }
    if (f.link.value.trim() && !safeUrl(f.link.value)) {
      els.chapterFormError.textContent = 'The link must start with http:// or https://';
      return;
    }
    const clash = n.chapters.find((c) => c.number === number && c.id !== editingChapterId);
    if (clash && !confirm(`Chapter ${number} already exists. Save anyway?`)) return;

    const snap = snapshot();
    const data = {
      number,
      title: f.title.value.trim(),
      status: f.status.value,
      arcId: n.arcs.some((a) => a.id === f.arcId.value) ? f.arcId.value : '',
      words: toInt(f.words.value),
      date: f.date.value,
      tags: normalizeTags(f.tags.value),
      link: safeUrl(f.link.value),
      notes: f.notes.value.trim(),
      updatedAt: Date.now(),
    };
    if (data.status === 'published' && !data.date) data.date = todayIso();

    let logged = 0;
    if (editingChapterId) {
      const c = n.chapters.find((x) => x.id === editingChapterId);
      const delta = (data.words || 0) - (c.words || 0);
      if (state.settings.autoLog && delta > 0) {
        addLog(n, todayIso(), delta);
        logged = delta;
      }
      Object.assign(c, data);
    } else {
      n.chapters.push({ id: newId(), source: '', ...data });
    }
    touch(n);
    if (!save()) return;
    els.chapterDialog.close();
    render();
    if (logged) {
      toast(`Added ${fmt(logged)} words to today’s writing log.`, {
        label: 'Undo',
        fn: () => {
          const nv = normalizeLibrary(JSON.parse(snap)).novels.find((x) => x.id === n.id);
          n.log = nv ? nv.log : n.log;
          save();
          render();
        },
      });
    }
  }

  function deleteChapter() {
    const n = currentNovel();
    const c = n.chapters.find((x) => x.id === editingChapterId);
    if (!c) return;
    const snap = snapshot();
    n.chapters = n.chapters.filter((x) => x.id !== editingChapterId);
    touch(n);
    els.chapterDialog.close();
    commit(snap, `Deleted chapter ${c.number}.`);
  }

  function openBulkDialog() {
    const n = currentNovel();
    const f = els.bulkForm.elements;
    const start = maxNumber(n) + 1;
    f.from.value = start;
    f.to.value = n.targetChapters && n.targetChapters >= start ? n.targetChapters : start + 9;
    f.status.value = 'outline';
    arcOptions(n, f.arcId);
    f.arcId.value = arcFilter !== 'all' && arcFilter !== 'none' ? arcFilter : '';
    els.bulkArcField.hidden = !n.arcs.length;
    els.bulkFormError.textContent = '';
    els.bulkDialog.showModal();
    f.from.focus();
  }

  function submitBulk(e) {
    e.preventDefault();
    const n = currentNovel();
    const f = els.bulkForm.elements;
    const from = toInt(f.from.value);
    const to = toInt(f.to.value);
    if (from == null || to == null || to < from) {
      els.bulkFormError.textContent = '“To” must be the same as or after “From”.';
      return;
    }
    if (to - from + 1 > MAX_BULK) {
      els.bulkFormError.textContent = `That's more than ${MAX_BULK} chapters at once. Try a smaller range.`;
      return;
    }
    const snap = snapshot();
    const existing = new Set(n.chapters.map((c) => c.number));
    const arcIds = new Set(n.arcs.map((a) => a.id));
    const now = Date.now();
    let added = 0;
    for (let i = from; i <= to; i++) {
      if (existing.has(i)) continue;
      n.chapters.push(normalizeChapter({ number: i, status: f.status.value, arcId: f.arcId.value, updatedAt: now }, arcIds));
      added++;
    }
    touch(n);
    els.bulkDialog.close();
    const skipped = to - from + 1 - added;
    commit(snap, `Added ${plural(added, 'chapter')}${skipped ? ` (skipped ${fmt(skipped)} that already existed)` : ''}.`);
  }

  // ---------- arcs ----------

  function openArcsDialog() {
    const n = currentNovel();
    draftArcs = n.arcs.map((a) => ({ ...a }));
    if (!draftArcs.length) draftArcs.push({ id: newId(), name: '' });
    els.arcsFormError.textContent = '';
    renderArcList();
    els.arcsDialog.showModal();
    els.arcList.querySelector('input')?.focus();
  }

  function renderArcList() {
    const n = currentNovel();
    els.arcList.replaceChildren(...draftArcs.map((a, i) => {
      const count = n.chapters.filter((c) => c.arcId === a.id).length;
      const input = el('input', { type: 'text', value: a.name, maxlength: '120', placeholder: `e.g. Arc ${i + 1}, Volume ${i + 1}`, 'aria-label': `Arc ${i + 1} name` });
      input.addEventListener('input', () => { a.name = input.value; });
      const move = (delta) => {
        const j = i + delta;
        [draftArcs[i], draftArcs[j]] = [draftArcs[j], draftArcs[i]];
        renderArcList();
      };
      return el('li', { class: 'arc-row' },
        input,
        el('span', { class: 'muted arc-count' }, plural(count, 'chapter')),
        el('button', { class: 'btn small', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(-1) }, '↑'),
        el('button', { class: 'btn small', type: 'button', 'aria-label': 'Move down', disabled: i === draftArcs.length - 1, onclick: () => move(1) }, '↓'),
        el('button', {
          class: 'btn small danger',
          type: 'button',
          'aria-label': `Remove ${a.name || 'arc'}`,
          onclick: () => {
            if (count && !confirm(`Remove “${a.name || 'this arc'}”? Its ${plural(count, 'chapter')} will be kept, with no arc.`)) return;
            draftArcs.splice(i, 1);
            renderArcList();
          },
        }, 'Remove'),
      );
    }));
  }

  function submitArcs(e) {
    e.preventDefault();
    const n = currentNovel();
    const kept = draftArcs.filter((a) => a.name.trim() || n.chapters.some((c) => c.arcId === a.id));
    if (kept.some((a) => !a.name.trim())) {
      els.arcsFormError.textContent = 'Give every arc that has chapters a name.';
      return;
    }
    const snap = snapshot();
    n.arcs = kept.map((a) => ({ id: a.id, name: a.name.trim() }));
    const ids = new Set(n.arcs.map((a) => a.id));
    for (const c of n.chapters) if (c.arcId && !ids.has(c.arcId)) c.arcId = '';
    touch(n);
    els.arcsDialog.close();
    commit(snap, 'Arcs updated.');
  }

  function ensureArc(n, name) {
    const found = n.arcs.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const a = { id: newId(), name };
    n.arcs.push(a);
    return a.id;
  }

  // ---------- novel actions ----------

  function openNovelDialog(novelId = null) {
    editingNovelId = novelId;
    const n = novelId ? getNovel(novelId) : null;
    const f = els.novelForm.elements;

    els.novelDialogTitle.textContent = n ? 'Edit novel' : 'New novel';
    els.novelDeleteBtn.hidden = !n;
    els.novelFormError.textContent = '';

    f.title.value = n ? n.title : '';
    f.author.value = n ? n.author : '';
    f.genre.value = n ? n.genre : '';
    f.status.value = n ? n.status : 'ongoing';
    f.platform.value = n ? n.platform : '';
    f.targetChapters.value = n && n.targetChapters ? n.targetChapters : '';
    f.wordGoal.value = n && n.wordGoal ? n.wordGoal : '';
    f.synopsis.value = n ? n.synopsis : '';
    const days = n ? n.releaseDays : [];
    for (const box of els.releaseDays.querySelectorAll('input')) box.checked = days.includes(Number(box.value));

    pendingCover = n ? n.cover : '';
    els.novelForm.dataset.color = n ? n.color : randomColor();
    renderCoverPreview();

    els.novelDialog.showModal();
    f.title.focus();
  }

  function renderCoverPreview() {
    const f = els.novelForm.elements;
    els.coverPreview.replaceChildren(coverEl({
      cover: pendingCover,
      color: els.novelForm.dataset.color,
      title: f.title.value.trim() || 'Untitled novel',
      author: f.author.value.trim(),
    }));
    els.coverRemove.hidden = !pendingCover;
  }

  async function useCoverFile(file) {
    try {
      pendingCover = await resizeCover(file);
      els.novelFormError.textContent = '';
      renderCoverPreview();
    } catch (err) {
      els.novelFormError.textContent = err.message;
    }
  }

  // Crops to 2:3 from the centre and re-encodes as JPEG so a cover takes tens of KB, not megabytes.
  async function resizeCover(file) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Choose an image file for the cover.');
    const img = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image couldn’t be read. Try a JPG or PNG.')); };
      image.src = url;
    });
    const W = 400, H = 600;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  function imageFrom(dataTransfer) {
    if (!dataTransfer) return null;
    for (const f of dataTransfer.files || []) if (f.type.startsWith('image/')) return f;
    for (const item of dataTransfer.items || []) {
      if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
    }
    return null;
  }

  // Wires drag-over highlighting and drop handling onto an element.
  function dropTarget(node, onDrop) {
    let depth = 0;
    node.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; node.classList.add('dragging'); });
    node.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    node.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; node.classList.remove('dragging'); } });
    node.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      node.classList.remove('dragging');
      onDrop(e.dataTransfer);
    });
  }

  function submitNovel(e) {
    e.preventDefault();
    const f = els.novelForm.elements;
    const title = f.title.value.trim();
    if (!title) {
      els.novelFormError.textContent = 'Give the novel a title.';
      return;
    }
    const data = {
      title,
      author: f.author.value.trim(),
      genre: f.genre.value.trim(),
      status: f.status.value,
      platform: f.platform.value.trim(),
      releaseDays: [...els.releaseDays.querySelectorAll('input:checked')].map((b) => Number(b.value)).sort(),
      targetChapters: positiveInt(f.targetChapters.value),
      wordGoal: positiveInt(f.wordGoal.value),
      synopsis: f.synopsis.value.trim(),
      cover: pendingCover,
      color: els.novelForm.dataset.color,
      updatedAt: Date.now(),
    };

    let id = editingNovelId;
    if (id) {
      Object.assign(getNovel(id), data);
    } else {
      const n = normalizeNovel({ ...data, createdAt: Date.now() });
      state.novels.push(n);
      id = n.id;
    }
    if (!save()) return;
    els.novelDialog.close();
    if (currentId === id) render();
    else goTo(id);
  }

  function deleteNovel() {
    const n = getNovel(editingNovelId);
    if (!n) return;
    const msg = `Delete “${n.title}” and its ${plural(n.chapters.length, 'chapter')}? This can't be undone.\n\nTip: use “Export JSON” first if you might want it back.`;
    if (!confirm(msg)) return;
    state.novels = state.novels.filter((x) => x.id !== n.id);
    if (!save()) return;
    els.novelDialog.close();
    goTo(null);
  }

  // ---------- Markdown / Obsidian import ----------

  function openMdDialog() {
    mdNotes = [];
    mdExcluded = new Set();
    const f = els.mdForm.elements;
    f.defaultStatus.value = 'draft';
    f.logWords.checked = false;
    els.mdFormError.textContent = '';
    renderMdPreview();
    els.mdDialog.showModal();
  }

  const isNoteFile = (path) => /\.(md|markdown|txt)$/i.test(path) && !path.split('/').some((p) => p.startsWith('.'));

  // Files from an <input>: folder picks carry webkitRelativePath ("Vault/Arc 1/Ch 1.md").
  async function readPicked(fileList) {
    const files = [...fileList].map((f) => ({ file: f, path: f.webkitRelativePath || f.name }));
    await parseMdFiles(files);
  }

  // Dropped items may include folders; walk them.
  async function readDropped(dt) {
    const entries = [...(dt.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) return parseMdFiles([...dt.files].map((f) => ({ file: f, path: f.name })));
    const out = [];
    const walk = async (entry, prefix) => {
      if (out.length > MAX_IMPORT_FILES) return;
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        out.push({ file, path: prefix + entry.name });
      } else if (entry.isDirectory && !entry.name.startsWith('.')) {
        const reader = entry.createReader();
        let batch;
        do {
          batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
        } while (batch.length);
      }
    };
    for (const entry of entries) await walk(entry, '');
    await parseMdFiles(out);
  }

  async function parseMdFiles(files) {
    els.mdFormError.textContent = '';
    const notes = files.filter((f) => isNoteFile(f.path));
    if (!notes.length) {
      els.mdFormError.textContent = 'No Markdown (.md) or text files found there.';
      return;
    }
    if (notes.length > MAX_IMPORT_FILES) {
      els.mdFormError.textContent = `That's more than ${MAX_IMPORT_FILES} files. Pick a smaller folder.`;
      return;
    }
    const parsed = [];
    for (const { file, path } of notes) {
      if (file.size > 5_000_000) continue;
      parsed.push(MarkdownImport.parseNote(await file.text(), path));
    }
    // Merge with anything picked earlier; a re-picked file replaces its old entry.
    const byPath = new Map(mdNotes.map((x) => [x.path, x]));
    for (const p of parsed) {
      // Obsidian templates aren't chapters; start them unticked.
      if (!byPath.has(p.path) && p.path.split('/').slice(0, -1).some((seg) => /^templates?$/i.test(seg))) mdExcluded.add(p.path);
      byPath.set(p.path, p);
    }
    mdNotes = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    renderMdPreview();
  }

  // Decides what each note will do: create a chapter, update one, or be skipped.
  function planMdImport(n) {
    const f = els.mdForm.elements;
    const byNumber = new Map(n.chapters.map((c) => [c.number, c]));
    const bySource = new Map(n.chapters.filter((c) => c.source).map((c) => [c.source, c]));
    const rootFolders = new Set(mdNotes.map((x) => x.path.split('/')[0]));
    const singleRoot = rootFolders.size === 1 && mdNotes.every((x) => x.path.includes('/'));

    let nextAuto = Math.max(maxNumber(n), ...mdNotes.map((x) => x.number ?? 0)) + 1;
    const usedNumbers = new Set();
    return mdNotes.map((note) => {
      const include = !mdExcluded.has(note.path);
      // Folder under the picked root becomes the arc: "Vault/Arc 1/Ch 1.md" -> "Arc 1".
      const depth = note.path.split('/').length;
      const folderArc = f.folderArcs.checked && note.folder && !(singleRoot && depth === 2) ? note.folder : '';
      const arc = note.arc || folderArc;

      const existing = bySource.get(note.path) || (note.number != null ? byNumber.get(note.number) : undefined);
      let number = existing && note.number == null ? existing.number : note.number;
      let auto = false;
      if (number == null) {
        if (!include) return { note, include, action: 'skip', reason: 'Not selected', number: null, arc };
        number = nextAuto++;
        auto = true;
      }
      let action = existing ? 'update' : 'new';
      let reason = '';
      if (!include) { action = 'skip'; reason = 'Not selected'; }
      else if (usedNumbers.has(number)) { action = 'skip'; reason = `Another file is already chapter ${number}`; }
      else if (existing && !f.updateExisting.checked) { action = 'skip'; reason = 'Already here'; }
      if (action !== 'skip') usedNumbers.add(number);
      return { note, include, action, reason, number, auto, arc, existing };
    });
  }

  function renderMdPreview() {
    const n = currentNovel();
    if (!mdNotes.length) {
      els.mdPreview.replaceChildren();
      els.mdSubmit.disabled = true;
      els.mdSubmit.textContent = 'Import';
      return;
    }
    const plan = planMdImport(n);
    const counts = { new: 0, update: 0, skip: 0 };
    for (const r of plan) counts[r.action]++;
    const statusFor = (r) => r.note.status || (r.existing ? r.existing.status : els.mdForm.elements.defaultStatus.value);

    const rows = plan.map((r) => {
      const box = el('input', { type: 'checkbox', checked: r.include, 'aria-label': `Import ${r.note.fileName}` });
      box.addEventListener('change', () => {
        if (box.checked) mdExcluded.delete(r.note.path);
        else mdExcluded.add(r.note.path);
        renderMdPreview();
      });
      const result = { new: 'New', update: 'Update', skip: 'Skip' }[r.action];
      return el('tr', { class: r.action === 'skip' ? 'skipped' : null },
        el('td', {}, box),
        el('td', { class: 'file-col', title: r.note.path }, r.note.path),
        el('td', { class: 'num-col' }, r.number == null ? '–' : `${r.number}${r.auto ? '*' : ''}`),
        el('td', {}, r.note.title || el('span', { class: 'muted' }, '(none)')),
        el('td', {}, el('span', { class: 'pill', style: `--status-color:${STATUS_BY_ID[statusFor(r)].color}` }, STATUS_BY_ID[statusFor(r)].label)),
        el('td', { class: 'num-col' }, fmt(r.note.words)),
        el('td', {}, r.arc || ''),
        el('td', {}, r.note.tags.map((t) => `#${t}`).join(' ')),
        el('td', { title: r.reason || null }, el('span', { class: `result ${r.action}` }, result), r.reason ? el('span', { class: 'muted' }, ` · ${r.reason}`) : null),
      );
    });

    const autos = plan.filter((r) => r.auto && r.action !== 'skip').length;
    els.mdPreview.replaceChildren(
      el('p', { class: 'import-summary' },
        el('strong', {}, `${plural(mdNotes.length, 'file')}: `),
        `${fmt(counts.new)} new, ${fmt(counts.update)} to update, ${fmt(counts.skip)} skipped. `,
        autos ? el('span', { class: 'muted' }, `* No chapter number found, so it's numbered after your last chapter. `) : null,
        el('button', { class: 'btn small', type: 'button', onclick: () => { mdNotes = []; mdExcluded = new Set(); renderMdPreview(); } }, 'Clear'),
      ),
      el('div', { class: 'table-scroll' },
        el('table', { class: 'import-table' },
          el('thead', {}, el('tr', {},
            ...['', 'File', '#', 'Title', 'Status', 'Words', 'Arc', 'Tags', 'Result'].map((h) => el('th', { scope: 'col' }, h)),
          )),
          el('tbody', {}, ...rows),
        ),
      ),
    );
    const total = counts.new + counts.update;
    els.mdSubmit.disabled = !total;
    els.mdSubmit.textContent = total ? `Import ${plural(total, 'chapter')}` : 'Import';
  }

  function submitMdImport(e) {
    e.preventDefault();
    const n = currentNovel();
    const f = els.mdForm.elements;
    const plan = planMdImport(n).filter((r) => r.action !== 'skip');
    if (!plan.length) return;
    const snap = snapshot();
    const now = Date.now();
    let added = 0, updated = 0, grew = 0;
    for (const r of plan) {
      const { note } = r;
      const arcId = r.arc ? ensureArc(n, r.arc) : '';
      if (r.action === 'update') {
        const c = r.existing;
        grew += Math.max(0, note.words - (c.words || 0));
        c.number = r.number;
        if (note.title) c.title = note.title;
        c.words = note.words;
        if (note.status) c.status = note.status;
        if (note.tags.length) c.tags = normalizeTags([...c.tags, ...note.tags]);
        if (arcId) c.arcId = arcId;
        if (note.date) c.date = note.date;
        if (safeUrl(note.link)) c.link = safeUrl(note.link);
        c.source = note.path;
        c.updatedAt = now;
        updated++;
      } else {
        const c = normalizeChapter({
          number: r.number,
          title: note.title,
          status: note.status || f.defaultStatus.value,
          arcId,
          words: note.words,
          date: note.date,
          link: note.link,
          tags: note.tags,
          source: note.path,
          updatedAt: now,
        }, new Set(n.arcs.map((a) => a.id)));
        n.chapters.push(c);
        grew += note.words;
        added++;
      }
    }
    if (f.logWords.checked && grew) addLog(n, todayIso(), grew);
    touch(n);
    els.mdDialog.close();
    novelTab = 'chapters';
    const parts = [];
    if (added) parts.push(`added ${plural(added, 'chapter')}`);
    if (updated) parts.push(`updated ${fmt(updated)}`);
    const msg = parts.join(', ');
    commit(snap, `Import done: ${msg}${f.logWords.checked && grew ? `, logged ${fmt(grew)} words` : ''}.`);
  }

  // ---------- import / export ----------

  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const downloadJson = (data, filename) => download(JSON.stringify(data, null, 2), filename, 'application/json');

  function exportAll() {
    downloadJson({ version: 3, novels: state.novels }, `novel-library-${todayIso()}.json`);
  }

  function exportNovel() {
    const n = currentNovel();
    downloadJson({ version: 3, novels: [n] }, `${slug(n.title)}-${todayIso()}.json`);
  }

  // Cells that start with = + - @ are prefixed so spreadsheet apps don't run them as formulas.
  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv(novels, filename) {
    const header = ['Novel', 'Arc', 'Chapter', 'Title', 'Status', 'Words', 'Date', 'Tags', 'Link', 'Notes'];
    const rows = [header];
    for (const n of novels) {
      for (const c of [...n.chapters].sort(SORTS['number-asc'].fn)) {
        rows.push([n.title, arcName(n, c.arcId), c.number, c.title, STATUS_BY_ID[c.status].label,
          c.words ?? '', c.date, c.tags.join(', '), c.link, c.notes]);
      }
    }
    // BOM so Excel reads it as UTF-8.
    download(`﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`, filename, 'text/csv;charset=utf-8');
  }

  // Imported novels are added; a novel with the same id as one already here replaces it.
  async function importJson(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let imported;
    try {
      imported = normalizeLibrary(JSON.parse(await file.text())).novels;
    } catch {
      alert('That file couldn’t be read as a Novel Chapter Tracker export. (For Markdown notes, open a novel and use “Import from Obsidian / Markdown”.)');
      return;
    }
    if (!imported.length) {
      alert('That file doesn’t contain any novels.');
      return;
    }
    const replacing = imported.filter((n) => getNovel(n.id));
    let msg = `Import ${plural(imported.length, 'novel')}?`;
    if (replacing.length) {
      msg += `\n\nThese already exist here and will be replaced by the imported copy:\n• ${replacing.map((n) => getNovel(n.id).title).join('\n• ')}`;
    }
    if (!confirm(msg)) return;
    const snap = snapshot();
    for (const n of imported) {
      const i = state.novels.findIndex((x) => x.id === n.id);
      if (i >= 0) state.novels[i] = n;
      else state.novels.push(n);
    }
    commit(snap, `Imported ${plural(imported.length, 'novel')}.`);
  }

  // ---------- wiring ----------

  const optionEls = (list) => list.map((s) => el('option', { value: s.id }, s.label));
  els.chapterForm.elements.status.append(...optionEls(STATUSES));
  els.bulkForm.elements.status.append(...optionEls(STATUSES));
  els.mdForm.elements.defaultStatus.append(...optionEls(STATUSES));
  els.novelForm.elements.status.append(...optionEls(NOVEL_STATUSES));
  els.sort.append(...Object.entries(SORTS).map(([id, s]) => el('option', { value: id }, s.label)));
  els.sort.value = state.settings.sort;
  els.releaseDays.append(...WEEK_ORDER.map((d) => el('label', { class: 'day' },
    el('input', { type: 'checkbox', value: String(d) }), dayName(d))));

  for (const btn of document.querySelectorAll('dialog [data-close]')) {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  }

  els.newNovelBtn.addEventListener('click', () => openNovelDialog());
  els.heroCover.addEventListener('click', () => openNovelDialog(currentId));
  els.editNovelBtn.addEventListener('click', () => openNovelDialog(currentId));
  els.arcsBtn.addEventListener('click', openArcsDialog);
  els.mdImportBtn.addEventListener('click', openMdDialog);
  els.exportNovelBtn.addEventListener('click', exportNovel);
  els.exportNovelCsvBtn.addEventListener('click', () => {
    const n = currentNovel();
    exportCsv([n], `${slug(n.title)}-${todayIso()}.csv`);
  });

  els.search.addEventListener('input', () => { query = els.search.value; renderList(currentNovel()); });
  els.arcFilter.addEventListener('change', () => { arcFilter = els.arcFilter.value; renderNovel(currentNovel()); });
  els.tagFilter.addEventListener('change', () => { tagFilter = els.tagFilter.value; renderNovel(currentNovel()); });
  els.sort.addEventListener('change', () => {
    state.settings.sort = els.sort.value;
    save();
    renderList(currentNovel());
  });
  els.addBtn.addEventListener('click', () => openChapterDialog());
  els.bulkBtn.addEventListener('click', openBulkDialog);

  els.chapterForm.addEventListener('submit', submitChapter);
  els.chapterDeleteBtn.addEventListener('click', deleteChapter);
  els.chapterForm.elements.tags.addEventListener('input', renderTagSuggestions);
  els.bulkForm.addEventListener('submit', submitBulk);
  els.arcsForm.addEventListener('submit', submitArcs);
  els.arcAdd.addEventListener('click', () => {
    draftArcs.push({ id: newId(), name: '' });
    renderArcList();
    [...els.arcList.querySelectorAll('input')].at(-1)?.focus();
  });

  els.novelForm.addEventListener('submit', submitNovel);
  els.novelDeleteBtn.addEventListener('click', deleteNovel);
  els.coverFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) useCoverFile(file);
  });
  els.coverRemove.addEventListener('click', () => { pendingCover = ''; renderCoverPreview(); });
  // Keep the placeholder cover's text in step with what's typed.
  els.novelForm.elements.title.addEventListener('input', renderCoverPreview);
  els.novelForm.elements.author.addEventListener('input', renderCoverPreview);
  dropTarget(els.coverPreview, (dt) => {
    const file = imageFrom(dt);
    if (file) useCoverFile(file);
    else els.novelFormError.textContent = 'Drop an image file to use it as the cover.';
  });
  els.novelDialog.addEventListener('paste', (e) => {
    const file = imageFrom(e.clipboardData);
    if (file) {
      e.preventDefault();
      useCoverFile(file);
    }
  });
  // Dropping an image straight onto the cover on a novel's page saves it immediately.
  dropTarget(els.heroCover, async (dt) => {
    const n = currentNovel();
    const file = imageFrom(dt);
    if (!n || !file) return toast('Drop an image file to use it as the cover.');
    try {
      const cover = await resizeCover(file);
      const snap = snapshot();
      n.cover = cover;
      touch(n);
      commit(snap, 'Cover updated.');
    } catch (err) {
      toast(err.message);
    }
  });

  els.mdForm.addEventListener('submit', submitMdImport);
  els.mdFiles.addEventListener('change', async (e) => { await readPicked(e.target.files); e.target.value = ''; });
  els.mdFolder.addEventListener('change', async (e) => { await readPicked(e.target.files); e.target.value = ''; });
  dropTarget(els.mdDrop, (dt) => { readDropped(dt); });
  for (const name of ['defaultStatus', 'folderArcs', 'updateExisting']) {
    els.mdForm.elements[name].addEventListener('change', renderMdPreview);
  }

  els.themeSelect.addEventListener('change', () => {
    state.settings.theme = els.themeSelect.value;
    save();
    applyTheme();
  });
  els.exportBtn.addEventListener('click', exportAll);
  els.exportCsvBtn.addEventListener('click', () => exportCsv(state.novels, `novel-library-${todayIso()}.csv`));
  els.importFile.addEventListener('change', importJson);

  // Redraw the chart at the new width.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const onWriting = currentId ? novelTab === 'writing' : libraryTab === 'writing';
      if (onWriting && !document.querySelector('dialog[open]')) render();
    }, 150);
  });

  // Convert data saved by the original single-novel version on first load.
  try {
    if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(LEGACY_KEY)) save();
  } catch { /* storage unavailable */ }

  window.addEventListener('hashchange', route);
  // Keep tabs in sync if the tracker is open in more than one window.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) { state = load(); els.sort.value = state.settings.sort; route(); }
  });

  route();
})();
