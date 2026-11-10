const API = window.KERLI_API;

function renderNote(c) {
  const wrap = document.createElement('div');
  wrap.className = 'note';
  wrap.innerHTML = `
    <p class="note-text">${escapeHtml(c.text)}</p>
    <p class="note-meta">— ${escapeHtml(c.name)} · ${formatDate(c.ts)}</p>
    <div class="comment-children"></div>
  `;
  const children = wrap.querySelector('.comment-children');
  if (c.children && c.children.length) {
    for (const child of c.children) {
      children.appendChild(renderComment(child));
    }
  }
  return wrap;
}

function renderComment(c) {
  const wrap = document.createElement('div');
  wrap.className = 'comment';
  wrap.innerHTML = `
    <strong>${escapeHtml(c.name)}</strong> <span class="muted">${formatDate(c.ts)}</span>
    <p>${escapeHtml(c.text)}</p>
    <div class="comment-children"></div>
  `;
  const children = wrap.querySelector('.comment-children');
  if (c.children && c.children.length) {
    for (const child of c.children) {
      children.appendChild(renderComment(child));
    }
  }
  return wrap;
}

async function loadArchive() {
  const root = document.getElementById('archive-root');
  const list = document.getElementById('archive-list');
  const postId = root.dataset.postId;
  if (!postId) return;

  list.innerHTML = '<p class="prompt">fetching archive...</p>';
  try {
    const res = await fetch(`${API}/archive?postId=${encodeURIComponent(postId)}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const tree = buildTree(data.items || []);
    list.innerHTML = '';
    if (!tree.length) {
      list.innerHTML = '<p class="empty">archive is empty.</p>';
      return;
    }
    for (const c of tree) {
      list.appendChild(renderNote(c));
    }
  } catch (e) {
    list.innerHTML = '<p class="empty">error: could not load archive.</p>';
  }
}

loadArchive();
