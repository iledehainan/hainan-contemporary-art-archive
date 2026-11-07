/* 档案管理后台 */

(() => {
  const { esc, qs, qsa, api, toast } = App;
  const root = qs('#admin-root');
  const drawer = qs('#drawer');
  const mask = qs('#drawer-mask');

  const state = {
    user: null,
    tab: 'overview',
    settings: null,
    overview: null,
    categories: [],
    lists: { artists: [], exhibitions: [] },
    page: { documents: 1, exhibitions: 1 },
    q: { documents: '', artists: '', exhibitions: '', timeline: '', timelineLocal: '' },
    data: { documents: null, artists: null, exhibitions: null, timeline: null },
    editing: null,
    schemaKey: null,
    saving: false
  };

  /* ------------------------------------------------------------------ */
  /* 结构定义                                                            */
  /* ------------------------------------------------------------------ */

  const SCHEMAS = {
    documents: {
      label: '文献',
      listEndpoint: '/api/documents',
      writeEndpoint: '/api/admin/documents',
      fields: [
        { group: '基本著录' },
        { key: 'title', label: '题名 *', span: 2, required: true },
        { key: 'title_en', label: '英文题名', span: 2 },
        { key: 'category', label: '类目', type: 'select', options: () => state.categories },
        { key: 'code', label: '档案编号', placeholder: '留空自动生成' },
        { key: 'author', label: '作者 / 编者' },
        { key: 'publisher', label: '出版者' },
        { key: 'pub_date', label: '出版时间', placeholder: '1996-11' },
        { key: 'year', label: '年代', type: 'number' },
        { key: 'extent', label: '篇幅', placeholder: '48 页；彩版 16' },
        { key: 'language', label: '语言' },
        { group: '内容' },
        { key: 'summary', label: '摘要', type: 'textarea', span: 2, rows: 3 },
        { key: 'content', label: '正文 / 著录内容', type: 'textarea', span: 2, rows: 9, hint: '支持换行，前台按段落呈现' },
        { group: '来源与权利' },
        { key: 'source', label: '来源' },
        { key: 'rights', label: '权利说明' },
        { key: 'tags', label: '标签', span: 2, hint: '用逗号、顿号或分号分隔' },
        { group: '数字化文件' },
        { key: 'cover', label: '封面图', type: 'image' },
        { key: 'file_path', label: '原件文件（PDF）', type: 'file' }
      ],
      relations: [
        { key: 'artists', label: '关联艺术家', source: 'artists' },
        { key: 'exhibitions', label: '关联展览', source: 'exhibitions' }
      ]
    },
    artists: {
      label: '艺术家',
      listEndpoint: '/api/artists',
      writeEndpoint: '/api/admin/artists',
      fields: [
        { group: '基本信息' },
        { key: 'name', label: '姓名 *', required: true },
        { key: 'name_en', label: '英文名' },
        { key: 'birth_year', label: '出生年', type: 'number' },
        { key: 'death_year', label: '卒年', type: 'number' },
        { key: 'birthplace', label: '出生地' },
        { key: 'region', label: '现居 / 工作地区' },
        { key: 'medium', label: '媒介', span: 2 },
        { group: '简介' },
        { key: 'bio', label: '简介', type: 'textarea', span: 2, rows: 4 },
        { key: 'statement', label: '艺术家自述', type: 'textarea', span: 2, rows: 5 },
        { group: '其他' },
        { key: 'tags', label: '标签', span: 2, hint: '用逗号、顿号或分号分隔' },
        { key: 'portrait', label: '肖像', type: 'image' }
      ]
    },
    exhibitions: {
      label: '展览',
      listEndpoint: '/api/exhibitions',
      writeEndpoint: '/api/admin/exhibitions',
      fields: [
        { group: '基本信息' },
        { key: 'title', label: '展览名 *', span: 2, required: true },
        { key: 'title_en', label: '英文名', span: 2 },
        { key: 'venue', label: '场馆' },
        { key: 'city', label: '城市' },
        { key: 'start_date', label: '开始日期', type: 'date' },
        { key: 'end_date', label: '结束日期', type: 'date' },
        { key: 'year', label: '年份', type: 'number' },
        { key: 'curators', label: '策展人' },
        { key: 'organizer', label: '主办方' },
        { key: 'tags', label: '标签' },
        { group: '展览说明' },
        { key: 'intro', label: '说明', type: 'textarea', span: 2, rows: 5 },
        { group: '图像' },
        { key: 'poster', label: '海报', type: 'image' }
      ]
    },
    timeline: {
      label: '年表',
      listEndpoint: '/api/timeline',
      writeEndpoint: '/api/admin/timeline',
      fields: [
        { key: 'year', label: '年份 *', type: 'number', required: true },
        { key: 'month', label: '月份', type: 'number' },
        { key: 'title', label: '事件 *', span: 2, required: true },
        { key: 'category', label: '类别', placeholder: '展览 / 机构 / 文献 / 空间 / 创作' },
        { key: 'date_text', label: '日期原文', placeholder: '如「1996年11月8日」' },
        { key: 'description', label: '说明', type: 'textarea', span: 2, rows: 4 }
      ]
    }
  };

  const TABS = [
    { key: 'overview', label: '概况' },
    { key: 'documents', label: '文献' },
    { key: 'artists', label: '艺术家' },
    { key: 'exhibitions', label: '展览' },
    { key: 'timeline', label: '年表' },
    { key: 'settings', label: '设置' }
  ];

  /* ------------------------------------------------------------------ */
  /* 登录                                                                */
  /* ------------------------------------------------------------------ */

  function renderLogin(error) {
    root.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="login-form">
          <div class="seal-big">文</div>
          <h1>档案管理</h1>
          <p class="sub">海南当代艺术文献 · 文献编目与录入。请在下方登录。</p>
          <div class="form-error ${error ? 'is-on' : ''}" id="login-error">${esc(error || '')}</div>
          <div class="field">
            <label for="login-user">账号</label>
            <input id="login-user" name="username" autocomplete="username" required />
          </div>
          <div class="field">
            <label for="login-pass">密码</label>
            <input id="login-pass" name="password" type="password" autocomplete="current-password" required />
          </div>
          <button class="btn" type="submit" style="width:100%;margin-top:8px">登录</button>
          <p class="help" style="font-size:11px;color:var(--muted);margin-top:18px;line-height:1.8">
            首次启动时，管理员账号与密码会打印在启动窗口。如遗失，可删除 data/archive.db 重新初始化（会清空数据）。
          </p>
        </form>
      </div>`;

    qs('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      try {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: { username: form.get('username'), password: form.get('password') }
        });
        state.user = data.user;
        await bootApp();
      } catch (err) {
        renderLogin(err.message);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* 外壳                                                                */
  /* ------------------------------------------------------------------ */

  function renderShell() {
    root.innerHTML = `
      <div class="admin-shell">
        <aside class="admin-side">
          <a class="brand" href="/" style="text-decoration:none">
            <span class="brand-seal">文</span>
            <span class="brand-text">
              <span class="brand-name" style="font-size:15px">海南当代艺术文献</span>
              <span class="brand-en">Archive Admin</span>
            </span>
          </a>
          ${TABS.map(
            (t) => `<button class="admin-tab ${t.key === state.tab ? 'is-on' : ''}" data-tab="${t.key}" type="button">
              <span>${t.label}</span><span class="n" data-count="${t.key}"></span>
            </button>`
          ).join('')}
          <div class="admin-side-foot">
            <a class="admin-link" href="/" target="_blank" rel="noopener">查看网站 ↗</a>
            <button class="admin-link" type="button" id="logout" style="border:0;background:none;text-align:left;cursor:pointer">退出登录</button>
          </div>
        </aside>
        <main class="admin-main" id="admin-main"></main>
      </div>`;

    qsa('.admin-tab').forEach((btn) =>
      btn.addEventListener('click', () => {
        state.tab = btn.dataset.tab;
        qsa('.admin-tab').forEach((b) => b.classList.toggle('is-on', b === btn));
        renderTab();
      })
    );

    qs('#logout').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      state.user = null;
      renderLogin();
    });

    updateCounts();
    renderTab();
  }

  function updateCounts() {
    const s = state.overview && state.overview.stats;
    if (!s) return;
    const map = {
      documents: s.documents,
      artists: s.artists,
      exhibitions: s.exhibitions,
      timeline: s.timeline
    };
    qsa('[data-count]').forEach((el) => {
      const key = el.dataset.count;
      el.textContent = map[key] != null ? map[key] : '';
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tab 渲染                                                            */
  /* ------------------------------------------------------------------ */

  function renderTab() {
    if (state.tab === 'overview') return renderOverview();
    if (state.tab === 'settings') return renderSettings();

    const schema = SCHEMAS[state.tab];
    qs('#admin-main').innerHTML = `
      <div class="admin-top">
        <h1>${schema.label}</h1>
        <div class="who">
          <span>${esc(state.user.display_name || state.user.username)}</span>
          <button class="btn small" type="button" id="btn-new">＋ 新建${schema.label}</button>
        </div>
      </div>
      <div class="admin-toolbar">
        <input class="admin-search" id="admin-q" type="search" placeholder="检索${schema.label}…" value="${esc(state.q[state.tab] || '')}" />
        <span class="mono muted" id="admin-total" style="font-size:11.5px"></span>
      </div>
      <div id="admin-table"></div>
      <div class="pager" id="admin-pager" style="justify-content:flex-start"></div>`;

    qs('#btn-new').addEventListener('click', () => openDrawer(state.tab, null));

    let timer = null;
    qs('#admin-q').addEventListener('input', (e) => {
      clearTimeout(timer);
      const value = e.target.value.trim();
      timer = setTimeout(() => {
        state.q[state.tab] = value;
        state.page[state.tab] = 1;
        loadTable(state.tab);
      }, 280);
    });

    loadTable(state.tab);
  }

  async function loadTable(key) {
    const host = qs('#admin-table');
    if (!host) return;
    host.innerHTML = `<div class="loading-row skeleton" style="margin-top:2px"></div><div class="loading-row skeleton"></div>`;
    try {
      if (key === 'documents') {
        const p = new URLSearchParams();
        if (state.q.documents) p.set('q', state.q.documents);
        p.set('page', String(state.page.documents));
        p.set('page_size', '25');
        const data = await api(`/api/documents?${p.toString()}`);
        state.data.documents = data;
        renderDocumentTable(data);
        renderPager(data.total, data.page, data.page_size, 'documents');
      } else if (key === 'artists') {
        const data = await api(`/api/artists${state.q.artists ? `?q=${encodeURIComponent(state.q.artists)}` : ''}`);
        state.data.artists = data.items;
        renderArtistTable(data.items);
        qs('#admin-total').textContent = `共 ${data.items.length} 位`;
        qs('#admin-pager').innerHTML = '';
      } else if (key === 'exhibitions') {
        const p = new URLSearchParams();
        if (state.q.exhibitions) p.set('q', state.q.exhibitions);
        p.set('page', String(state.page.exhibitions));
        p.set('page_size', '25');
        const data = await api(`/api/exhibitions?${p.toString()}`);
        state.data.exhibitions = data;
        renderExhibitionTable(data);
        renderPager(data.total, data.page, data.page_size, 'exhibitions');
      } else if (key === 'timeline') {
        const data = await api(`/api/timeline${state.q.timeline ? `?q=${encodeURIComponent(state.q.timeline)}` : ''}`);
        state.data.timeline = data.items;
        renderTimelineTable(data.items);
        qs('#admin-total').textContent = `共 ${data.items.length} 条`;
        qs('#admin-pager').innerHTML = '';
      }
    } catch (err) {
      if (err.status === 401) return renderLogin('登录已过期，请重新登录');
      host.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    }
  }

  function renderPager(total, page, pageSize, key) {
    const pages = Math.ceil(total / pageSize);
    qs('#admin-total').textContent = `共 ${total} 条`;
    const host = qs('#admin-pager');
    if (pages <= 1) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = `
      <button type="button" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>←</button>
      <span class="mono muted" style="font-size:11.5px;padding:0 10px">${page} / ${pages}</span>
      <button type="button" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''}>→</button>`;
    qsa('#admin-pager [data-p]').forEach((btn) =>
      btn.addEventListener('click', () => {
        state.page[key] = Number(btn.dataset.p);
        loadTable(key);
      })
    );
  }

  function actionButtons(resource, id) {
    return `<div class="admin-actions">
      <button type="button" data-edit="${id}" data-res="${resource}">编辑</button>
      <button type="button" class="del" data-del="${id}" data-res="${resource}">删除</button>
    </div>`;
  }

  function bindRowActions() {
    qsa('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => openDrawer(btn.dataset.res, btn.dataset.edit))
    );
    qsa('[data-del]').forEach((btn) =>
      btn.addEventListener('click', () => removeRecord(btn.dataset.res, btn.dataset.del))
    );
  }

  function renderDocumentTable(data) {
    if (!data.items.length) {
      qs('#admin-table').innerHTML = `<p class="empty">暂无文献，点击右上角「新建文献」开始录入。</p>`;
      return;
    }
    qs('#admin-table').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>编号</th><th>题名</th><th>类目</th><th>作者</th><th>年代</th><th>状态</th><th style="text-align:right">操作</th></tr></thead>
        <tbody>
          ${data.items
            .map(
              (d) => `<tr>
                <td class="num">${esc(d.code || '')}</td>
                <td><div class="t-title">${esc(d.title)}</div><div class="t-sub">${esc((d.tags || []).join(' · '))}</div></td>
                <td>${esc(d.category)}</td>
                <td>${esc(d.author || '—')}</td>
                <td class="num">${esc(d.year || '—')}</td>
                <td class="num">${d.is_demo ? '示例' : '正式'}${d.cover ? ' · 有封面' : ''}</td>
                <td>${actionButtons('documents', d.id)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
    bindRowActions();
  }

  function renderArtistTable(items) {
    if (!items.length) {
      qs('#admin-table').innerHTML = `<p class="empty">暂无艺术家条目。</p>`;
      return;
    }
    qs('#admin-table').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>姓名</th><th>生卒</th><th>地区</th><th>媒介</th><th>文献</th><th style="text-align:right">操作</th></tr></thead>
        <tbody>
          ${items
            .map(
              (a) => `<tr>
                <td><div class="t-title">${esc(a.name)}</div><div class="t-sub">${esc(a.name_en || '')}</div></td>
                <td class="num">${esc(App.lifespan(a.birth_year, a.death_year) || '—')}</td>
                <td>${esc(a.region || '—')}</td>
                <td>${esc(a.medium || '—')}</td>
                <td class="num">${a.doc_count} 件</td>
                <td>${actionButtons('artists', a.id)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
    bindRowActions();
  }

  function renderExhibitionTable(data) {
    if (!data.items.length) {
      qs('#admin-table').innerHTML = `<p class="empty">暂无展览记录。</p>`;
      return;
    }
    qs('#admin-table').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>年份</th><th>展览</th><th>场馆</th><th>文献</th><th style="text-align:right">操作</th></tr></thead>
        <tbody>
          ${data.items
            .map(
              (e) => `<tr>
                <td class="num">${esc(e.year || '—')}</td>
                <td><div class="t-title">${esc(e.title)}</div><div class="t-sub">${esc(e.start_date || '')}${e.end_date ? ' — ' + esc(e.end_date) : ''}</div></td>
                <td>${esc([e.venue, e.city].filter(Boolean).join(' · ') || '—')}</td>
                <td class="num">${e.doc_count} 件</td>
                <td>${actionButtons('exhibitions', e.id)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
    bindRowActions();
  }

  function renderTimelineTable(items) {
    if (!items.length) {
      qs('#admin-table').innerHTML = `<p class="empty">暂无年表条目。</p>`;
      return;
    }
    qs('#admin-table').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>年份</th><th>月份</th><th>事件</th><th>类别</th><th style="text-align:right">操作</th></tr></thead>
        <tbody>
          ${items
            .map(
              (t) => `<tr>
                <td class="num">${esc(t.year)}</td>
                <td class="num">${t.month ? String(t.month).padStart(2, '0') : '—'}</td>
                <td><div class="t-title">${esc(t.title)}</div><div class="t-sub">${esc((t.description || '').slice(0, 40))}</div></td>
                <td>${esc(t.category || '—')}</td>
                <td>${actionButtons('timeline', t.id)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
    bindRowActions();
  }

  /* ------------------------------------------------------------------ */
  /* 概况                                                                */
  /* ------------------------------------------------------------------ */

  async function renderOverview() {
    qs('#admin-main').innerHTML = `
      <div class="admin-top">
        <h1>概况</h1>
        <div class="who"><span>${esc(state.user.display_name || state.user.username)}</span></div>
      </div>
      <div class="stat-cards">
        <div class="stat-card"><span>文献条目</span><b>${state.overview ? state.overview.stats.documents : '—'}</b></div>
        <div class="stat-card"><span>艺术家</span><b>${state.overview ? state.overview.stats.artists : '—'}</b></div>
        <div class="stat-card"><span>展览记录</span><b>${state.overview ? state.overview.stats.exhibitions : '—'}</b></div>
        <div class="stat-card"><span>年表事件</span><b>${state.overview ? state.overview.stats.timeline : '—'}</b></div>
      </div>
      <div class="admin-note">
        <b>录入流程</b>：先在「艺术家」「展览」中建立条目，再在「文献」中著录并勾选关联对象，前台即会自动建立交叉索引。
        ${state.overview && state.overview.demo ? `当前库中有 <b>${state.overview.demo}</b> 条示例文献，正式使用前可在「设置」中一键清空。` : ''}
      </div>
      <h3 style="font-family:var(--serif);font-size:17px;margin:26px 0 10px;font-weight:600">最近更新</h3>
      <table class="admin-table">
        <thead><tr><th>编号</th><th>题名</th><th>类目</th><th>更新时间</th></tr></thead>
        <tbody>
          ${(state.overview ? state.overview.recent : [])
            .map(
              (d) => `<tr><td class="num">${esc(d.code || '')}</td><td class="t-title">${esc(d.title)}</td><td>${esc(d.category)}</td><td class="num">${esc((d.updated_at || '').slice(0, 16).replace('T', ' '))}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  }

  /* ------------------------------------------------------------------ */
  /* 设置                                                                */
  /* ------------------------------------------------------------------ */

  function renderSettings() {
    const s = state.settings || {};
    qs('#admin-main').innerHTML = `
      <div class="admin-top">
        <h1>设置</h1>
        <div class="who"><span>${esc(state.user.display_name || state.user.username)}</span></div>
      </div>

      <form id="settings-form">
        <div class="form-section">站点信息</div>
        <div class="settings-grid">
          <div class="field"><label>站点名称</label><input name="site_name" value="${esc(s.site_name || '')}" /></div>
          <div class="field"><label>英文名称</label><input name="site_name_en" value="${esc(s.site_name_en || '')}" /></div>
          <div class="field span-2"><label>副标题</label><input name="site_subtitle" value="${esc(s.site_subtitle || '')}" /></div>
          <div class="field span-2"><label>简介（首页导语）</label><textarea name="intro" rows="3">${esc(s.intro || '')}</textarea></div>
          <div class="field span-2"><label>访问与使用说明</label><textarea name="access_note" rows="3">${esc(s.access_note || '')}</textarea></div>
          <div class="field"><label>联系邮箱</label><input name="contact_email" value="${esc(s.contact_email || '')}" /></div>
          <div class="field"><label>机构地址</label><input name="address" value="${esc(s.address || '')}" /></div>
        </div>
        <div style="margin-top:18px"><button class="btn" type="submit">保存站点信息</button></div>
      </form>

      <div class="form-section" style="margin-top:38px">账号安全</div>
      <form id="password-form" class="settings-grid" style="max-width:640px">
        <div class="field"><label>当前密码</label><input type="password" name="current" autocomplete="current-password" required /></div>
        <div class="field"><label>新密码（至少 6 位）</label><input type="password" name="next" autocomplete="new-password" required /></div>
        <div class="field span-2"><button class="btn ghost" type="submit">修改密码</button></div>
      </form>

      <div class="form-section" style="margin-top:38px">数据与备份</div>
      <div class="admin-note">
        本地开发使用 <span class="mono">data/archive.db</span> 与 <span class="mono">uploads/</span>；
        部署环境使用 Supabase PostgreSQL 与私有 Storage Bucket。部署、备份与迁移说明见仓库中的 <span class="mono">DEPLOYMENT.md</span>。
      </div>
      <div class="admin-note" style="border-left-color:#8a7a5c">
        示例数据用于演示排版与字段，正式发布前建议清空并录入真实档案。
        <div style="margin-top:10px">
          <button class="btn danger small" type="button" id="clear-demo">清空全部示例数据</button>
        </div>
      </div>`;

    qs('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      const payload = Object.fromEntries(form.entries());
      try {
        const data = await api('/api/admin/settings', { method: 'PUT', body: payload });
        state.settings = data.settings;
        toast('站点信息已保存');
      } catch (err) {
        toast(err.message);
      }
    });

    qs('#password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      try {
        await api('/api/admin/password', {
          method: 'POST',
          body: { current: form.get('current'), next: form.get('next') }
        });
        e.target.reset();
        toast('密码已修改');
      } catch (err) {
        toast(err.message);
      }
    });

    qs('#clear-demo').addEventListener('click', async () => {
      if (!confirm('将删除所有标记为「示例」的文献、艺术家、展览与年表条目，且不可恢复。确定继续？')) return;
      try {
        await api('/api/admin/demo', { method: 'DELETE' });
        toast('示例数据已清空');
        await refreshAll();
      } catch (err) {
        toast(err.message);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* 抽屉表单                                                            */
  /* ------------------------------------------------------------------ */

  function fieldHtml(field, value) {
    const v = value == null ? '' : value;
    const label = `<label>${field.label || ''}${field.hint ? `<span style="color:var(--muted);font-weight:400">　${esc(field.hint)}</span>` : ''}</label>`;
    let input = '';
    if (field.type === 'textarea') {
      input = `<textarea name="${field.key}" rows="${field.rows || 4}">${esc(v)}</textarea>`;
    } else if (field.type === 'select') {
      const options = typeof field.options === 'function' ? field.options() : field.options || [];
      input = `<select name="${field.key}">${options
        .map((opt) => {
          const val = typeof opt === 'string' ? opt : opt.value;
          const text = typeof opt === 'string' ? opt : opt.label;
          return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(text)}</option>`;
        })
        .join('')}</select>`;
    } else if (field.type === 'image' || field.type === 'file') {
      const accept = field.type === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : 'application/pdf';
      const preview = v
        ? field.type === 'image'
          ? `<div class="upload-preview"><img src="${esc(v)}" alt="预览" /></div>`
          : `<div class="upload-preview is-file">${esc(v)}</div>`
        : '';
      input = `
        <div class="upload-row">
          <input type="hidden" name="${field.key}" value="${esc(v)}" data-upload-value />
          <input type="file" accept="${accept}" data-upload-input />
          <button class="btn ghost small" type="button" data-upload-clear ${v ? '' : 'hidden'}>移除</button>
        </div>
        <p class="upload-help">支持 ${field.type === 'image' ? 'JPG、PNG、WebP、GIF' : 'PDF'}，单个文件不超过 24 MB。</p>
        <div data-upload-preview>${preview}</div>`;
    } else {
      input = `<input type="${field.type || 'text'}" name="${field.key}" value="${esc(v)}" ${
        field.placeholder ? `placeholder="${esc(field.placeholder)}"` : ''
      } ${field.step ? `step="${field.step}"` : ''} />`;
    }
    return `<div class="field ${field.span === 2 ? 'span-2' : ''}">${label}${input}</div>`;
  }

  function drawerFormHtml(schema, record) {
    const groups = [];
    let current = [];
    const flush = () => {
      if (current.length) {
        groups.push(`<div class="form-grid">${current.join('')}</div>`);
        current = [];
      }
    };
    schema.fields.forEach((field) => {
      if (field.group) {
        flush();
        groups.push(`<div class="form-section">${esc(field.group)}</div>`);
        return;
      }
      current.push(fieldHtml(field, record[field.key]));
    });
    flush();

    let relations = '';
    if (schema.relations) {
      relations = schema.relations
        .map((rel) => {
          const options = state.lists[rel.source] || [];
          const selected = new Set(
            (rel.key === 'artists' ? record.artists || [] : record.exhibitions || []).map((x) => String(x.id))
          );
          return `<div class="field span-2" style="margin-top:14px">
            <label>${rel.label}</label>
            ${
              options.length
                ? `<div class="check-grid">${options
                    .map(
                      (o) => `<label><input type="checkbox" name="${rel.key}" value="${o.id}" ${
                        selected.has(String(o.id)) ? 'checked' : ''
                      } /> ${esc(o.label)}</label>`
                    )
                    .join('')}</div>`
                : `<p class="help">尚未建立条目，可先保存本页，再前往相应栏目补充。</p>`
            }
          </div>`;
        })
        .join('');
    }

    return `<form id="drawer-form">${groups.join('')}${relations}</form>`;
  }

  async function openDrawer(key, id) {
    const schema = SCHEMAS[key];
    state.schemaKey = key;
    state.editing = id || null;

    let record = {};
    if (id) {
      try {
        if (key === 'documents') record = await api(`/api/documents/${id}`);
        else if (key === 'artists') record = await api(`/api/artists/${id}`);
        else if (key === 'exhibitions') record = await api(`/api/exhibitions/${id}`);
        else if (key === 'timeline') record = (state.data.timeline || []).find((t) => String(t.id) === String(id)) || {};
      } catch (err) {
        toast(err.message);
        return;
      }
    }

    qs('#drawer-title').textContent = `${id ? '编辑' : '新建'}${schema.label}`;
    qs('#drawer-body').innerHTML = drawerFormHtml(schema, record);
    qs('#drawer-hint').textContent = id ? '修改后点击保存' : '带 * 为必填项';
    drawer.classList.add('is-open');
    mask.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    qs('#drawer-body').scrollTop = 0;

    bindUploads();
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    mask.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    state.editing = null;
    state.schemaKey = null;
  }

  function bindUploads() {
    qsa('[data-upload-input]').forEach((input) => {
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 24 * 1024 * 1024) {
          toast('单个文件不能超过 24 MiB');
          input.value = '';
          return;
        }
        const holder = input.closest('.field');
        const hidden = holder.querySelector('[data-upload-value]');
        const clearButton = holder.querySelector('[data-upload-clear]');
        const previewHost = holder.querySelector('[data-upload-preview]');
        const previousValue = hidden.value;
        const isImage = input.accept.startsWith('image/');
        if (isImage && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
          toast('请选择 JPG、PNG、WebP 或 GIF 图片');
          input.value = '';
          return;
        }
        if (!isImage && file.type !== 'application/pdf') {
          toast('请选择 PDF 文件');
          input.value = '';
          return;
        }
        holder.dataset.uploading = 'true';
        input.disabled = true;
        clearButton.disabled = true;
        previewHost.innerHTML = `<p class="help">上传中…</p>`;
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsDataURL(file);
          });
          const res = await api('/api/upload', {
            method: 'POST',
            body: { filename: file.name, data: dataUrl }
          });
          hidden.value = res.url;
          previewHost.innerHTML = /\.pdf$/i.test(res.url)
            ? `<div class="upload-preview is-file">${esc(res.url)}</div>`
            : `<div class="upload-preview"><img src="${esc(res.url)}" alt="预览" /></div>`;
          clearButton.hidden = false;
          toast('文件已上传');
        } catch (err) {
          input.value = '';
          previewHost.innerHTML = previousValue
            ? isImage
              ? `<div class="upload-preview"><img src="${esc(previousValue)}" alt="预览" /></div>`
              : `<div class="upload-preview is-file">${esc(previousValue)}</div>`
            : `<p class="upload-error">${esc(err.message)}</p>`;
          toast(err.message);
        } finally {
          delete holder.dataset.uploading;
          input.disabled = false;
          clearButton.disabled = false;
        }
      });
    });

    qsa('[data-upload-clear]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const holder = btn.closest('.field');
        holder.querySelector('[data-upload-value]').value = '';
        holder.querySelector('[data-upload-preview]').innerHTML = '';
        holder.querySelector('[data-upload-input]').value = '';
        btn.hidden = true;
      });
    });
  }

  async function saveDrawer() {
    if (state.saving) return;
    const key = state.schemaKey;
    const schema = SCHEMAS[key];
    const form = qs('#drawer-form');
    if (!form) return;
    if (form.querySelector('[data-uploading="true"]')) {
      toast('请等待文件上传完成后再保存');
      return;
    }

    const payload = {};
    schema.fields.forEach((field) => {
      if (field.group) return;
      const input = form.querySelector(`[name="${field.key}"]`);
      if (!input) return;
      let value = input.value;
      if (field.type === 'number') value = value === '' ? null : Number(value);
      payload[field.key] = value;
    });
    if (schema.relations) {
      schema.relations.forEach((rel) => {
        payload[rel.key] = Array.from(form.querySelectorAll(`input[name="${rel.key}"]:checked`)).map((i) =>
          Number(i.value)
        );
      });
    }

    for (const field of schema.fields) {
      if (field.required && !String(payload[field.key] == null ? '' : payload[field.key]).trim()) {
        toast(`请填写「${field.label.replace(' *', '')}」`);
        return;
      }
    }

    state.saving = true;
    const btn = qs('#drawer-save');
    btn.disabled = true;
    btn.textContent = '保存中…';
    try {
      const url = state.editing ? `${schema.writeEndpoint}/${state.editing}` : schema.writeEndpoint;
      await api(url, { method: state.editing ? 'PUT' : 'POST', body: payload });
      toast('已保存');
      closeDrawer();
      await loadLists();
      loadTable(key);
      await refreshOverview();
    } catch (err) {
      toast(err.message);
    } finally {
      state.saving = false;
      btn.disabled = false;
      btn.textContent = '保存';
    }
  }

  async function removeRecord(key, id) {
    const schema = SCHEMAS[key];
    if (!confirm('删除后不可恢复，确定删除该条目？')) return;
    try {
      await api(`${schema.writeEndpoint}/${id}`, { method: 'DELETE' });
      toast('已删除');
      await loadLists();
      loadTable(key);
      await refreshOverview();
    } catch (err) {
      toast(err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 数据加载                                                            */
  /* ------------------------------------------------------------------ */

  async function refreshOverview() {
    state.overview = await api('/api/admin/overview').catch(() => state.overview);
    updateCounts();
    if (state.tab === 'overview') renderOverview();
  }

  async function loadLists() {
    const [artists, exhibitions] = await Promise.all([
      api('/api/artists').catch(() => ({ items: [] })),
      api('/api/exhibitions?page_size=100').catch(() => ({ items: [] }))
    ]);
    state.lists.artists = artists.items.map((a) => ({ id: a.id, label: `${a.name}${a.birth_year ? `（${a.birth_year}）` : ''}` }));
    state.lists.exhibitions = exhibitions.items.map((e) => ({ id: e.id, label: `${e.title}${e.year ? `（${e.year}）` : ''}` }));
  }

  async function bootApp() {
    const [boot, overview] = await Promise.all([
      api('/api/bootstrap'),
      api('/api/admin/overview')
    ]);
    state.categories = boot.categories;
    state.settings = boot.settings;
    state.overview = overview;
    await loadLists();

    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && TABS.some((t) => t.key === tabParam)) state.tab = tabParam;

    renderShell();

    const editParam = params.get('edit');
    if (editParam && SCHEMAS[state.tab]) openDrawer(state.tab, editParam);
  }

  /* ------------------------------------------------------------------ */
  /* 启动                                                                */
  /* ------------------------------------------------------------------ */

  qs('#drawer-close').addEventListener('click', closeDrawer);
  qs('#drawer-cancel').addEventListener('click', closeDrawer);
  qs('#drawer-save').addEventListener('click', saveDrawer);
  mask.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });

  (async () => {
    try {
      const me = await api('/api/auth/me');
      if (!me.user) return renderLogin();
      state.user = me.user;
      await bootApp();
    } catch (err) {
      renderLogin('无法连接服务器，请确认已启动运行。');
    }
  })();
})();
