const API = window.KERLI_API;

const typeFilters = document.getElementById('type-filters');
const tagFilters = document.getElementById('tag-filters');
const list = document.getElementById('rec-list');

let data = [];
let activeType = 'all';
let activeTag = 'all';

async function loadRecs() {
  list.innerHTML = '<p class="prompt">loading recommendations...</p>';
  try {
    const res = await fetch(`${API}/posts?type=rec`);
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    data = json.items || [];
    initFilters();
    render();
  } catch (e) {
    list.innerHTML = '<p class="empty">error: could not load recommendations.</p>';
  }
}

function initFilters() {
  typeFilters.innerHTML = '<span class="filter-label">type:</span><a class="tag is-active" href="recommendations.html" data-type="all">all</a>';
  tagFilters.innerHTML = '<span class="filter-label">tag:</span><a class="tag is-active" href="recommendations.html" data-tag="all">all</a>';

  const types = [...new Set(data.map(r => r.recType).filter(Boolean))];
  const tags = [...new Set(data.flatMap(r => r.tags || []))];

  types.forEach(t => {
    const a = document.createElement('a');
    a.className = 'tag'; a.href = `?type=${encodeURIComponent(t)}`; a.dataset.type = t; a.textContent = t;
    typeFilters.appendChild(a);
  });
  tags.forEach(t => {
    const a = document.createElement('a');
    a.className = 'tag'; a.href = `?tag=${encodeURIComponent(t)}`; a.dataset.tag = t; a.textContent = t;
    tagFilters.appendChild(a);
  });
}

function render() {
  const filtered = data.filter(r =>
    (activeType === 'all' || r.recType === activeType) &&
    (activeTag === 'all' || (r.tags || []).includes(activeTag))
  );

  list.innerHTML = filtered.map(r => `
    <article class="rec">
      ${r.image ? `<div class="rec-thumb"><img src="${escapeHtml(r.image)}" alt="" loading="lazy"></div>` : ''}
      <div class="rec-body">
        <div class="rec-head">
          <h2 class="rec-title">${escapeHtml(r.title)}</h2>
          <span class="rec-rating">
            <span class="rec-num">${r.rating || 0}/10</span>
            <span class="rec-bar" style="--v:${r.rating || 0}"></span>
          </span>
        </div>
        <p class="rec-meta">
          <span class="rec-type">${escapeHtml(r.recType || '')}</span>
          ${r.year ? `<span class="rec-sep">·</span><span>${r.year}</span>` : ''}
          ${(r.tags || []).map(t => `<span class="rec-sep">·</span><a class="tag tag-mini" href="?tag=${encodeURIComponent(t)}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</a>`).join('')}
        </p>
        <p class="rec-review">${escapeHtml(r.review || '')}</p>
      </div>
    </article>
  `).join('') || '<p class="empty">grep: 0 matches.</p>';

  document.querySelectorAll('#type-filters .tag').forEach(el => el.classList.toggle('is-active', el.dataset.type === activeType));
  document.querySelectorAll('#tag-filters .tag').forEach(el => el.classList.toggle('is-active', el.dataset.tag === activeTag));
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('.tag');
  if (link && (link.dataset.type || link.dataset.tag)) {
    e.preventDefault();
    if (link.dataset.type) activeType = link.dataset.type;
    if (link.dataset.tag) activeTag = link.dataset.tag;

    const params = new URLSearchParams();
    if (activeType !== 'all') params.set('type', activeType);
    if (activeTag !== 'all') params.set('tag', activeTag);
    history.pushState({}, '', params.toString() ? `?${params}` : '/recommendations.html');
    render();
  }
});

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(window.location.search);
  activeType = params.get('type') || 'all';
  activeTag = params.get('tag') || 'all';
  render();
});

const initParams = new URLSearchParams(window.location.search);
activeType = initParams.get('type') || 'all';
activeTag = initParams.get('tag') || 'all';
loadRecs();
