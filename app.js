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

  const MAX_COVER_CHARS = 2_000_000;
  const MAX_BULK = 500;

  const $ = (id) => document.getElementById(id);
  const els = {
    libraryView: $('library-view'),
    novelView: $('novel-view'),
    newNovelBtn: $('new-novel-btn'),
    libraryStats: $('library-stats'),
    shelf: $('shelf'),

    heroCover: $('hero-cover'),
    heroKicker: $('hero-kicker'),
    heroTitle: $('hero-title'),
    heroAuthor: $('hero-author'),
    heroSynopsis: $('hero-synopsis'),
    nextRelease: $('next-release'),
    editNovelBtn: $('edit-novel-btn'),
    exportNovelBtn: $('export-novel-btn'),
    statusTiles: $('status-tiles'),
    progress: $('progress'),
    progressCaption: $('progress-caption'),
    search: $('search'),
    sort: $('sort'),
    bulkBtn: $('bulk-btn'),
    addBtn: $('add-btn'),
    list: $('list'),

    themeSelect: $('theme-select'),
    storageInfo: $('storage-info'),
    exportBtn: $('export-btn'),
    importFile: $('import-file'),

    chapterDialog: $('chapter-dialog'),
    chapterForm: $('chapter-form'),
    chapterDialogTitle: $('chapter-dialog-title'),
    chapterFormError: $('chapter-form-error'),
    chapterDeleteBtn: $('chapter-delete-btn'),

    novelDialog: $('novel-dialog'),
    novelForm: $('novel-form'),
    novelDialogTitle: $('novel-dialog-title'),
    novelFormError: $('novel-form-error'),
    novelDeleteBtn: $('novel-delete-btn'),
    coverPreview: $('cover-preview'),
    coverFile: $('cover-file'),
    coverRemove: $('cover-remove'),

    bulkDialog: $('bulk-dialog'),
    bulkForm: $('bulk-form'),
    bulkFormError: $('bulk-form-error'),

    toast: $('toast'),
  };

  let state = load();
  let currentId = null;        // novel being viewed, or null for the library
  let filter = 'all';
  let query = '';
  let editingChapterId = null;
  let editingNovelId = null;   // null while creating a new novel
  let pendingCover = '';       // cover chosen in the novel dialog, applied on save

  // ---------- persistence ----------

  function emptyState() {
    return { version: 2, settings: normalizeSettings(), novels: [] };
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

  // Coerces untrusted data (from storage or an imported file) into a valid library.
  // Accepts the current format and the original single-novel format.
  function normalizeLibrary(data) {
    if (!data || typeof data !== 'object') throw new Error('Not a tracker file');
    if (Array.isArray(data.novels)) {
      return {
        version: 2,
        settings: normalizeSettings(data.settings),
        novels: data.novels.filter(isObj).map(normalizeNovel),
      };
    }
    if (Array.isArray(data.chapters)) {
      const hasContent = data.chapters.length || str(data.novelTitle).trim();
      return {
        version: 2,
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
    };
  }

  function normalizeNovel(n) {
    const now = Date.now();
    return {
      id: str(n.id) || newId(),
      title: str(n.title).trim() || 'Untitled novel',
      author: str(n.author),
      genre: str(n.genre),
      platform: str(n.platform),
      schedule: str(n.schedule),
      synopsis: str(n.synopsis),
      status: NOVEL_STATUS_BY_ID[n.status] ? n.status : 'ongoing',
      cover: safeCover(n.cover),
      color: /^#[0-9a-f]{6}$/i.test(n.color) ? n.color : randomColor(),
      targetChapters: positiveInt(n.targetChapters),
      wordGoal: positiveInt(n.wordGoal),
      createdAt: toInt(n.createdAt) ?? now,
      updatedAt: toInt(n.updatedAt) ?? now,
      chapters: (Array.isArray(n.chapters) ? n.chapters : []).filter(isObj).map(normalizeChapter),
    };
  }

  function normalizeChapter(c) {
    return {
      id: str(c.id) || newId(),
      number: toInt(c.number) ?? 0,
      title: str(c.title),
      status: STATUS_BY_ID[c.status] ? c.status : 'draft',
      words: toInt(c.words),
      date: /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : '',
      link: safeUrl(c.link),
      notes: str(c.notes),
      updatedAt: toInt(c.updatedAt) ?? 0,
    };
  }

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function str(v) { return typeof v === 'string' ? v : ''; }

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

  // ---------- helpers ----------

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c != null && c !== false) node.append(c);
    return node;
  }

  function fmt(n) { return (n || 0).toLocaleString(); }

  function fmtDate(iso, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
  }

  function todayIso() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'novel';
  }

  function plural(n, word) { return `${fmt(n)} ${word}${n === 1 ? '' : 's'}`; }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 4000);
  }

  function getNovel(id) { return state.novels.find((n) => n.id === id); }
  function currentNovel() { return getNovel(currentId); }

  function novelStats(n) {
    const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0]));
    let words = 0;
    let publishedWords = 0;
    for (const c of n.chapters) {
      counts[c.status]++;
      words += c.words || 0;
      if (c.status === 'published') publishedWords += c.words || 0;
    }
    return { counts, total: n.chapters.length, words, publishedWords };
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

  // Progress bar segments. With a target, widths are relative to it, so the empty part shows what's left.
  function progressSegments(n, stats) {
    const denom = Math.max(n.targetChapters || 0, stats.total) || 1;
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

  function touch(n) { n.updatedAt = Date.now(); }

  // ---------- routing ----------

  function route() {
    const m = location.hash.match(/^#\/novel\/(.+)$/);
    const id = m ? decodeURIComponent(m[1]) : null;
    const next = id && getNovel(id) ? id : null;
    if (id && !next) history.replaceState(null, '', '#/');
    if (next !== currentId) {
      currentId = next;
      filter = 'all';
      query = '';
      els.search.value = '';
      window.scrollTo(0, 0);
    }
    render();
  }

  function goTo(id) { location.hash = id ? `#/novel/${encodeURIComponent(id)}` : '#/'; }

  // ---------- rendering ----------

  function render() {
    applyTheme();
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

  function renderLibrary() {
    document.title = 'Novel Chapter Tracker';
    const novels = [...state.novels].sort((a, b) => b.updatedAt - a.updatedAt);
    let published = 0, inProgress = 0, words = 0;
    for (const n of novels) {
      const s = novelStats(n);
      published += s.counts.published;
      inProgress += s.total - s.counts.published;
      words += s.words;
    }

    els.libraryStats.hidden = !novels.length;
    els.libraryStats.replaceChildren(
      stat('Novels', fmt(novels.length)),
      stat('Chapters published', fmt(published)),
      stat('Chapters in progress', fmt(inProgress)),
      stat('Words written', fmt(words)),
    );

    if (!novels.length) {
      els.shelf.replaceChildren(el('div', { class: 'empty' },
        'No novels yet. ',
        el('button', { class: 'btn primary', type: 'button', onclick: () => openNovelDialog() }, '+ Add your first novel'),
      ));
      return;
    }

    els.shelf.replaceChildren(
      ...novels.map(novelCard),
      el('button', { class: 'new-card', type: 'button', onclick: () => openNovelDialog() }, '+ New novel'),
    );
  }

  function stat(label, value) {
    return el('div', { class: 'stat' }, el('div', { class: 'value' }, value), el('div', { class: 'label' }, label));
  }

  function novelCard(n) {
    const s = novelStats(n);
    const { next, overdue } = releaseInfo(n);
    const of = fmt(n.targetChapters || s.total);
    return el('a', { class: 'novel-card', href: `#/novel/${encodeURIComponent(n.id)}` },
      coverEl(n),
      el('div', {},
        el('div', { class: 'card-title' }, n.title),
        n.author || n.genre ? el('div', { class: 'card-sub' }, [n.author, n.genre].filter(Boolean).join(' · ')) : null,
      ),
      el('div', { class: 'mini-progress', 'aria-hidden': 'true' }, ...progressSegments(n, s)),
      el('div', { class: 'card-row' },
        el('span', {}, `${fmt(s.counts.published)}/${of} published`),
        el('span', { class: 'pill' }, NOVEL_STATUS_BY_ID[n.status].label),
      ),
      overdue.length
        ? el('div', { class: 'card-row' }, el('span', { style: 'color:var(--warn);font-weight:600' }, `${overdue.length} overdue`))
        : next ? el('div', { class: 'card-row' }, `Next: Ch. ${next.number} · ${fmtDate(next.date, { month: 'short', day: 'numeric' })}`) : null,
    );
  }

  function renderNovel(n) {
    document.title = `${n.title} · Chapter Tracker`;
    const s = novelStats(n);

    els.heroCover.replaceChildren(coverEl(n));
    els.heroKicker.replaceChildren(
      el('span', { class: 'pill' }, NOVEL_STATUS_BY_ID[n.status].label),
      ...[n.genre, n.platform, n.schedule && `Releases ${n.schedule}`].filter(Boolean).map((t) => el('span', {}, t)),
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

    els.statusTiles.replaceChildren(
      tile('all', 'All', s.total, null),
      ...STATUSES.map((st) => tile(st.id, st.label, s.counts[st.id], st.color)),
    );

    els.progress.replaceChildren(...progressSegments(n, s));
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

    renderList(n);
  }

  function tile(id, label, count, color) {
    return el('button', {
      class: 'tile',
      type: 'button',
      role: 'tab',
      style: color ? `--status-color:${color}` : null,
      'aria-selected': String(filter === id),
      onclick: () => { filter = filter === id ? 'all' : id; renderNovel(currentNovel()); },
    },
      el('div', { class: 'value' }, fmt(count)),
      el('div', { class: 'label' }, color ? el('span', { class: 'dot' }) : null, label),
    );
  }

  function renderList(n) {
    const q = query.trim().toLowerCase();
    const visible = n.chapters
      .filter((c) => filter === 'all' || c.status === filter)
      .filter((c) => !q || `${c.number} ${c.title} ${c.notes}`.toLowerCase().includes(q))
      .sort(SORTS[state.settings.sort].fn);

    if (!visible.length) {
      els.list.replaceChildren(el('div', { class: 'empty' }, n.chapters.length
        ? 'No chapters match this filter.'
        : 'No chapters yet. Use “+ Add chapter”, or “Add several” to set up a batch at once.'));
      return;
    }
    const today = todayIso();
    els.list.replaceChildren(...visible.map((c) => chapterRow(n, c, today)));
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
    if (c.link) {
      meta.push(el('a', {
        href: c.link, target: '_blank', rel: 'noopener noreferrer',
        onclick: (e) => e.stopPropagation(),
      }, 'Open link ↗'));
    }

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

  // ---------- chapter actions ----------

  function advance(chapterId, status) {
    const n = currentNovel();
    const c = n && n.chapters.find((x) => x.id === chapterId);
    if (!c) return;
    c.status = status;
    if (status === 'published' && !c.date) c.date = todayIso();
    c.updatedAt = Date.now();
    touch(n);
    if (save()) render();
  }

  function openChapterDialog(chapterId = null) {
    const n = currentNovel();
    editingChapterId = chapterId;
    const c = chapterId ? n.chapters.find((x) => x.id === chapterId) : null;
    const f = els.chapterForm.elements;
    const nextNumber = n.chapters.reduce((max, x) => Math.max(max, x.number), 0) + 1;

    els.chapterDialogTitle.textContent = c ? `Edit chapter ${c.number}` : 'Add chapter';
    els.chapterDeleteBtn.hidden = !c;
    els.chapterFormError.textContent = '';

    f.number.value = c ? c.number : nextNumber;
    f.title.value = c ? c.title : '';
    f.status.value = c ? c.status : (filter !== 'all' ? filter : 'draft');
    f.words.value = c && c.words != null ? c.words : '';
    f.date.value = c ? c.date : '';
    f.link.value = c ? c.link : '';
    f.notes.value = c ? c.notes : '';

    els.chapterDialog.showModal();
    (c ? f.title : f.number).focus();
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

    const data = {
      number,
      title: f.title.value.trim(),
      status: f.status.value,
      words: toInt(f.words.value),
      date: f.date.value,
      link: safeUrl(f.link.value),
      notes: f.notes.value.trim(),
      updatedAt: Date.now(),
    };
    if (data.status === 'published' && !data.date) data.date = todayIso();

    if (editingChapterId) Object.assign(n.chapters.find((c) => c.id === editingChapterId), data);
    else n.chapters.push({ id: newId(), ...data });
    touch(n);
    if (save()) {
      els.chapterDialog.close();
      render();
    }
  }

  function deleteChapter() {
    const n = currentNovel();
    const c = n.chapters.find((x) => x.id === editingChapterId);
    if (!c || !confirm(`Delete chapter ${c.number}${c.title ? ` “${c.title}”` : ''}? This can't be undone.`)) return;
    n.chapters = n.chapters.filter((x) => x.id !== editingChapterId);
    touch(n);
    if (save()) {
      els.chapterDialog.close();
      render();
    }
  }

  function openBulkDialog() {
    const n = currentNovel();
    const f = els.bulkForm.elements;
    const start = n.chapters.reduce((max, x) => Math.max(max, x.number), 0) + 1;
    f.from.value = start;
    f.to.value = n.targetChapters && n.targetChapters >= start ? n.targetChapters : start + 9;
    f.status.value = 'outline';
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
    const existing = new Set(n.chapters.map((c) => c.number));
    const now = Date.now();
    let added = 0;
    for (let i = from; i <= to; i++) {
      if (existing.has(i)) continue;
      n.chapters.push(normalizeChapter({ number: i, status: f.status.value, updatedAt: now }));
      added++;
    }
    touch(n);
    if (save()) {
      els.bulkDialog.close();
      render();
      const skipped = to - from + 1 - added;
      toast(`Added ${plural(added, 'chapter')}${skipped ? ` (skipped ${fmt(skipped)} that already existed)` : ''}.`);
    }
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
    f.schedule.value = n ? n.schedule : '';
    f.targetChapters.value = n && n.targetChapters ? n.targetChapters : '';
    f.wordGoal.value = n && n.wordGoal ? n.wordGoal : '';
    f.synopsis.value = n ? n.synopsis : '';

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

  async function chooseCover(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
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
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file for the cover.');
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
      schedule: f.schedule.value.trim(),
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
    const msg = `Delete “${n.title}” and its ${plural(n.chapters.length, 'chapter')}? This can't be undone.\n\nTip: use “Export this novel” first if you might want it back.`;
    if (!confirm(msg)) return;
    state.novels = state.novels.filter((x) => x.id !== n.id);
    if (!save()) return;
    els.novelDialog.close();
    goTo(null);
  }

  // ---------- import / export ----------

  function download(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportAll() {
    download({ version: 2, novels: state.novels }, `novel-library-${todayIso()}.json`);
  }

  function exportNovel() {
    const n = currentNovel();
    download({ version: 2, novels: [n] }, `${slug(n.title)}-${todayIso()}.json`);
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
      alert('That file couldn’t be read as a Novel Chapter Tracker export.');
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
    for (const n of imported) {
      const i = state.novels.findIndex((x) => x.id === n.id);
      if (i >= 0) state.novels[i] = n;
      else state.novels.push(n);
    }
    if (save()) {
      render();
      toast(`Imported ${plural(imported.length, 'novel')}.`);
    }
  }

  // ---------- wiring ----------

  const optionEls = (list) => list.map((s) => el('option', { value: s.id }, s.label));
  els.chapterForm.elements.status.append(...optionEls(STATUSES));
  els.bulkForm.elements.status.append(...optionEls(STATUSES));
  els.novelForm.elements.status.append(...optionEls(NOVEL_STATUSES));
  els.sort.append(...Object.entries(SORTS).map(([id, s]) => el('option', { value: id }, s.label)));
  els.sort.value = state.settings.sort;

  for (const btn of document.querySelectorAll('dialog [data-close]')) {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  }

  els.newNovelBtn.addEventListener('click', () => openNovelDialog());
  els.heroCover.addEventListener('click', () => openNovelDialog(currentId));
  els.editNovelBtn.addEventListener('click', () => openNovelDialog(currentId));
  els.exportNovelBtn.addEventListener('click', exportNovel);

  els.search.addEventListener('input', () => { query = els.search.value; renderList(currentNovel()); });
  els.sort.addEventListener('change', () => {
    state.settings.sort = els.sort.value;
    save();
    renderList(currentNovel());
  });
  els.addBtn.addEventListener('click', () => openChapterDialog());
  els.bulkBtn.addEventListener('click', openBulkDialog);

  els.chapterForm.addEventListener('submit', submitChapter);
  els.chapterDeleteBtn.addEventListener('click', deleteChapter);
  els.bulkForm.addEventListener('submit', submitBulk);

  els.novelForm.addEventListener('submit', submitNovel);
  els.novelDeleteBtn.addEventListener('click', deleteNovel);
  els.coverFile.addEventListener('change', chooseCover);
  els.coverRemove.addEventListener('click', () => { pendingCover = ''; renderCoverPreview(); });
  // Keep the placeholder cover's text in step with what's typed.
  els.novelForm.elements.title.addEventListener('input', renderCoverPreview);
  els.novelForm.elements.author.addEventListener('input', renderCoverPreview);

  els.themeSelect.addEventListener('change', () => {
    state.settings.theme = els.themeSelect.value;
    save();
    applyTheme();
  });
  els.exportBtn.addEventListener('click', exportAll);
  els.importFile.addEventListener('change', importJson);

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
