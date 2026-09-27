(() => {
  'use strict';

  const STORAGE_KEY = 'novel-chapter-tracker:v1';

  // Ordered by workflow. The "next" status is what the quick-advance button moves to.
  const STATUSES = [
    { id: 'draft',     label: 'Draft',     color: 'var(--draft)' },
    { id: 'revising',  label: 'Revising',  color: 'var(--revising)' },
    { id: 'scheduled', label: 'Scheduled', color: 'var(--scheduled)' },
    { id: 'published', label: 'Published', color: 'var(--published)' },
  ];
  const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

  const $ = (id) => document.getElementById(id);
  const els = {
    novelTitle: $('novel-title'),
    stats: $('stats'),
    progress: $('progress-bar'),
    filters: $('filters'),
    search: $('search'),
    list: $('list'),
    addBtn: $('add-btn'),
    exportBtn: $('export-btn'),
    importFile: $('import-file'),
    dialog: $('chapter-dialog'),
    form: $('chapter-form'),
    dialogTitle: $('dialog-title'),
    formError: $('form-error'),
    deleteBtn: $('delete-btn'),
    cancelBtn: $('cancel-btn'),
  };

  let state = load();
  let filter = 'all';
  let query = '';
  let editingId = null;

  // ---------- persistence ----------

  function emptyState() {
    return { novelTitle: '', chapters: [] };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyState();
    } catch {
      return emptyState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be unavailable (private mode, quota); the page still works for this session.
    }
  }

  // Coerces untrusted data (from storage or an imported file) into a valid state shape.
  function normalize(data) {
    if (!data || typeof data !== 'object') throw new Error('Not a tracker file');
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    return {
      novelTitle: typeof data.novelTitle === 'string' ? data.novelTitle : '',
      chapters: chapters
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({
          id: typeof c.id === 'string' && c.id ? c.id : newId(),
          number: toInt(c.number) ?? 0,
          title: str(c.title),
          status: STATUS_BY_ID[c.status] ? c.status : 'draft',
          words: toInt(c.words),
          date: /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : '',
          link: safeUrl(c.link),
          notes: str(c.notes),
        })),
    };
  }

  function str(v) { return typeof v === 'string' ? v : ''; }

  function toInt(v) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
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

  function newId() {
    return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // ---------- rendering ----------

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c != null && c !== false) node.append(c);
    return node;
  }

  function counts() {
    const out = { all: state.chapters.length };
    for (const s of STATUSES) out[s.id] = 0;
    for (const c of state.chapters) out[c.status]++;
    return out;
  }

  function fmt(n) { return n.toLocaleString(); }

  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function render() {
    if (document.activeElement !== els.novelTitle) els.novelTitle.value = state.novelTitle;
    document.title = state.novelTitle ? `${state.novelTitle} · Chapter Tracker` : 'Novel Chapter Tracker';

    const c = counts();
    const totalWords = state.chapters.reduce((sum, ch) => sum + (ch.words || 0), 0);
    const publishedWords = state.chapters
      .filter((ch) => ch.status === 'published')
      .reduce((sum, ch) => sum + (ch.words || 0), 0);

    els.stats.replaceChildren(
      ...STATUSES.map((s) => stat(s.label, fmt(c[s.id]), s.color)),
      stat('Words written', fmt(totalWords)),
      stat('Words published', fmt(publishedWords), 'var(--published)'),
    );

    els.progress.replaceChildren(
      ...[...STATUSES].reverse().map((s) =>
        el('span', {
          style: `width:${c.all ? (c[s.id] / c.all) * 100 : 0}%;background:${s.color}`,
          title: `${s.label}: ${c[s.id]}`,
        }),
      ),
    );

    els.filters.replaceChildren(
      chip('all', 'All', c.all),
      ...STATUSES.map((s) => chip(s.id, s.label, c[s.id])),
    );

    renderList();
  }

  function stat(label, value, color) {
    return el('div', { class: 'stat' },
      el('div', { class: 'value' }, value),
      el('div', { class: 'label' }, color ? el('span', { class: 'dot', style: `--status-color:${color}` }) : null, label),
    );
  }

  function chip(id, label, count) {
    return el('button', {
      class: 'chip',
      type: 'button',
      role: 'tab',
      'aria-selected': String(filter === id),
      onclick: () => { filter = id; render(); },
    }, label, el('span', { class: 'count' }, String(count)));
  }

  function renderList() {
    const q = query.trim().toLowerCase();
    const visible = state.chapters
      .filter((ch) => filter === 'all' || ch.status === filter)
      .filter((ch) => !q || `${ch.number} ${ch.title} ${ch.notes}`.toLowerCase().includes(q))
      .sort((a, b) => a.number - b.number || a.title.localeCompare(b.title));

    if (!visible.length) {
      const msg = state.chapters.length
        ? 'No chapters match this filter.'
        : 'No chapters yet. Click “+ Add chapter” to start tracking.';
      els.list.replaceChildren(el('div', { class: 'empty' }, msg));
      return;
    }

    els.list.replaceChildren(...visible.map(chapterRow));
  }

  function chapterRow(ch) {
    const s = STATUS_BY_ID[ch.status];
    const idx = STATUSES.indexOf(s);
    const next = STATUSES[idx + 1];

    const meta = [];
    if (ch.words) meta.push(el('span', {}, `${fmt(ch.words)} words`));
    if (ch.date) meta.push(el('span', {}, `${ch.status === 'published' ? 'Published' : 'Planned'} ${fmtDate(ch.date)}`));
    if (ch.link) {
      meta.push(el('a', {
        href: ch.link, target: '_blank', rel: 'noopener noreferrer',
        onclick: (e) => e.stopPropagation(),
      }, 'Open link ↗'));
    }

    return el('article', {
      class: 'chapter',
      style: `--status-color:${s.color}`,
      tabindex: '0',
      'aria-label': `Chapter ${ch.number}${ch.title ? `: ${ch.title}` : ''}, ${s.label}`,
      onclick: () => openDialog(ch.id),
      onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openDialog(ch.id); },
    },
      el('div', { class: 'num' }, String(ch.number)),
      el('div', {},
        el('div', { class: 'title' }, ch.title || `Chapter ${ch.number}`),
        meta.length ? el('div', { class: 'meta' }, ...meta) : null,
        ch.notes ? el('div', { class: 'notes' }, ch.notes) : null,
      ),
      el('div', { class: 'actions' },
        el('span', { class: 'badge' }, el('span', { class: 'dot' }), s.label),
        next ? el('button', {
          class: 'btn small',
          type: 'button',
          title: `Move to ${next.label}`,
          onclick: (e) => { e.stopPropagation(); advance(ch.id, next.id); },
        }, `→ ${next.label}`) : null,
      ),
    );
  }

  // ---------- actions ----------

  function advance(id, status) {
    const ch = state.chapters.find((c) => c.id === id);
    if (!ch) return;
    ch.status = status;
    if (status === 'published' && !ch.date) ch.date = todayIso();
    save();
    render();
  }

  function todayIso() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function openDialog(id = null) {
    editingId = id;
    const ch = id ? state.chapters.find((c) => c.id === id) : null;
    const f = els.form.elements;
    const nextNumber = state.chapters.reduce((max, c) => Math.max(max, c.number), 0) + 1;

    els.dialogTitle.textContent = ch ? `Edit chapter ${ch.number}` : 'Add chapter';
    els.deleteBtn.hidden = !ch;
    els.formError.textContent = '';

    f.number.value = ch ? ch.number : nextNumber;
    f.title.value = ch ? ch.title : '';
    f.status.value = ch ? ch.status : 'draft';
    f.words.value = ch && ch.words != null ? ch.words : '';
    f.date.value = ch ? ch.date : '';
    f.link.value = ch ? ch.link : '';
    f.notes.value = ch ? ch.notes : '';

    els.dialog.showModal();
    (ch ? f.title : f.number).focus();
  }

  function submitForm(e) {
    e.preventDefault();
    const f = els.form.elements;
    const number = toInt(f.number.value);
    if (number == null) {
      els.formError.textContent = 'Enter a chapter number (0 or higher).';
      return;
    }
    if (f.link.value.trim() && !safeUrl(f.link.value)) {
      els.formError.textContent = 'The link must start with http:// or https://';
      return;
    }
    const clash = state.chapters.find((c) => c.number === number && c.id !== editingId);
    if (clash && !confirm(`Chapter ${number} already exists. Save anyway?`)) return;

    const data = {
      number,
      title: f.title.value.trim(),
      status: f.status.value,
      words: toInt(f.words.value),
      date: f.date.value,
      link: safeUrl(f.link.value),
      notes: f.notes.value.trim(),
    };
    if (data.status === 'published' && !data.date) data.date = todayIso();

    if (editingId) {
      Object.assign(state.chapters.find((c) => c.id === editingId), data);
    } else {
      state.chapters.push({ id: newId(), ...data });
    }
    save();
    els.dialog.close();
    render();
  }

  function deleteChapter() {
    const ch = state.chapters.find((c) => c.id === editingId);
    if (!ch || !confirm(`Delete chapter ${ch.number}${ch.title ? ` “${ch.title}”` : ''}? This can't be undone.`)) return;
    state.chapters = state.chapters.filter((c) => c.id !== editingId);
    save();
    els.dialog.close();
    render();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const slug = (state.novelTitle || 'novel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'novel';
    const a = el('a', { href: url, download: `${slug}-chapters-${todayIso()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJson(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = normalize(JSON.parse(await file.text()));
      const msg = `Import ${imported.chapters.length} chapter(s)? This replaces the ${state.chapters.length} chapter(s) currently saved here.`;
      if (!confirm(msg)) return;
      state = imported;
      save();
      render();
    } catch {
      alert('That file could not be read as a chapter tracker export.');
    }
  }

  // ---------- wiring ----------

  els.form.elements.status.append(...STATUSES.map((s) => el('option', { value: s.id }, s.label)));

  els.novelTitle.addEventListener('input', () => {
    state.novelTitle = els.novelTitle.value;
    save();
    document.title = state.novelTitle ? `${state.novelTitle} · Chapter Tracker` : 'Novel Chapter Tracker';
  });
  els.search.addEventListener('input', () => { query = els.search.value; renderList(); });
  els.addBtn.addEventListener('click', () => openDialog());
  els.form.addEventListener('submit', submitForm);
  els.cancelBtn.addEventListener('click', () => els.dialog.close());
  els.deleteBtn.addEventListener('click', deleteChapter);
  els.exportBtn.addEventListener('click', exportJson);
  els.importFile.addEventListener('change', importJson);

  // Keep tabs in sync if the tracker is open in more than one window.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) { state = load(); render(); }
  });

  render();
})();
