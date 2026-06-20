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
  };

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
    els.periodLabel.textContent = periodLabelText();
    els.periodNav.style.visibility = period.mode === 'all' ? 'hidden' : 'visible';

    const filtered = entries.filter(inPeriod);
    const agg = aggregate(filtered);

    els.sumStake.textContent = yen(agg.stake);
    els.sumReturn.textContent = yen(agg.ret);
    els.sumNet.textContent = signedYen(agg.net);
    els.sumNet.className = 't-value ' + netClass(agg.net);
    els.sumRoi.textContent = agg.roi === null ? '—' : `${agg.roi.toFixed(0)}%`;

    const allNet = aggregate(entries).net;
    els.netPill.textContent = signedYen(allNet);
    els.netPill.className = 'net-pill ' + netClass(allNet);

    renderTagBreakdown(aggregateByTag(filtered));
    renderEntryList(filtered);
  }

  function netClass(n) {
    return n > 0 ? 'plus' : n < 0 ? 'minus' : 'zero';
  }

  function renderTagBreakdown(groups) {
    if (!groups.length) {
      els.tagBreakdown.innerHTML = '<p class="empty">記録がありません</p>';
      return;
    }
    const maxAbs = Math.max(...groups.map((g) => Math.abs(g.net)), 1);
    els.tagBreakdown.innerHTML = groups.map((g) => {
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
  }

  // ---- 初期化 ----
  async function init() {
    bind();
    entries = await DB.getAll();
    els.periodSelect.value = period.mode;
    render();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
