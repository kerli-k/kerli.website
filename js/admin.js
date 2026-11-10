const API = window.KERLI_API;
let TOKEN = sessionStorage.getItem("kerli-token") || "";

const $ = (id) => document.getElementById(id);

function authHeaders() {
  return { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" };
}

$("login-btn").addEventListener("click", async () => {
  TOKEN = $("pw").value.trim();
  const res = await fetch(`${API}/posts?admin=1&limit=500`, { headers: authHeaders() });
  if (res.status === 401) { alert("wrong password"); TOKEN = ""; return; }
  sessionStorage.setItem("kerli-token", TOKEN);
  unlock();
});

async function unlock() {
  $("auth-box").hidden = true;
  $("panel").hidden = false;
  setupTypeToggle();
  await Promise.all([loadPosts(), loadAmaOptions()]);
}

function setupTypeToggle() {
  const sel = $("p-type");
  const update = () => {
    document.querySelectorAll(".type-fields").forEach(el => {
      el.hidden = el.dataset.type !== sel.value;
    });
  };
  sel.addEventListener("change", update);
  update();
}

function gatherBody() {
  const type = $("p-type").value;
  const base = {
    id: $("p-id").value.trim() || undefined,
    type,
    title: $("p-title").value.trim(),
    tags: $("p-tags").value.split(",").map(t => t.trim()).filter(Boolean)
  };

  if (type === "blog") {
    return { ...base, html: $("p-html").value, hidden: $("p-hidden").checked };
  }
  if (type === "project") {
    return {
      ...base,
      year: $("p-year").value.trim(),
      summary: $("p-summary").value.trim(),
      description: $("p-description").value.trim(),
      source: $("p-source").value.trim(),
      showSource: $("p-show-source").checked
    };
  }
  if (type === "rec") {
    return {
      ...base,
      recType: $("p-rec-type").value.trim(),
      year: $("p-rec-year").value.trim(),
      rating: $("p-rating").value,
      image: $("p-rec-image").value.trim(),
      review: $("p-review").value.trim()
    };
  }
  if (type === "photo") {
    return {
      ...base,
      image: $("p-photo-image").value.trim(),
      description: $("p-photo-desc").value.trim(),
      lat: $("p-lat").value,
      lon: $("p-lon").value,
      zoom: $("p-zoom").value,
      date: $("p-photo-date").value
    };
  }
  return null;
}

function clearForm() {
  $("p-id").value = "";
  $("p-title").value = "";
  $("p-tags").value = "";
  $("p-html").value = "";
  $("p-hidden").checked = false;
  $("p-year").value = "";
  $("p-summary").value = "";
  $("p-description").value = "";
  $("p-source").value = "";
  $("p-show-source").checked = false;
  $("p-rec-type").value = "";
  $("p-rec-year").value = "";
  $("p-rating").value = "";
  $("p-rec-image").value = "";
  $("p-review").value = "";
  $("p-photo-image").value = "";
  $("p-photo-desc").value = "";
  $("p-lat").value = "";
  $("p-lon").value = "";
  $("p-zoom").value = "";
  $("p-photo-date").value = "";
  $("pub-status").textContent = "";
}

async function loadPosts() {
  const res = await fetch(`${API}/posts?admin=1&limit=500`, { headers: authHeaders() });
  if (res.status === 401) { sessionStorage.removeItem("kerli-token"); location.reload(); return; }
  const { items } = await res.json();
  $("post-list").innerHTML = items.map(p => `
    <div class="admin-row">
      <span class="admin-row-title">[${p.type || 'blog'}] ${escapeHtml(p.title)} ${p.hidden ? '<em class="muted">(hidden)</em>' : ''}</span>
      <div>
        <button class="btn btn-sm" data-edit="${p.id}">edit</button>
        <button class="btn btn-sm" data-del="${p.id}">delete</button>
      </div>
    </div>`).join("") || '<p class="empty">no posts yet.</p>';

  document.querySelectorAll("[data-del]").forEach(b =>
    b.addEventListener("click", () => delPost(b.dataset.del)));
  document.querySelectorAll("[data-edit]").forEach(b =>
    b.addEventListener("click", () => loadEdit(b.dataset.edit)));
}

async function loadEdit(id) {
  const res = await fetch(`${API}/posts/${encodeURIComponent(id)}`, { headers: authHeaders() });
  const p = await res.json();
  $("p-id").value = p.id;
  $("p-type").value = p.type || "blog";
  $("p-title").value = p.title || "";
  $("p-tags").value = (p.tags || []).join(", ");
  setupTypeToggle(); // refresh visible fields

  $("p-html").value = p.html || "";
  $("p-hidden").checked = !!p.hidden;
  $("p-year").value = p.year || "";
  $("p-summary").value = p.summary || "";
  $("p-description").value = p.description || "";
  $("p-source").value = p.source || "";
  $("p-show-source").checked = !!p.showSource;
  $("p-rec-type").value = p.recType || "";
  $("p-rec-year").value = p.year || "";
  $("p-rating").value = p.rating || "";
  $("p-rec-image").value = p.image || "";
  $("p-review").value = p.review || "";
  $("p-photo-image").value = p.image || "";
  $("p-photo-desc").value = p.description || "";
  $("p-lat").value = p.lat || "";
  $("p-lon").value = p.lon || "";
  $("p-zoom").value = p.zoom || "";
  $("p-photo-date").value = p.date ? p.date.slice(0, 10) : "";

  $("pub-status").textContent = `editing ${p.id}`;
  window.scrollTo({ top: $("p-type").offsetTop - 20, behavior: "smooth" });
}

async function delPost(id) {
  if (!confirm("Delete this post?")) return;
  await fetch(`${API}/posts/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
  loadPosts(); loadAmaOptions();
}

$("publish-btn").addEventListener("click", async () => {
  const body = gatherBody();
  if (!body || !body.title) { $("pub-status").textContent = "title required"; return; }
  const res = await fetch(`${API}/posts`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  $("pub-status").textContent = res.ok ? "saved ✓" : "error";
  if (res.ok) { clearForm(); loadPosts(); loadAmaOptions(); }
});

/* ---- stickers / comments moderation ---- */
async function loadAmaOptions() {
  const res = await fetch(`${API}/posts?admin=1&limit=500`, { headers: authHeaders() });
  const { items } = await res.json();
  const sel = $("ama-select");
  sel.innerHTML = items.map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join("");
  if (items.length) loadStickers(items[0].id);
  sel.onchange = () => loadStickers(sel.value);
}

function renderModComment(c, postId) {
  const parentHint = c.parentId ? `<span class="muted"> ↳ reply to ${c.parentId.slice(0, 8)}…</span>` : '';
  const el = document.createElement('div');
  el.className = 'note admin-note';
  el.dataset.id = c.id;
  el.innerHTML = `
    <p class="note-text">${escapeHtml(c.text)}</p>
    <p class="note-meta">— ${escapeHtml(c.name)} · ${formatDate(c.ts)} · <strong>${c.status}</strong>${parentHint}</p>
    <div class="admin-note-actions">
      ${c.status !== "approved" ? `<button class="btn btn-sm" data-ap="${postId}|${c.id}">approve</button>` : ''}
      <button class="btn btn-sm" data-rm="${postId}|${c.id}">delete</button>
    </div>
    <div class="comment-children"></div>
  `;
  const children = el.querySelector('.comment-children');
  if (c.children && c.children.length) {
    for (const child of c.children) {
      children.appendChild(renderModComment(child, postId));
    }
  }
  return el;
}

async function loadStickers(postId) {
  const res = await fetch(`${API}/comments?postId=${encodeURIComponent(postId)}&admin=1`, { headers: authHeaders() });
  const { items } = await res.json();
  const tree = buildTree(items);
  const container = $("sticker-list");
  container.innerHTML = "";
  if (!tree.length) {
    container.innerHTML = '<p class="empty">no stickers.</p>';
    return;
  }
  for (const c of tree) {
    container.appendChild(renderModComment(c, postId));
  }

  document.querySelectorAll("[data-ap]").forEach(b => b.addEventListener("click", async () => {
    const [pid, id] = b.dataset.ap.split("|");
    await fetch(`${API}/comments/approve`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ postId: pid, id }) });
    loadStickers(pid);
  }));
  document.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", async () => {
    const [pid, id] = b.dataset.rm.split("|");
    await fetch(`${API}/comments?postId=${encodeURIComponent(pid)}&id=${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
    loadStickers(pid);
  }));
}

if (TOKEN) unlock();
