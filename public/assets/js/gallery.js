(() => {
  App.chrome('gallery');
  const { esc, qs, api } = App;
  const host = qs('#image-gallery');
  const count = qs('#gallery-count');
  const filters = Array.from(document.querySelectorAll('[data-filter]'));
  let items = [];
  let activeFilter = 'all';

  const destinations = {
    document: (id) => `/doc/${id}`,
    artist: (id) => `/artist/${id}`,
    exhibition: (id) => `/exhibition/${id}`
  };
  const typeNames = {
    document: '文献',
    artist: '艺术家',
    exhibition: '展览'
  };

  function render() {
    const visible = activeFilter === 'all' ? items : items.filter((item) => item.type === activeFilter);
    count.textContent = `${visible.length} 幅图像`;
    if (!visible.length) {
      host.innerHTML = `<div class="empty gallery-empty"><div class="empty-mark">无 图 像</div><p>此类档案尚未添加图像，可在<a href="/admin">管理后台</a>编辑条目并上传。</p></div>`;
      return;
    }

    host.innerHTML = visible.map((item, index) => `
      <a class="gallery-card" href="${destinations[item.type](item.id)}">
        <span class="gallery-image"><img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" /></span>
        <span class="gallery-caption">
          <span class="gallery-caption-top">
            <span class="gallery-type">${esc(typeNames[item.type] || '档案')}</span>
            <span class="mono gallery-year">${esc(item.year || '—')}</span>
          </span>
          <strong>${esc(item.title)}</strong>
          <span class="gallery-detail">${esc(item.category || '')}</span>
          <span class="gallery-number mono">${String(index + 1).padStart(3, '0')}</span>
        </span>
      </a>`).join('');
  }

  filters.forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      filters.forEach((item) => {
        const selected = item === button;
        item.classList.toggle('is-active', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      render();
    });
  });

  api('/api/gallery')
    .then((data) => {
      items = data.items || [];
      render();
    })
    .catch((error) => {
      count.textContent = '';
      host.innerHTML = `<div class="empty"><div class="empty-mark">连 接 失 败</div><p>${esc(error.message)}</p></div>`;
    });
})();
