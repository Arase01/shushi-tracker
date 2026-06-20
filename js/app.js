// 収支トラッカー — アプリ本体
'use strict';

(() => {
  // ---- 状態 ----
  let entries = [];
  let period = { mode: 'month', anchor: new Date() }; // mode: all | month | year

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const els = {
    netPill: $('net-pill'),
    periodSelect: $('period-select'),
    periodNav: $('period-nav'),
    periodLabel: $('period-label'),
    periodPrev: $('period-prev'),
    periodNext: $('period-next'),
    sumStake: $('sum-stake'),
    sumReturn: $('sum-return'),
    sumNet: $('sum-net'),
    sumRoi: $('sum-roi'),
    tagBreakdown: $('tag-breakdown'),
    entryList: $('entry-list'),
    fab: $('fab'),
    modal: $('entry-modal'),
    form: $('entry-form'),
    modalTitle: $('modal-title'),
    fId: $('entry-id'),
    fDate: $('f-date'),
    fStake: $('f-stake'),
    fReturn: $('f-return'),
    fTags: $('f-tags'),
    fMemo: $('f-memo'),
    netPreview: $('net-preview'),
    tagSuggest: $('tag-suggest'),
    btnDelete: $('btn-delete'),
    btnCancel: $('btn-cancel'),
    btnMenu: $('btn-menu'),
    menuPop: $('menu-pop'),
    menuExport: $('menu-export'),
    menuImport: $('menu-import'),
    importFile: $('import-file'),
    tagFilter: $('tag-filter'),
    tagFilterControls: $('tag-filter-controls'),
    tagFilterCount: $('tag-filter-count'),
    tagClear: $('tag-clear'),
    navBtns: document.querySelectorAll('.nav-btn'),
    views: document.querySelectorAll('.view'),
    gFrom: $('g-from'),
    gTo: $('g-to'),
    gStake: $('g-stake'),
    gReturn: $('g-return'),
    gNet: $('g-net'),
    gRoi: $('g-roi'),
    resultCard: $('result-card'),
    chart: $('chart'),
    gTagBreakdown: $('g-tag-breakdown'),
    presetRow: document.querySelector('.preset-row'),
  };

  // ---- 拡張状態 ----
  const tagFilter = new Set(); // 選択タグを合算（OR）
  let activeView = 'summary';
  const range = { from: null, to: null }; // YYYY-MM-DD

  // ---- ユーティリティ ----
  const yen = (n) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('ja-JP')}円`;
  const signedYen = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toLocaleString('ja-JP')}円`;
  const toInt = (v) => {
    const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  };
  const todayStr = () => {
    const d = new Date();
    const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return tz.toISOString().slice(0, 10);
  };
  const parseTags = (raw) =>
    [...new Set((raw || '').split(/[,、，]/).map((t) => t.trim()).filter(Boolean))];

  // ---- 期間フィルタ ----
  function inPeriod(entry) {
    if (period.mode === 'all') return true;
    const d = entry.date; // YYYY-MM-DD
    const a = period.anchor;
    if (period.mode === 'month') {
      const ym = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}`;
      return d.startsWith(ym);
    }
    if (period.mode === 'year') {
      return d.startsWith(String(a.getFullYear()));
    }
    return true;
  }

  function periodLabelText() {
    const a = period.anchor;
    if (period.mode === 'all') return '全期間';
    if (period.mode === 'month') return `${a.getFullYear()}年${a.getMonth() + 1}月`;
    return `${a.getFullYear()}年`;
  }

  function shiftPeriod(dir) {
    const a = new Date(period.anchor);
    if (period.mode === 'month') a.setMonth(a.getMonth() + dir);
    else if (period.mode === 'year') a.setFullYear(a.getFullYear() + dir);
    period.anchor = a;
    render();
  }

  // ---- 集計 ----
  function aggregate(list) {
    let stake = 0, ret = 0;
    for (const e of list) { stake += e.stake; ret += e.return; }
    const net = ret - stake;
    const roi = stake > 0 ? (ret / stake) * 100 : null;
    return { stake, ret, net, roi, count: list.length };
  }

  function aggregateByTag(list) {
    const map = new Map();
    for (const e of list) {
      const tags = e.tags.length ? e.tags : ['（タグなし）'];
      for (const t of tags) {
        const cur = map.get(t) || { tag: t, stake: 0, ret: 0, count: 0 };
        cur.stake += e.stake;
        cur.ret += e.return;
        cur.count += 1;
        map.set(t, cur);
      }
    }
    const arr = [...map.values()].map((g) => ({
      ...g,
      net: g.ret - g.stake,
      roi: g.stake > 0 ? (g.ret / g.stake) * 100 : null,
    }));
    arr.sort((a, b) => b.net - a.net);
    return arr;
  }

  // ---- レンダリング ----
  function render() {
    renderTagFilterChips();
    els.periodLabel.textContent = periodLabelText();
    els.periodNav.style.visibility = period.mode === 'all' ? 'hidden' : 'visible';

    const filtered = applyTagFilter(entries.filter(inPeriod));
    const agg = aggregate(filtered);

    els.sumStake.textContent = yen(agg.stake);
    els.sumReturn.textContent = yen(agg.ret);
    els.sumNet.textContent = signedYen(agg.net);
    els.sumNet.className = 't-value ' + netClass(agg.net);
    els.sumRoi.textContent = agg.roi === null ? '—' : `${agg.roi.toFixed(0)}%`;

    const allNet = aggregate(entries).net;
    els.netPill.textContent = signedYen(allNet);
    els.netPill.className = 'net-pill ' + netClass(allNet);

    renderTagBreakdown(aggregateByTag(filtered), els.tagBreakdown);
    renderEntryList(filtered);
    renderGraph();
  }

  // ---- タグ絞り込み（複数選択して合算） ----
  function applyTagFilter(list) {
    if (tagFilter.size === 0) return list;
    return list.filter((e) => e.tags.some((t) => tagFilter.has(t))); // いずれかを含む＝合算
  }

  function renderTagFilterChips() {
    const counts = new Map();
    for (const e of entries) for (const t of e.tags) counts.set(t, (counts.get(t) || 0) + 1);
    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    // 既に存在しないタグが選択に残っていたら除去
    for (const t of [...tagFilter]) if (!counts.has(t)) tagFilter.delete(t);
    els.tagFilter.innerHTML = tags.length
      ? tags.map((t) =>
          `<button type="button" class="chip ${tagFilter.has(t) ? 'on' : ''}" data-ftag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
        ).join('')
      : '<span class="empty" style="padding:2px 0">タグはまだありません</span>';
    els.tagFilterControls.hidden = tagFilter.size === 0;
    els.tagFilterCount.textContent = String(tagFilter.size);
  }

  function netClass(n) {
    return n > 0 ? 'plus' : n < 0 ? 'minus' : 'zero';
  }

  function renderTagBreakdown(groups, target) {
    if (!groups.length) {
      target.innerHTML = '<p class="empty">記録がありません</p>';
      return;
    }
    const maxAbs = Math.max(...groups.map((g) => Math.abs(g.net)), 1);
    target.innerHTML = groups.map((g) => {
      const w = (Math.abs(g.net) / maxAbs) * 100;
      return `
      <div class="tag-row">
        <div class="tag-row-head">
          <span class="tag-name">${escapeHtml(g.tag)}</span>
          <span class="tag-net ${netClass(g.net)}">${signedYen(g.net)}</span>
        </div>
        <div class="tag-bar"><div class="tag-bar-fill ${netClass(g.net)}" style="width:${w}%"></div></div>
        <div class="tag-meta">${g.count}件 / 回収率 ${g.roi === null ? '—' : g.roi.toFixed(0) + '%'}</div>
      </div>`;
    }).join('');
  }

  function renderEntryList(list) {
    if (!list.length) {
      els.entryList.innerHTML = '<p class="empty">記録がありません。＋から追加してください。</p>';
      return;
    }
    els.entryList.innerHTML = list.map((e) => {
      const net = e.return - e.stake;
      const tags = e.tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('');
      return `
      <button class="entry-card" data-id="${e.id}">
        <div class="entry-main">
          <div class="entry-top">
            <span class="entry-date">${e.date}</span>
            <span class="entry-net ${netClass(net)}">${signedYen(net)}</span>
          </div>
          <div class="entry-sub">投資 ${yen(e.stake)} → 回収 ${yen(e.return)}</div>
          ${tags ? `<div class="entry-tags">${tags}</div>` : ''}
          ${e.memo ? `<div class="entry-memo">${escapeHtml(e.memo)}</div>` : ''}
        </div>
      </button>`;
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- モーダル ----
  function openModal(entry) {
    els.form.reset();
    els.tagSuggest.innerHTML = '';
    if (entry) {
      els.modalTitle.textContent = '記録を編集';
      els.fId.value = entry.id;
      els.fDate.value = entry.date;
      els.fStake.value = entry.stake;
      els.fReturn.value = entry.return;
      els.fTags.value = entry.tags.join(', ');
      els.fMemo.value = entry.memo || '';
      els.btnDelete.hidden = false;
    } else {
      els.modalTitle.textContent = '記録を追加';
      els.fId.value = '';
      els.fDate.value = todayStr();
      els.btnDelete.hidden = true;
    }
    updateNetPreview();
    renderTagSuggest();
    els.modal.hidden = false;
    requestAnimationFrame(() => els.modal.classList.add('open'));
  }

  function closeModal() {
    els.modal.classList.remove('open');
    setTimeout(() => { els.modal.hidden = true; }, 200);
  }

  function updateNetPreview() {
    const net = toInt(els.fReturn.value) - toInt(els.fStake.value);
    els.netPreview.textContent = `収支: ${signedYen(net)}`;
    els.netPreview.className = 'net-preview ' + netClass(net);
  }

  function renderTagSuggest() {
    const used = new Set();
    for (const e of entries) for (const t of e.tags) used.add(t);
    const current = new Set(parseTags(els.fTags.value));
    const top = [...used].filter((t) => !current.has(t)).slice(0, 12);
    els.tagSuggest.innerHTML = top
      .map((t) => `<button type="button" class="chip chip-add" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`)
      .join('');
  }

  function addTagToInput(tag) {
    const cur = parseTags(els.fTags.value);
    if (!cur.includes(tag)) cur.push(tag);
    els.fTags.value = cur.join(', ');
    renderTagSuggest();
  }

  // ---- 保存 / 削除 ----
  async function saveEntry(ev) {
    ev.preventDefault();
    const idVal = els.fId.value;
    const entry = {
      id: idVal ? Number(idVal) : Date.now(),
      date: els.fDate.value || todayStr(),
      stake: toInt(els.fStake.value),
      return: toInt(els.fReturn.value),
      tags: parseTags(els.fTags.value),
      memo: els.fMemo.value.trim(),
    };
    await DB.put(entry);
    entries = await DB.getAll();
    closeModal();
    render();
  }

  async function deleteEntry() {
    const idVal = els.fId.value;
    if (!idVal) return;
    if (!confirm('この記録を削除しますか？')) return;
    await DB.delete(Number(idVal));
    entries = await DB.getAll();
    closeModal();
    render();
  }

  // ---- バックアップ ----
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, entries }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shushi-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : data.entries;
      if (!Array.isArray(list)) throw new Error('形式が不正です');
      if (!confirm(`${list.length}件を読み込みます。同じIDの記録は上書きされます。続行しますか？`)) return;
      for (const e of list) {
        await DB.put({
          id: Number(e.id) || Date.now() + Math.floor(Math.random() * 1000),
          date: e.date,
          stake: toInt(e.stake),
          return: toInt(e.return),
          tags: Array.isArray(e.tags) ? e.tags : parseTags(e.tags),
          memo: e.memo || '',
        });
      }
      entries = await DB.getAll();
      render();
      alert('読み込みが完了しました。');
    } catch (err) {
      alert('読み込みに失敗しました: ' + err.message);
    }
  }

  function toggleMenu(show) {
    els.menuPop.hidden = show === undefined ? !els.menuPop.hidden : !show;
  }

  // ---- ビュー切替 ----
  function switchView(view) {
    activeView = view;
    els.views.forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    els.navBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    els.fab.classList.toggle('hide', view !== 'summary'); // 追加ボタンは集計画面のみ
    window.scrollTo(0, 0);
  }

  // ---- 結果ティア（パチンコ信頼度カラー） ----
  // 大勝ち=虹 / 勝ち=金 / トントン / 負け=青 / 大負け=消灯
  function tierOf(net, stake) {
    if (net === 0) return 'even';
    const r = stake > 0 ? net / stake : net > 0 ? 1 : -1;
    if (net > 0) return r >= 1.0 ? 'oogachi' : 'kachi'; // 回収率200%以上で大勝ち
    return r <= -0.5 ? 'oomake' : 'make'; // 投資の半分超を失ったら大負け
  }
  const TIER_META = {
    oogachi: { emoji: '🌈', label: '大勝ち', tag: '#超大当り' },
    kachi: { emoji: '🎉', label: '勝ち', tag: '#大当り' },
    even: { emoji: '😐', label: 'トントン', tag: '#プラマイゼロ' },
    make: { emoji: '😢', label: '負け', tag: '#ハズレ' },
    oomake: { emoji: '💀', label: '大負け', tag: '#ご臨終' },
  };

  // ---- 期間レンジ ----
  function defaultRange() {
    const to = todayStr();
    const d = new Date();
    d.setDate(d.getDate() - 29);
    const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return { from: tz.toISOString().slice(0, 10), to };
  }
  function applyPreset(preset) {
    const now = new Date();
    const y = now.getFullYear();
    if (preset === '30') {
      Object.assign(range, defaultRange());
    } else if (preset === 'month') {
      range.from = `${y}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      range.to = todayStr();
    } else if (preset === 'year') {
      range.from = `${y}-01-01`;
      range.to = todayStr();
    } else if (preset === 'all') {
      const dates = entries.map((e) => e.date).sort();
      range.from = dates[0] || `${y}-01-01`;
      range.to = dates[dates.length - 1] || todayStr();
    }
    els.gFrom.value = range.from;
    els.gTo.value = range.to;
    renderGraph();
  }

  function rangeList() {
    return entries
      .filter((e) => e.date >= range.from && e.date <= range.to)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function renderGraph() {
    if (!range.from || !range.to) Object.assign(range, defaultRange());
    if (els.gFrom.value !== range.from) els.gFrom.value = range.from;
    if (els.gTo.value !== range.to) els.gTo.value = range.to;
    const list = rangeList();
    const agg = aggregate(list);
    els.gStake.textContent = yen(agg.stake);
    els.gReturn.textContent = yen(agg.ret);
    els.gNet.textContent = signedYen(agg.net);
    els.gNet.className = 't-value ' + netClass(agg.net);
    els.gRoi.textContent = agg.roi === null ? '—' : `${agg.roi.toFixed(0)}%`;
    renderResultCard(agg, list);
    renderChart(list);
    renderTagBreakdown(aggregateByTag(list), els.gTagBreakdown);
  }

  function topTags(list, n) {
    const counts = new Map();
    for (const e of list) for (const t of e.tags) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
  }

  function rangeLabel() {
    return `${range.from} 〜 ${range.to}`;
  }

  function renderResultCard(agg, list) {
    const tier = tierOf(agg.net, agg.stake);
    const meta = TIER_META[tier];
    const tags = topTags(list, 3);
    const roiText = agg.roi === null ? '—' : `${agg.roi.toFixed(0)}%`;
    els.resultCard.className = 'result-card tier-' + tier;
    els.resultCard.innerHTML = `
      <div class="rc-emoji">${meta.emoji}</div>
      <div class="rc-tier">${meta.label}</div>
      <div class="rc-net">${signedYen(agg.net)}</div>
      <div class="rc-meta">回収率 ${roiText} ・ ${list.length}件 ・ ${rangeLabel()}</div>
      ${tags.length ? `<div class="rc-tags">${tags.map((t) => `<span class="chip">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <span class="rc-mark">収支トラッカー</span>`;
  }

  function renderChart(list) {
    if (!list.length) {
      els.chart.innerHTML = '<p class="empty">この期間に記録がありません</p>';
      return;
    }
    const byDate = new Map();
    for (const e of list) byDate.set(e.date, (byDate.get(e.date) || 0) + (e.return - e.stake));
    const dates = [...byDate.keys()].sort();
    let cum = 0;
    const pts = dates.map((d) => ({ t: Date.parse(d), cum: (cum += byDate.get(d)) }));
    const W = 340, H = 180, pad = 24;
    const ts = pts.map((p) => p.t);
    const xmin = Math.min(...ts), xmax = Math.max(...ts);
    const cums = pts.map((p) => p.cum);
    let ymin = Math.min(0, ...cums), ymax = Math.max(0, ...cums);
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    const X = (t) => pad + (xmax === xmin ? 0.5 : (t - xmin) / (xmax - xmin)) * (W - 2 * pad);
    const Y = (v) => pad + (1 - (v - ymin) / (ymax - ymin)) * (H - 2 * pad);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.cum).toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const color = last.cum > 0 ? '#34d399' : last.cum < 0 ? '#f87171' : '#8aa0bd';
    const zeroY = Y(0).toFixed(1);
    const area = `${line} L${X(last.t).toFixed(1)} ${zeroY} L${X(pts[0].t).toFixed(1)} ${zeroY} Z`;
    els.chart.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="収支の累積推移">
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${pad}" y1="${zeroY}" x2="${W - pad}" y2="${zeroY}" stroke="#ffffff33" stroke-dasharray="3 3"/>
        <path d="${area}" fill="url(#cg)"/>
        <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${X(last.t).toFixed(1)}" cy="${Y(last.cum).toFixed(1)}" r="4" fill="${color}"/>
        <text x="${pad}" y="14" fill="#8aa0bd" font-size="9">${dates[0]}</text>
        <text x="${W - pad}" y="14" fill="#8aa0bd" font-size="9" text-anchor="end">${dates[dates.length - 1]}</text>
        <text x="${X(last.t).toFixed(1)}" y="${(Y(last.cum) - 8).toFixed(1)}" fill="${color}" font-size="11" font-weight="700" text-anchor="end">${signedYen(last.cum)}</text>
      </svg>`;
  }

  // ---- イベント ----
  function bind() {
    els.fab.addEventListener('click', () => openModal(null));
    els.btnCancel.addEventListener('click', closeModal);
    els.btnDelete.addEventListener('click', deleteEntry);
    els.form.addEventListener('submit', saveEntry);
    els.fStake.addEventListener('input', updateNetPreview);
    els.fReturn.addEventListener('input', updateNetPreview);
    els.fTags.addEventListener('input', renderTagSuggest);

    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) closeModal();
    });

    els.tagSuggest.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tag]');
      if (btn) addTagToInput(btn.dataset.tag);
    });

    els.entryList.addEventListener('click', (e) => {
      const card = e.target.closest('[data-id]');
      if (!card) return;
      const entry = entries.find((x) => x.id === Number(card.dataset.id));
      if (entry) openModal(entry);
    });

    els.periodSelect.addEventListener('change', () => {
      period.mode = els.periodSelect.value;
      period.anchor = new Date();
      render();
    });
    els.periodPrev.addEventListener('click', () => shiftPeriod(-1));
    els.periodNext.addEventListener('click', () => shiftPeriod(1));

    els.btnMenu.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', () => toggleMenu(false));
    els.menuPop.addEventListener('click', (e) => e.stopPropagation());
    els.menuExport.addEventListener('click', () => { exportData(); toggleMenu(false); });
    els.menuImport.addEventListener('click', () => { els.importFile.click(); toggleMenu(false); });
    els.importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });

    // タグ絞り込み
    els.tagFilter.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ftag]');
      if (!btn) return;
      const t = btn.dataset.ftag;
      if (tagFilter.has(t)) tagFilter.delete(t); else tagFilter.add(t);
      render();
    });
    els.tagClear.addEventListener('click', () => { tagFilter.clear(); render(); });

    // ビュー切替
    els.navBtns.forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

    // 結果ページ
    els.presetRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset]');
      if (btn) applyPreset(btn.dataset.preset);
    });
    els.gFrom.addEventListener('change', () => { range.from = els.gFrom.value; renderGraph(); });
    els.gTo.addEventListener('change', () => { range.to = els.gTo.value; renderGraph(); });
  }

  // ---- 初期化 ----
  async function init() {
    bind();
    entries = await DB.getAll();
    els.periodSelect.value = period.mode;
    Object.assign(range, defaultRange());
    els.gFrom.value = range.from;
    els.gTo.value = range.to;
    render();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
