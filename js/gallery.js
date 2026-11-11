const API = window.KERLI_API;

let allPhotos = [];
let activeTag = 'all';

async function loadGallery() {
  const grid = document.getElementById('photo-grid');
  try {
    const res = await fetch(`${API}/posts?type=photo&limit=500`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    allPhotos = (data.items || []).map(p => ({
      id: p.id,
      src: p.image,
      title: p.title,
      description: p.description || '',
      tags: p.tags || [],
      lat: p.lat,
      lon: p.lon,
      zoom: p.zoom || 15,
      date: p.date ? p.date.slice(0, 10) : ''
    }));

    buildTagFilter();
    renderPhotos();
  } catch (e) {
    grid.innerHTML = '<p class="empty">error: could not load photos.</p>';
  }
}

function buildTagFilter() {
  const filter = document.getElementById('tag-filters');
  filter.innerHTML = '<span class="filter-label">tag:</span><a class="tag is-active" href="photography.html" data-tag="all">all</a>';
  const tags = [...new Set(allPhotos.flatMap(p => p.tags))].sort();

  tags.forEach(tag => {
    const a = document.createElement('a');
    a.className = 'tag';
    a.href = '/photography.html';
    a.dataset.tag = tag;
    a.textContent = tag;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveTag(tag);
    });
    filter.appendChild(a);
  });
}

function setActiveTag(tag) {
  activeTag = tag;
  document.querySelectorAll('#tag-filters .tag').forEach(el => {
    el.classList.toggle('is-active', el.dataset.tag === tag);
  });
  renderPhotos();
}

function renderPhotos() {
  const grid = document.getElementById('photo-grid');
  const filtered = activeTag === 'all'
    ? allPhotos
    : allPhotos.filter(p => p.tags.includes(activeTag));

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="empty">no photos match this tag.</p>';
    return;
  }

  grid.innerHTML = filtered.map(photo => `
    <figure class="ph" data-id="${escapeHtml(photo.id)}">
      <a href="#" class="ph-link" data-id="${escapeHtml(photo.id)}">
        <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.title)}" loading="lazy">
        <div class="ph-overlay">
          <span class="ph-title">${escapeHtml(photo.title)}</span>
          <span class="ph-tags">${photo.tags.map(t => `#${escapeHtml(t)}`).join(' ')}</span>
        </div>
      </a>
    </figure>
  `).join('');

  document.querySelectorAll('.ph-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openPhotoModal(link.dataset.id);
    });
  });
}

function openPhotoModal(photoId) {
  const photo = allPhotos.find(p => p.id === photoId);
  if (!photo) return;

  const modal = document.getElementById('photo-modal');
  const body = document.getElementById('modal-body');

  const bbox = calculateBbox(photo.lat, photo.lon, photo.zoom);
  const osmUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${photo.lat},${photo.lon}`;

  body.innerHTML = `
    <div class="photo-detail">
      <div class="photo-detail-img">
        <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.title)}">
      </div>
      <div class="photo-detail-info">
        <h2 class="photo-detail-title">${escapeHtml(photo.title)}</h2>
        <p class="photo-detail-desc">${escapeHtml(photo.description)}</p>

        <div class="photo-detail-meta">
          <div class="photo-detail-tags">
            ${photo.tags.map(t => `<span class="tag-mini">#${escapeHtml(t)}</span>`).join('')}
          </div>
          <div class="photo-detail-date">${escapeHtml(photo.date)}</div>
        </div>

        ${photo.lat && photo.lon ? `
          <div class="photo-detail-map">
            <h3>Location</h3>
            <div class="map-container">
              <iframe
                src="${osmUrl}"
                frameborder="0"
                scrolling="no"
                loading="lazy">
              </iframe>
            </div>
            <div class="map-coords">
              ${photo.lat.toFixed(6)}, ${photo.lon.toFixed(6)}
              <a href="https://www.openstreetmap.org/?mlat=${photo.lat}&mlon=${photo.lon}#map=${photo.zoom}/${photo.lat}/${photo.lon}"
                 target="_blank"
                 rel="noopener">
                Open in OSM ↗
              </a>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  body.querySelector('.photo-detail-info').appendChild(window.createReactionBar(photo.id, "post"));
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function calculateBbox(lat, lon, zoom) {
  const scale = Math.pow(2, 18 - zoom);
  const delta = 0.001 * scale;
  const minLon = lon - delta;
  const maxLon = lon + delta;
  const minLat = lat - delta * 0.7;
  const maxLat = lat + delta * 0.7;
  return `${minLon},${minLat},${maxLon},${maxLat}`;
}

document.getElementById('modal-close').addEventListener('click', closePhotoModal);
document.getElementById('photo-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closePhotoModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePhotoModal();
});

function closePhotoModal() {
  const modal = document.getElementById('photo-modal');
  modal.hidden = true;
  document.body.style.overflow = '';
}

loadGallery();
