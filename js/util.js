// Shared helpers used by the dynamic pages.
window.KERLI_API = (window.KERLI_API || "").replace(/\/$/, "");

window.escapeHtml = function(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

window.formatDate = function(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString(); } catch { return ''; }
};

window.buildTree = function(items) {
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
};
