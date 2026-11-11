const API = window.KERLI_API;

async function init() {
  const params = new URLSearchParams(window.location.search);
  let postId = params.get('id');
  const isAma = document.getElementById('ama-root');
  if (isAma) postId = isAma.dataset.postId;
  if (!postId) {
    const pc = document.getElementById('post-content');
    if (pc) pc.innerHTML = '<p class="empty">error: missing post id.</p>';
    return;
  }

  const ts = document.getElementById('ts');
  if (ts) ts.value = Date.now();

  if (isAma) isAma.appendChild(window.createReactionBar('ama', 'post'));

  const pc = document.getElementById('post-content');
  if (pc) {
    try {
      const postRes = await fetch(`${API}/posts/${encodeURIComponent(postId)}`);
      if (!postRes.ok) throw new Error(postRes.status);
      const post = await postRes.json();
      pc.innerHTML = `
        <h1>${escapeHtml(post.title)}</h1>
        <p class="post-meta"><time>${escapeHtml(post.date ? post.date.slice(0, 10) : '')}</time></p>
        ${post.html || ''}
      `;
      pc.appendChild(window.createReactionBar(postId, "post"));
    } catch (e) {
      pc.innerHTML = '<p class="empty">error: post not found.</p>';
    }
  }

  loadComments(postId);

  const topForm = document.getElementById('comment-form');
  if (topForm) bindCommentForm(topForm, postId);
}

function bindCommentForm(form, postId, parentId = null) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = form.querySelector('.form-status');
    if (status) status.textContent = 'sending...';
    const fd = new FormData(form);
    const payload = {
      postId,
      parentId: parentId || fd.get('parentId') || undefined,
      name: fd.get('name'),
      text: fd.get('text'),
      website: fd.get('website'),
      ts: fd.get('ts')
    };
    try {
      const res = await fetch(`${API}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(res.status);
      form.reset();
      const ts = form.querySelector('input[name="ts"]');
      if (ts) ts.value = Date.now();
      if (status) status.textContent = 'note received — pending moderation.';
      loadComments(postId);
    } catch (e) {
      if (status) status.textContent = 'error: could not send note.';
    }
  });
}

function buildTree(items) {
  const byId = {};
  const roots = [];
  for (const c of items) {
    c.children = [];
    byId[c.id] = c;
  }
  for (const c of items) {
    if (c.parentId && byId[c.parentId]) {
      byId[c.parentId].children.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

function renderComment(c, isAma) {
  const isNote = isAma && !c.parentId;
  const inner = isNote ? `
    <article class="note" data-id="${c.id}">
      <p class="note-text">${escapeHtml(c.text)}</p>
      <p class="note-meta">— ${escapeHtml(c.name)} · ${formatDate(c.ts)}</p>
      <button class="btn btn-sm reply-btn" data-reply="${c.id}">reply</button>
      <div class="reply-form" hidden></div>
      <div class="comment-children"></div>
    </article>
  ` : `
    <div class="comment" data-id="${c.id}">
      <strong>${escapeHtml(c.name)}</strong> <span class="muted">${formatDate(c.ts)}</span>
      <p>${escapeHtml(c.text)}</p>
      <button class="btn btn-sm reply-btn" data-reply="${c.id}">reply</button>
      <div class="reply-form" hidden></div>
      <div class="comment-children"></div>
    </div>
  `;
  const wrap = document.createElement('div');
  wrap.innerHTML = inner;
  const el = wrap.firstElementChild;

  const replyBtn = el.querySelector('[data-reply]');
  const replyContainer = el.querySelector('.reply-form');
  const childrenContainer = el.querySelector('.comment-children');

  replyBtn.parentNode.insertBefore(window.createReactionBar(c.id, "comment", c.postId), replyBtn);

  replyBtn.addEventListener('click', () => {
    if (replyContainer.hasChildNodes()) {
      replyContainer.hidden = !replyContainer.hidden;
      return;
    }
    replyContainer.innerHTML = `
      <form class="ask-form reply-form-inner">
        <input type="hidden" name="parentId" value="${c.id}">
        <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
        <input type="hidden" name="ts" value="${Date.now()}">
        <label class="field"><span class="field-label">name (optional)</span>
          <input type="text" name="name" placeholder="anon"></label>
        <label class="field"><span class="field-label">reply</span>
          <textarea name="text" rows="3" required></textarea></label>
        <button class="btn btn-sm" type="submit">send reply →</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `;
    replyContainer.hidden = false;
    bindCommentForm(replyContainer.querySelector('form'), c.postId, c.id);
  });

  if (c.children && c.children.length) {
    for (const child of c.children) {
      childrenContainer.appendChild(renderComment(child, isAma));
    }
  }

  return el;
}

async function loadComments(postId) {
  const list = document.getElementById('comment-list');
  if (!list) return;
  try {
    const res = await fetch(`${API}/comments?postId=${encodeURIComponent(postId)}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const comments = data.items || [];
    const isAma = document.getElementById('ama-root');
    const tree = buildTree(comments);

    list.innerHTML = '';
    if (!tree.length) {
      list.innerHTML = '<p class="empty">no notes yet.</p>';
      return;
    }
    const container = document.createElement('div');
    container.className = 'comment-thread';
    for (const c of tree) {
      container.appendChild(renderComment(c, isAma));
    }
    list.appendChild(container);
  } catch (e) {
    list.innerHTML = '<p class="empty">error: could not load notes.</p>';
  }
}

init();
