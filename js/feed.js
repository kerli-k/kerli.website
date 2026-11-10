const API = window.KERLI_API;

function renderTagFilters(tags, active) {
  const nav = document.getElementById('tag-filters');
  const all = `<a class="tag ${active === 'all' ? 'is-active' : ''}" href="blog.html" data-tag="all">all</a>`;
  const rest = (tags || []).map(t =>
    `<a class="tag ${active === t ? 'is-active' : ''}" href="blog.html?tag=${encodeURIComponent(t)}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</a>`
  ).join('');
  nav.innerHTML = `<span class="filter-label">tag:</span>${all}${rest}`;
}

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function loadFeed(page = 1, tag = 'all') {
  const feed = document.getElementById('feed');
  const pager = document.getElementById('pager');
  feed.innerHTML = '<p class="prompt">fetching records...</p>';
  pager.innerHTML = '';

  try {
    const url = `${API}/posts?type=blog&page=${page}&tag=${encodeURIComponent(tag)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    renderTagFilters(data.tags, tag);

    feed.innerHTML = data.items.map(p => `
      <article class="post">
        <div class="post-top">
          <time class="post-date">${escapeHtml(p.date ? p.date.slice(0, 10) : '')}</time>
          <span class="post-tags">${(p.tags || []).map(t =>
            `<a class="tag tag-mini" href="/blog.html?tag=${encodeURIComponent(t)}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</a>`
          ).join('')}</span>
        </div>
        <h2 class="post-title"><a href="/post.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.title)}</a></h2>
        ${p.excerpt ? `<p class="post-body">${escapeHtml(p.excerpt)}</p>` : `<p class="post-body">${escapeHtml(stripHtml(p.html).slice(0, 160))}${stripHtml(p.html).length > 160 ? '…' : ''}</p>`}
      </article>
    `).join('') || '<p class="empty">grep: 0 matches.</p>';

    pager.innerHTML = `
      ${page > 1 ? `<a class="pager-link" href="?page=${page - 1}&tag=${encodeURIComponent(tag)}">&lt; prev</a>` : '<span class="pager-off">&lt; prev</span>'}
      <span class="pager-status">page ${page}</span>
      ${data.hasMore ? `<a class="pager-link" href="?page=${page + 1}&tag=${encodeURIComponent(tag)}">next &gt;</a>` : '<span class="pager-off">next &gt;</span>'}
    `;
  } catch (e) {
    feed.innerHTML = '<p class="empty">error: API unreachable.</p>';
  }
}

// SPA-like navigation for internal blog links
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="blog.html"], a[href^="/blog.html"]');
  if (!link) return;
  e.preventDefault();
  const url = new URL(link.href, window.location.origin);
  const page = parseInt(url.searchParams.get('page'), 10) || 1;
  const tag = url.searchParams.get('tag') || 'all';
  history.pushState({ page, tag }, '', url.pathname + url.search);
  loadFeed(page, tag);
});

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(window.location.search);
  loadFeed(parseInt(params.get('page'), 10) || 1, params.get('tag') || 'all');
});

const params = new URLSearchParams(window.location.search);
loadFeed(parseInt(params.get('page'), 10) || 1, params.get('tag') || 'all');