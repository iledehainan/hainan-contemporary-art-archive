'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { validateContentExport } = require('./import-public-backup');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'data', 'content-export.json');
const defaultOutput = path.join(root, 'dist');

function escapeEmbeddedJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildHtml(exported) {
  const serialized = escapeEmbeddedJson(exported);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f5f2eb">
  <meta name="description" content="海南当代艺术文献的公开数字档案：艺术家、展览、文献与时间线。">
  <title>海南当代艺术文献档案</title>
  <style>
    :root{color-scheme:light;--paper:#f5f2eb;--ink:#252722;--muted:#77796f;--line:#d9d5ca;--green:#365d4d;--orange:#c46b43;--card:#fffdf8}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.7 "Noto Serif SC","Songti SC",serif}
    a{color:inherit;text-decoration:none}a:hover{color:var(--green)}button,input,select{font:inherit}
    .shell{max-width:1120px;margin:auto;padding:0 28px}.masthead{border-bottom:1px solid var(--line);padding:30px 0 22px}
    .brand{display:inline-block;font-size:clamp(24px,4vw,36px);font-weight:600;letter-spacing:.08em}
    .subbrand{color:var(--muted);font:12px/1.5 sans-serif;letter-spacing:.18em;margin-top:3px}
    nav{display:flex;gap:22px;flex-wrap:wrap;margin-top:22px;font:14px sans-serif}
    nav a{padding:5px 0;border-bottom:2px solid transparent}nav a.active{border-color:var(--orange);color:var(--green)}
    main{min-height:70vh;padding:38px 0 68px}.hero{padding:30px 0 38px;max-width:760px}
    .eyebrow{color:var(--orange);font:12px sans-serif;letter-spacing:.16em;text-transform:uppercase}
    h1{font-size:clamp(28px,5vw,46px);line-height:1.28;margin:10px 0 16px;font-weight:500}
    h2{font-size:25px;font-weight:500;margin:0 0 18px}h3{font-size:18px;line-height:1.5;margin:5px 0}
    p{margin:8px 0}.muted{color:var(--muted)}.lead{font-size:18px;color:#55584f}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0 40px}
    .stat,.card,.panel{background:var(--card);border:1px solid var(--line);border-radius:3px}
    .stat{padding:16px}.stat strong{display:block;font:28px Georgia,serif;color:var(--green)}.stat span{font-size:13px;color:var(--muted)}
    .section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:30px 0 14px}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .card{padding:18px;min-width:0}.card:hover{border-color:#9caa9c}.card-title{display:block;font-size:17px;font-weight:600}
    .meta{font:12px/1.7 sans-serif;color:var(--muted);margin:7px 0}.excerpt{font-size:14px;color:#55584f;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
    .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}
    input[type=search],select{background:var(--card);border:1px solid var(--line);border-radius:3px;padding:10px 12px;color:var(--ink)}
    input[type=search]{flex:1;min-width:220px}.count{font:13px sans-serif;color:var(--muted);align-self:center}
    .tag{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:2px 9px;margin:3px 4px 3px 0;font:12px sans-serif;color:var(--green)}
    .detail{max-width:800px}.detail h1{font-size:34px}.detail-body{white-space:pre-wrap;line-height:1.9;margin-top:22px}
    .detail-section{border-top:1px solid var(--line);padding:20px 0;margin-top:18px}.detail-section h2{font-size:18px}
    .back{display:inline-block;margin:0 0 20px;color:var(--green);font:13px sans-serif}
    .timeline{border-left:1px solid var(--line);margin:18px 0 0 8px;padding-left:22px}.event{position:relative;padding:0 0 24px}
    .event:before{content:"";position:absolute;left:-27px;top:10px;width:9px;height:9px;background:var(--orange);border-radius:50%}
    footer{border-top:1px solid var(--line);padding:20px 0 35px;color:var(--muted);font:12px/1.7 sans-serif}
    .notice{border-left:3px solid var(--orange);padding:10px 14px;background:#efe9dd;font-size:14px}
    @media(max-width:720px){.shell{padding:0 18px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.stats{grid-template-columns:repeat(2,1fr)}nav{gap:15px}}
    @media(max-width:480px){.grid{grid-template-columns:1fr}.section-head{align-items:start;flex-direction:column}.detail h1{font-size:28px}}
  </style>
</head>
<body>
  <header class="masthead"><div class="shell">
    <a class="brand" href="#/">海南当代艺术文献档案</a>
    <div class="subbrand">HAINAN CONTEMPORARY ART ARCHIVE</div>
    <nav id="nav" aria-label="主导航">
      <a href="#/">首页</a><a href="#/documents">文献</a><a href="#/artists">艺术家</a>
      <a href="#/exhibitions">展览</a><a href="#/timeline">时间线</a><a href="#/about">关于</a>
    </nav>
  </div></header>
  <main class="shell" id="app" aria-live="polite"></main>
  <footer><div class="shell">海南当代艺术文献档案 · 公开只读版本 · 数据导出于 ${escapeHtmlText(exported.exported_at)}<br>此 GitHub Pages 版本不提供账户登录、内容编辑或文件上传功能。</div></footer>
  <script id="archive-data" type="application/json">${serialized}</script>
  <script>
    (() => {
      const source = JSON.parse(document.getElementById('archive-data').textContent);
      const tables = source.tables;
      const byId = (rows) => new Map(rows.map((row) => [String(row.id), row]));
      const artists = byId(tables.artists);
      const exhibitions = byId(tables.exhibitions);
      const documents = byId(tables.documents);
      const links = (rows, key, foreign) => {
        const out = new Map();
        for (const row of rows) {
          const id = String(row[key]);
          if (!out.has(id)) out.set(id, []);
          out.get(id).push(String(row[foreign]));
        }
        return out;
      };
      const docArtists = links(tables.doc_artists, 'document_id', 'artist_id');
      const docExhibitions = links(tables.doc_exhibitions, 'document_id', 'exhibition_id');
      const app = document.getElementById('app');
      const nav = document.getElementById('nav');
      const escape = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[char]);
      const tags = (value) => String(value || '').split(',').filter(Boolean)
        .map((tag) => '<span class="tag">' + escape(tag) + '</span>').join('');
      const card = (title, href, meta, excerpt) =>
        '<a class="card" href="' + href + '"><span class="card-title">' + escape(title) +
        '</span><div class="meta">' + escape(meta || '') + '</div><div class="excerpt">' +
        escape(excerpt || '') + '</div></a>';
      const docCard = (row) => card(row.title, '#/documents/' + row.id,
        [row.code, row.category, row.year].filter(Boolean).join(' · '), row.summary);
      const artistCard = (row) => card(row.name, '#/artists/' + row.id,
        [row.name_en, row.region, row.medium].filter(Boolean).join(' · '), row.bio);
      const exhibitionCard = (row) => card(row.title, '#/exhibitions/' + row.id,
        [row.year, row.venue, row.city].filter(Boolean).join(' · '), row.intro);
      const heading = (eyebrow, title, lead) => '<div class="hero"><div class="eyebrow">' +
        escape(eyebrow) + '</div><h1>' + escape(title) + '</h1><p class="lead">' + escape(lead) + '</p></div>';
      const list = (title, rows, render, searchable) => {
        const q = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '';
        const filter = q.trim().toLocaleLowerCase();
        const visible = rows.filter((row) => !filter || searchable(row).toLocaleLowerCase().includes(filter));
        app.innerHTML = heading('PUBLIC COLLECTION', title, '检索与浏览公开编目的档案记录。') +
          '<div class="toolbar"><input id="search" type="search" value="' + escape(q) +
          '" placeholder="搜索标题、人物、关键词…" aria-label="搜索"><span class="count">' +
          visible.length + ' / ' + rows.length + ' 条</span></div><div class="grid">' +
          (visible.length ? visible.map(render).join('') : '<p class="muted">没有找到匹配记录。</p>') + '</div>';
        const input = document.getElementById('search');
        input.addEventListener('input', () => {
          const hashPath = location.hash.split('?')[0];
          history.replaceState(null, '', hashPath + (input.value ? '?q=' + encodeURIComponent(input.value) : ''));
          list(title, rows, render, searchable);
          const next = document.getElementById('search');
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        });
      };
      const searchable = (row) => Object.values(row).filter((value) => typeof value === 'string').join(' ');
      const relationCards = (ids, map, render) => (ids || []).map((id) => map.get(String(id)))
        .filter(Boolean).map(render).join('');
      const details = (kind, row) => {
        if (!row) {
          app.innerHTML = '<a class="back" href="#/">← 返回首页</a><h1>未找到该条目</h1>';
          return;
        }
        const typeNames = { documents: '文献', artists: '艺术家', exhibitions: '展览' };
        let meta = [];
        let extra = '';
        let tagsHtml = tags(row.tags);
        if (kind === 'documents') {
          meta = [row.code, row.category, row.author, row.publisher, row.pub_date || row.year, row.language].filter(Boolean);
          extra = '<div class="detail-section"><h2>关联艺术家</h2><div class="grid">' +
            relationCards(docArtists.get(String(row.id)), artists, artistCard) +
            '</div></div><div class="detail-section"><h2>关联展览</h2><div class="grid">' +
            relationCards(docExhibitions.get(String(row.id)), exhibitions, exhibitionCard) + '</div></div>';
        } else if (kind === 'artists') {
          meta = [row.name_en, row.birth_year && (row.birth_year + (row.death_year ? '–' + row.death_year : '–')), row.region, row.medium].filter(Boolean);
          const relatedDocs = tables.doc_artists.filter((link) => String(link.artist_id) === String(row.id))
            .map((link) => documents.get(String(link.document_id))).filter(Boolean);
          extra = '<div class="detail-section"><h2>相关文献</h2><div class="grid">' + relatedDocs.map(docCard).join('') + '</div></div>';
        } else {
          meta = [row.title_en, row.year, row.venue, row.city, row.start_date, row.end_date].filter(Boolean);
          const relatedDocs = tables.doc_exhibitions.filter((link) => String(link.exhibition_id) === String(row.id))
            .map((link) => documents.get(String(link.document_id))).filter(Boolean);
          extra = '<div class="detail-section"><h2>相关文献</h2><div class="grid">' + relatedDocs.map(docCard).join('') + '</div></div>';
        }
        app.innerHTML = '<div class="detail"><a class="back" href="#/' + kind + '">← 返回' +
          typeNames[kind] + '</a><div class="eyebrow">' + escape(typeNames[kind]) + '</div><h1>' +
          escape(row.title || row.name) + '</h1><div class="meta">' + meta.map(escape).join(' · ') +
          '</div>' + (tagsHtml ? '<p>' + tagsHtml + '</p>' : '') +
          (row.summary ? '<div class="detail-section"><h2>摘要</h2><p>' + escape(row.summary) + '</p></div>' : '') +
          (row.bio ? '<div class="detail-section"><h2>简介</h2><div class="detail-body">' + escape(row.bio) + '</div></div>' : '') +
          (row.statement ? '<div class="detail-section"><h2>创作陈述</h2><p>' + escape(row.statement) + '</p></div>' : '') +
          (row.intro ? '<div class="detail-section"><h2>展览介绍</h2><div class="detail-body">' + escape(row.intro) + '</div></div>' : '') +
          (row.content ? '<div class="detail-section"><h2>文献内容</h2><div class="detail-body">' + escape(row.content) + '</div></div>' : '') +
          ((row.source || row.rights) ? '<div class="detail-section"><h2>来源与版权</h2><p>' +
            escape(row.source || '') + '</p><p class="muted">' + escape(row.rights || '') + '</p></div>' : '') +
          extra + '</div>';
      };
      const render = () => {
        const route = location.hash.slice(1) || '/';
        const [pathname, query] = route.split('?');
        const match = pathname.match(/^\\/(documents|artists|exhibitions)\\/([^/]+)$/);
        nav.querySelectorAll('a').forEach((link) => link.classList.toggle('active',
          (pathname === '/' && link.getAttribute('href') === '#/') ||
          link.getAttribute('href') === '#/' + (pathname.split('/')[1] || '')));
        if (match) {
          const kind = match[1];
          details(kind, ({ documents, artists, exhibitions })[kind].get(match[2]));
          return;
        }
        if (pathname === '/documents') {
          list('文献档案', [...tables.documents].sort((a, b) => (b.year || 0) - (a.year || 0)), docCard, searchable);
        } else if (pathname === '/artists') {
          list('艺术家', tables.artists, artistCard, searchable);
        } else if (pathname === '/exhibitions') {
          list('展览', [...tables.exhibitions].sort((a, b) => (b.year || 0) - (a.year || 0)), exhibitionCard, searchable);
        } else if (pathname === '/timeline') {
          const events = [...tables.timeline].sort((a, b) =>
            a.year - b.year || (a.month || 0) - (b.month || 0) || a.id - b.id);
          app.innerHTML = heading('CHRONOLOGY', '时间线', '海南当代艺术相关事件与历史节点。') +
            '<div class="timeline">' + events.map((row) =>
              '<article class="event"><div class="eyebrow">' + escape(row.date_text || row.year) +
              '</div><h3>' + escape(row.title) + '</h3><div class="meta">' + escape(row.category || '') +
              '</div><p>' + escape(row.description || '') + '</p></article>').join('') + '</div>';
        } else if (pathname === '/about') {
          app.innerHTML = heading('ABOUT THE ARCHIVE', '关于本库', '海南当代艺术文献的公开数字档案。') +
            '<div class="panel" style="padding:22px"><p>本库收录海南当代艺术相关的公开文献、艺术家、展览与时间线资料，供检索、研究与引用。</p>' +
            '<p>条目来源与权利信息以各记录标注为准。文献著作权归原作者及发布方所有。</p>' +
            '<p class="muted">此站点由公开数据导出构建，为只读静态版本；不提供登录、编辑或上传服务。</p></div>';
        } else {
          const recent = [...tables.documents].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 6);
          app.innerHTML = heading('HAINAN CONTEMPORARY ART', '海南当代艺术文献档案',
            '记录、整理与连接海南当代艺术的文献、人物、展览与历史现场。') +
            '<div class="stats"><div class="stat"><strong>' + tables.documents.length + '</strong><span>文献</span></div>' +
            '<div class="stat"><strong>' + tables.artists.length + '</strong><span>艺术家</span></div>' +
            '<div class="stat"><strong>' + tables.exhibitions.length + '</strong><span>展览</span></div>' +
            '<div class="stat"><strong>' + tables.timeline.length + '</strong><span>时间线</span></div></div>' +
            '<div class="notice">公开只读档案 · 当前版本不包含账户与在线编辑功能。</div>' +
            '<div class="section-head"><h2>近期文献</h2><a href="#/documents">浏览全部 →</a></div>' +
            '<div class="grid">' + recent.map(docCard).join('') + '</div>';
        }
        if (query && document.getElementById('search')) {
          document.getElementById('search').value = new URLSearchParams(query).get('q') || '';
        }
      };
      window.addEventListener('hashchange', render);
      render();
    })();
  </script>
</body>
</html>
`;
}

function escapeHtmlText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

async function build(outputDirectory = defaultOutput) {
  const exported = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
  validateContentExport(exported);
  const target = path.resolve(outputDirectory);
  await fs.mkdir(target, { recursive: true });
  const outputPath = path.join(target, 'index.html');
  await fs.writeFile(outputPath, buildHtml(exported), 'utf8');
  return outputPath;
}

if (require.main === module) {
  build(process.argv[2] || defaultOutput)
    .then((outputPath) => {
      console.log(`GitHub Pages site built: ${outputPath}`);
    })
    .catch((error) => {
      console.error(`GitHub Pages build stopped: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { build, buildHtml };
