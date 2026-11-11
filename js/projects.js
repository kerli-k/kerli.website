const API = window.KERLI_API;

async function loadProjects() {
  const list = document.getElementById('proj-list');
  list.innerHTML = '<p class="prompt">loading projects...</p>';
  try {
    const res = await fetch(`${API}/posts?type=project&limit=500`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const items = data.items || [];
    if (!items.length) {
      list.innerHTML = '<p class="empty">no projects found.</p>';
      return;
    }
    list.innerHTML = '';
    for (const p of items.sort((a, b) => (b.date || "").localeCompare(a.date || ""))) {
      list.appendChild(renderProject(p));
    }
  } catch (e) {
    list.innerHTML = '<p class="empty">error: could not load projects.</p>';
  }
}

function renderProject(p) {
  const article = document.createElement('article');
  article.className = 'proj';
  article.tabIndex = 0;
  article.setAttribute('role', 'button');
  article.setAttribute('aria-expanded', 'false');

  const tags = (p.tags || []).map(t =>
    `<span class="tag tag-mini">${escapeHtml(t)}</span>`
  ).join('');

  const sourceLink = p.showSource && p.source
    ? `<p class="proj-source"><a href="${escapeHtml(p.source)}" target="_blank" rel="noopener">source ↗</a></p>`
    : '';

  article.innerHTML = `
    <div class="proj-head">
      <h2 class="proj-title">${escapeHtml(p.title)}</h2>
      ${p.year ? `<span class="proj-year">${escapeHtml(p.year)}</span>` : ''}
    </div>
    <p class="proj-summary">${escapeHtml(p.summary || '')}</p>
    ${tags ? `<p class="proj-tags">${tags}</p>` : ''}
    <div class="proj-detail" hidden>
      <p class="proj-desc">${escapeHtml(p.description || '')}</p>
      ${sourceLink}
    </div>
  `;

  const toggle = () => {
    const detail = article.querySelector('.proj-detail');
    const expanded = detail.hidden;
    detail.hidden = !expanded;
    article.setAttribute('aria-expanded', String(expanded));
  };

  article.addEventListener('click', (e) => {
    if (e.target.closest('a, button, .reactions')) return;
    toggle();
  });
  article.addEventListener('keydown', (e) => {
    if (e.target.closest('button, a, .reactions')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });

  article.appendChild(window.createReactionBar(p.id, "post"));
  return article;
}

loadProjects();
