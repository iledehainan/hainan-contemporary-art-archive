/* 文献库检索页 */

(() => {
  const { esc, qs, api, bootstrap, coverMarkup, demoChip } = App;

  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get('q') || '',
    category: new Set((params.get('category') || '').split(',').filter(Boolean)),
    decade: params.get('decade') || '',
    artist: params.get('artist') || '',
    sort: params.get('sort') || 'year_desc',
    page: Number(params.get('page') || 1) || 1,
    view: params.get('view') || localStorage.getItem('hnca-view') || 'list',
    pageSize: 20
  };

  App.chrome('archive');
  qs('#f-keyword').value = state.q;
  qs('#f-sort').value = state.sort;

  let categories = [];
  let searchTimer = null;

  function decadeRange(decade) {
    if (!decade) return {};
    const start = Number(decade);
    return { year_from: start, year_to: start + 9 };
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category.size) p.set('category', Array.from(state.category).join(','));
    if (state.decade) p.set('decade', state.decade);
    if (state.artist) p.set('artist', state.artist);
    if (state.sort !== 'year_desc') p.set('sort', state.sort);
    if (state.page > 1) p.set('page', String(state.page));
    if (state.view !== 'list') p.set('view', state.view);
    const qsStr = p.toString();
    history.replaceState(null, '', qsStr ? `?${qsStr}` : location.pathname);
  }

  function renderCategories(counts) {
    const order = categories.length ? categories : counts.map((c) => c.category);
    const map = new Map(counts.map((c) => [c.category, c.n]));
    qs('#f-categories').innerHTML = order
      .map(
        (cat) => `
        <label class="filter-item">
          <span class="label">
            <input type="checkbox" value="${esc(cat)}" ${state.category.has(cat) ? 'checked' : ''} />
            <span class="box"></span>
            <span>${esc(cat)}</span>
          </span>
          <span class="count">${map.get(cat) || 0}</span>
        </label>`
      )
      .join('');
    App.qsa('#f-categories input').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) state.category.add(input.value);
        else state.category.delete(input.value);
        state.page = 1;
        load();
      });
    });
  }

  function renderDecades(years) {
    const select = qs('#f-decade');
    if (select.options.length > 1) return;
    const to = years && years.to ? years.to : new Date().getFullYear();
    const from = years && years.from ? years.from : 1980;
    const start = Math.floor(from / 10) * 10;
    const end = Math.floor(to / 10) * 10;
    const opts = [];
    for (let y = end; y >= start; y -= 10) {
      opts.push(`<option value="${y}" ${String(y) === state.decade ? 'selected' : ''}>${y} — ${y + 9}</option>`);
    }
    select.innerHTML = `<option value="">全部年代</option>${opts.join('')}`;
    select.addEventListener('change', () => {
      state.decade = select.value;
      state.page = 1;
      load();
    });
  }

  async function loadArtists() {
    const data = await api('/api/artists').catch(() => ({ items: [] }));
    if (!data.items.length) return;
    const group = qs('#f-artist-group');
    group.hidden = false;
    const select = qs('#f-artist');
    select.innerHTML =
      `<option value="">全部</option>` +
      data.items
        .map(
          (a) =>
            `<option value="${a.id}" ${String(a.id) === String(state.artist) ? 'selected' : ''}>${esc(a.name)}${
              a.birth_year ? `（${a.birth_year}）` : ''
            }</option>`
        )
        .join('');
    select.addEventListener('change', () => {
      state.artist = select.value;
      state.page = 1;
      load();
    });
  }

  function renderChips() {
    const chips = [];
    if (state.q)
      chips.push(`<span class="chip">关键词：${esc(state.q)}<button type="button" data-clear="q" aria-label="清除关键词">×</button></span>`);
    state.category.forEach((cat) =>
      chips.push(`<span class="chip">${esc(cat)}<button type="button" data-clear-cat="${esc(cat)}" aria-label="移除">×</button></span>`)
    );
    if (state.decade)
      chips.push(`<span class="chip">${esc(state.decade)}—${Number(state.decade) + 9}<button type="button" data-clear="decade" aria-label="清除年代">×</button></span>`);
    if (state.artist) {
      const text = qs('#f-artist').selectedOptions[0] ? qs('#f-artist').selectedOptions[0].textContent : '';
      chips.push(`<span class="chip">艺术家：${esc(text)}<button type="button" data-clear="artist" aria-label="清除艺术家">×</button></span>`);
    }
    qs('#active-filters').innerHTML = chips.join('');

    App.qsa('#active-filters [data-clear]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const key = btn.dataset.clear;
        if (key === 'q') {
          state.q = '';
          qs('#f-keyword').value = '';
        } else if (key === 'decade') {
          state.decade = '';
          qs('#f-decade').value = '';
        } else if (key === 'artist') {
          state.artist = '';
          qs('#f-artist').value = '';
        }
        state.page = 1;
        load();
      })
    );
    App.qsa('#active-filters [data-clear-cat]').forEach((btn) =>
      btn.addEventListener('click', () => {
        state.category.delete(btn.dataset.clearCat);
        state.page = 1;
        load();
      })
    );
  }

  function renderList(items) {
    return `<div class="row-list" style="margin-top:18px">
      ${items
        .map(
          (d) => `
        <a class="doc-row" href="/doc/${d.id}">
          <span class="row-code">${esc(d.code || '')}</span>
          <span>
            <h3>${esc(d.title)}${demoChip(d)}</h3>
            <span class="row-meta">
              <span>${esc(d.category)}</span>
              <span>${esc(d.author || '佚名')}</span>
              ${d.publisher ? `<span>${esc(d.publisher)}</span>` : ''}
              <span>${esc(d.year || '——')}</span>
              ${d.artists ? `<span>${esc(d.artists)}</span>` : ''}
            </span>
            ${d.summary ? `<p class="row-sum">${esc(d.summary)}</p>` : ''}
            ${
              d.tags && d.tags.length
                ? `<span class="tag-row">${d.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>`
                : ''
            }
          </span>
          ${d.cover ? `<span class="row-thumb"><img src="${esc(d.cover)}" alt="" loading="lazy" /></span>` : '<span></span>'}
        </a>`
        )
        .join('')}
    </div>`;
  }

  function renderGrid(items) {
    return `<div class="grid-view">
      ${items
        .map(
          (d) => `
        <a class="doc-card" href="/doc/${d.id}">
          <div class="cover">${coverMarkup(d)}</div>
          <div class="card-body">
            <span class="code">${esc(d.code || '')}</span>
            <h3>${esc(d.title)}${demoChip(d)}</h3>
            <div class="card-meta">
              <span>${esc(d.author || '佚名')}</span>
              <span>${esc(d.year || '')}</span>
            </div>
          </div>
        </a>`
        )
        .join('')}
    </div>`;
  }

  function renderPager(total) {
    const pages = Math.ceil(total / state.pageSize);
    const host = qs('#pager');
    if (pages <= 1) {
      host.innerHTML = '';
      return;
    }
    const buttons = [];
    buttons.push(`<button type="button" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>←</button>`);
    const windowStart = Math.max(1, Math.min(state.page - 2, pages - 4));
    const windowEnd = Math.min(pages, windowStart + 4);
    if (windowStart > 1) {
      buttons.push(`<button type="button" data-page="1">1</button>`);
      if (windowStart > 2) buttons.push(`<button type="button" disabled>…</button>`);
    }
    for (let p = windowStart; p <= windowEnd; p += 1) {
      buttons.push(`<button type="button" data-page="${p}" class="${p === state.page ? 'is-on' : ''}">${p}</button>`);
    }
    if (windowEnd < pages) {
      if (windowEnd < pages - 1) buttons.push(`<button type="button" disabled>…</button>`);
      buttons.push(`<button type="button" data-page="${pages}">${pages}</button>`);
    }
    buttons.push(`<button type="button" data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>→</button>`);
    host.innerHTML = buttons.join('');
    App.qsa('#pager [data-page]').forEach((btn) =>
      btn.addEventListener('click', () => {
        state.page = Number(btn.dataset.page);
        load();
        qs('.results-head').scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
    );
  }

  function renderEmpty() {
    qs('#results').innerHTML = `
      <div class="empty">
        <div class="empty-mark">无 记 录</div>
        <p>没有符合当前条件的文献。可减少筛选条件，或更换关键词。</p>
      </div>`;
  }

  async function load() {
    syncUrl();
    renderChips();
    qs('#results').innerHTML = `<div class="loading-row skeleton" style="margin-top:18px"></div><div class="loading-row skeleton"></div>`;
    const range = decadeRange(state.decade);
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category.size) p.set('category', Array.from(state.category).join(','));
    if (range.year_from != null) p.set('year_from', range.year_from);
    if (range.year_to != null) p.set('year_to', range.year_to);
    if (state.artist) p.set('artist', state.artist);
    p.set('sort', state.sort);
    p.set('page', String(state.page));
    p.set('page_size', String(state.pageSize));

    try {
      const data = await api(`/api/documents?${p.toString()}`);
      qs('#result-count').textContent = data.total;
      if (!data.items.length) {
        renderEmpty();
        qs('#pager').innerHTML = '';
        return;
      }
      qs('#results').innerHTML = state.view === 'grid' ? renderGrid(data.items) : renderList(data.items);
      renderPager(data.total);
    } catch (err) {
      qs('#results').innerHTML = `<div class="empty"><div class="empty-mark">连 接 失 败</div><p>${esc(err.message)}</p></div>`;
    }
  }

  qs('#f-keyword').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value.trim();
    searchTimer = setTimeout(() => {
      state.q = value;
      state.page = 1;
      load();
    }, 320);
  });

  qs('#f-sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.page = 1;
    load();
  });

  App.qsa('.view-toggle button').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      localStorage.setItem('hnca-view', state.view);
      App.qsa('.view-toggle button').forEach((b) => b.classList.toggle('is-on', b === btn));
      load();
    })
  );

  qs('#f-reset').addEventListener('click', () => {
    state.q = '';
    state.category.clear();
    state.decade = '';
    state.artist = '';
    state.page = 1;
    qs('#f-keyword').value = '';
    qs('#f-decade').value = '';
    qs('#f-artist').value = '';
    App.qsa('#f-categories input').forEach((i) => (i.checked = false));
    load();
  });

  (async () => {
    const boot = await bootstrap();
    categories = boot.categories || [];
    renderCategories((boot.stats && boot.stats.categories) || []);
    renderDecades(boot.stats && boot.stats.years);
    loadArtists();
    App.qsa('.view-toggle button').forEach((b) => b.classList.toggle('is-on', b.dataset.view === state.view));
    load();
  })();
})();
