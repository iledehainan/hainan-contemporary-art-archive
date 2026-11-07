/* 海南当代艺术文献 · 公共脚本 */

const App = (() => {
  const state = { bootstrap: null };

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `请求失败（${res.status}）`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function bootstrap() {
    if (!state.bootstrap) {
      state.bootstrap = api('/api/bootstrap').catch(() => ({
        settings: { site_name: '海南当代艺术文献', site_name_en: 'Hainan Contemporary Art Archive' },
        categories: [],
        stats: { documents: 0, artists: 0, exhibitions: 0, timeline: 0 }
      }));
    }
    return state.bootstrap;
  }

  const navItems = [
    { href: '/archive', label: '文献库', key: 'archive' },
    { href: '/gallery', label: '图像', key: 'gallery' },
    { href: '/artists', label: '艺术家', key: 'artists' },
    { href: '/exhibitions', label: '展览', key: 'exhibitions' },
    { href: '/timeline', label: '年表', key: 'timeline' },
    { href: '/about', label: '关于', key: 'about' }
  ];

  const searchIcon = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8.6" cy="8.6" r="5.4"/><path d="M12.7 12.7 17 17"/></svg>`;

  function chrome(active) {
    const headerHost = qs('#site-header');
    const footerHost = qs('#site-footer');

    if (headerHost) {
      headerHost.innerHTML = `
        <header class="site-header">
          <div class="wrap header-inner">
            <a class="brand" href="/">
              <span class="brand-seal">文</span>
              <span class="brand-text">
                <span class="brand-name">海南当代艺术文献</span>
                <span class="brand-en">Hainan Contemporary Art Archive</span>
              </span>
            </a>
            <nav class="site-nav" id="site-nav">
              ${navItems
                .map(
                  (item) =>
                    `<a href="${item.href}" class="${item.key === active ? 'is-active' : ''}"${
                      item.key === active ? ' aria-current="page"' : ''
                    }>${item.label}</a>`
                )
                .join('')}
            </nav>
            <div class="header-tools">
              <button class="btn-search" type="button" data-open-search>
                ${searchIcon}<span>检索</span>
              </button>
              <a class="admin-link" href="/admin">ADMIN</a>
              <button class="nav-toggle" type="button" id="nav-toggle" aria-expanded="false">目录</button>
            </div>
          </div>
        </header>`;
    }

    if (footerHost) {
      footerHost.innerHTML = `
        <footer class="site-footer">
          <div class="wrap">
            <div class="footer-grid">
              <div class="footer-brand-col">
                <p class="footer-brand">海南当代艺术文献</p>
                <p class="footer-note">以海南当代艺术的现场为对象，收集、编目并数字化展览画册、评论、手稿、访谈与影像材料，供研究与教学使用。</p>
              </div>
              <div class="footer-col">
                <h5>浏览</h5>
                <a href="/archive">文献库</a>
                <a href="/artists">艺术家</a>
                <a href="/exhibitions">展览</a>
                <a href="/timeline">年表</a>
              </div>
              <div class="footer-col">
                <h5>使用</h5>
                <a href="/about">关于本库</a>
                <a href="/about#rights">引用与版权</a>
                <a href="/about#contribute">提供线索</a>
                <a href="/admin">档案管理</a>
              </div>
            </div>
            <div class="footer-base">
              <span>© <span id="footer-year"></span> 海南当代艺术文献 · HNCA</span>
              <span>档案编号格式 HNCA-D-0000</span>
            </div>
          </div>
        </footer>`;
      const yearEl = qs('#footer-year');
      if (yearEl) yearEl.textContent = new Date().getFullYear();
    }

    const toggle = qs('#nav-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const nav = qs('#site-nav');
        const open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }

    bootstrap().then((boot) => {
      const settings = (boot && boot.settings) || {};
      const name = settings.site_name || '海南当代艺术文献';
      const en = settings.site_name_en || 'Hainan Contemporary Art Archive';
      qsa('.brand-name').forEach((el) => (el.textContent = name));
      qsa('.brand-en').forEach((el) => (el.textContent = en));
      qsa('.footer-brand').forEach((el) => (el.textContent = name));
    });

    buildSearchOverlay();
    qsa('[data-open-search]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openSearch();
      })
    );
  }

  /* ---------------- 检索层 ---------------- */

  let overlay = null;
  let searchTimer = null;

  function buildSearchOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '全站检索');
    overlay.innerHTML = `
      <button class="search-close" type="button" data-close-search>关闭 ESC</button>
      <div class="search-overlay-inner">
        <div class="search-field">
          ${searchIcon}
          <input type="search" id="global-search-input" placeholder="检索文献、艺术家、展览、事件…" autocomplete="off" />
          <span class="esc">ENTER</span>
        </div>
        <div class="search-results" id="global-search-results"></div>
        <div class="search-tips">
          可按类目浏览：<code>展览画册</code> <code>艺术评论</code> <code>艺术家手稿</code>
          <code>访谈与口述</code> <code>影像资料</code> <code>期刊与剪报</code> <code>档案文件</code>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });
    overlay.querySelector('[data-close-search]').addEventListener('click', closeSearch);

    const input = overlay.querySelector('#global-search-input');
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (!q) {
        renderSearchIdle();
        return;
      }
      searchTimer = setTimeout(() => runSearch(q), 240);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) window.location.href = `/archive?q=${encodeURIComponent(q)}`;
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeSearch();
      if ((e.key === '/' || (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') && !isTyping(e)) {
        e.preventDefault();
        openSearch();
      }
    });
  }

  function isTyping(e) {
    const el = e.target;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  function renderSearchIdle() {
    const box = qs('#global-search-results');
    if (box) box.innerHTML = '';
  }

  function openSearch() {
    buildSearchOverlay();
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    renderSearchIdle();
    setTimeout(() => qs('#global-search-input').focus(), 40);
  }

  function closeSearch() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    const input = qs('#global-search-input');
    if (input) input.value = '';
  }

  async function runSearch(q) {
    const box = qs('#global-search-results');
    box.innerHTML = `<p class="search-empty">检索中…</p>`;
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
      if (!data.total) {
        box.innerHTML = `<p class="search-empty">未找到与「${esc(q)}」相关的条目。可尝试更宽泛的关键词，或前往文献库按类目浏览。</p>`;
        return;
      }
      const group = (title, items, render) =>
        items.length
          ? `<div class="sr-group"><h5>${title} · ${items.length}</h5>${items.map(render).join('')}</div>`
          : '';
      box.innerHTML =
        group('文献', data.documents, (d) => `
          <a class="sr-item" href="/doc/${d.id}">
            <span>${esc(d.title)}</span>
            <span class="sr-meta">${esc(d.code || '')} · ${esc(d.year || '')}</span>
          </a>`) +
        group('艺术家', data.artists, (a) => `
          <a class="sr-item" href="/artist/${a.id}">
            <span>${esc(a.name)}</span>
            <span class="sr-meta">${esc(a.region || '')} · ${esc(a.birth_year || '')}</span>
          </a>`) +
        group('展览', data.exhibitions, (x) => `
          <a class="sr-item" href="/exhibition/${x.id}">
            <span>${esc(x.title)}</span>
            <span class="sr-meta">${esc(x.year || '')} · ${esc(x.venue || '')}</span>
          </a>`) +
        group('年表', data.timeline, (t) => `
          <a class="sr-item" href="/timeline#y${t.year}">
            <span>${esc(t.title)}</span>
            <span class="sr-meta">${esc(t.year)}</span>
          </a>`);
    } catch (err) {
      box.innerHTML = `<p class="search-empty">检索失败，请稍后重试。</p>`;
    }
  }

  /* ---------------- 小工具 ---------------- */

  function toast(message) {
    let el = qs('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-on'), 2400);
  }

  function year(value) {
    if (value == null || value === '') return '';
    return String(value);
  }

  function lifespan(birth, death) {
    if (!birth && !death) return '';
    return `${birth || '?'}—${death || ''}`;
  }

  function fmtDate(value) {
    if (!value) return '';
    return String(value).replace(/-/g, '.');
  }

  function coverMarkup(item, { tag = true } = {}) {
    const src = item.cover || item.poster || item.portrait;
    const label = item.category || (item.venue ? '展览' : '');
    const img = src
      ? `<img src="${esc(src)}" alt="${esc(item.title || item.name || '')}" loading="lazy" />`
      : `<div class="cover-noimg serif">${esc((item.title || item.name || '文').slice(0, 1))}</div>`;
    return `${img}${tag && label ? `<span class="cover-tag">${esc(label)}</span>` : ''}`;
  }

  function demoChip(item) {
    return item && item.is_demo ? '<span class="demo-chip">示例</span>' : '';
  }

  function query(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function docHref(id) {
    return `/doc/${id}`;
  }

  return {
    qs,
    qsa,
    esc,
    api,
    bootstrap,
    chrome,
    toast,
    year,
    lifespan,
    fmtDate,
    coverMarkup,
    demoChip,
    query,
    docHref,
    openSearch
  };
})();
