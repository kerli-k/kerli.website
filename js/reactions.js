// Anonymous reactions shared by posts, comments, projects, recs, and photos.
const REACTION_API = (window.KERLI_API || "").replace(/\/$/, "");
const REACTION_KINDS = [
  { key: "like", emoji: "👍", label: "like" },
  { key: "love", emoji: "❤️", label: "love" },
  { key: "laugh", emoji: "😂", label: "laugh" },
  { key: "fire", emoji: "🔥", label: "fire" },
  { key: "think", emoji: "🤔", label: "think" }
];

let memoryClientId = "";

function reactionClientId() {
  try {
    let id = localStorage.getItem("kerli-client-id");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("kerli-client-id", id);
    }
    return id;
  } catch {
    if (!memoryClientId) memoryClientId = `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return memoryClientId;
  }
}

function createReactionBar(targetId, targetType = "post", postId = null) {
  const bar = document.createElement("div");
  bar.className = "reactions";
  bar.setAttribute("aria-label", "reactions");
  bar.dataset.targetId = targetId;
  bar.dataset.targetType = targetType;
  if (postId) bar.dataset.postId = postId;

  const buttons = {};
  for (const kind of REACTION_KINDS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reaction";
    btn.dataset.reaction = kind.key;
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", kind.label);
    btn.innerHTML = `<span class="reaction-emoji">${kind.emoji}</span><span class="reaction-count"></span>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      submit(kind.key);
    });
    buttons[kind.key] = btn;
    bar.appendChild(btn);
  }

  const apply = (data) => {
    const counts = data?.counts || {};
    const mine = data?.mine || null;
    for (const kind of REACTION_KINDS) {
      const btn = buttons[kind.key];
      const count = counts[kind.key] || 0;
      const countEl = btn.querySelector(".reaction-count");
      countEl.textContent = count > 0 ? String(count) : "";
      const active = mine === kind.key;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
  };

  let busy = false;
  async function submit(reaction) {
    if (busy) return;
    busy = true;
    bar.classList.add("is-busy");
    try {
      const res = await fetch(`${REACTION_API}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId,
          targetType,
          postId: postId || undefined,
          reaction,
          clientId: reactionClientId()
        })
      });
      if (res.ok) apply(await res.json());
    } catch {
      // Reactions are non-essential; leave the current counts alone.
    } finally {
      busy = false;
      bar.classList.remove("is-busy");
    }
  }

  fetch(`${REACTION_API}/reactions?targetId=${encodeURIComponent(targetId)}&clientId=${encodeURIComponent(reactionClientId())}`)
    .then(res => res.ok ? res.json() : null)
    .then(data => { if (data) apply(data); })
    .catch(() => {});

  return bar;
}

window.createReactionBar = createReactionBar;
