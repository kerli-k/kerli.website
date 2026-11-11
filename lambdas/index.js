/* kerli.website API — Node 24 Lambda function URL
   Security choices:
   - One function, strict method checks per route.
   - Admin writes gated by ADMIN_SECRET (Authorization: Bearer <secret>).
   - Public writes rate-limited per salted IP hash (DynamoDB query, not scan).
   - Honeypot + time-trap; generic client errors; detailed CloudWatch logs.
   - DynamoDB TTL (ttl attribute) auto-deletes stickers/comments.
   - Spam blacklist is leet-proof via normalization.
*/
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand,
        ScanCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const client = new DynamoDBClient({});
const db = DynamoDBDocumentClient.from(client);

const POSTS = process.env.POSTS_TABLE || "kerli-posts";
const COMMENTS = process.env.COMMENTS_TABLE || "kerli-comments";
const ARCHIVE = process.env.ARCHIVE_TABLE || "kerli-comments-archive";
const REACTIONS = process.env.REACTIONS_TABLE || "kerli-reactions";
const ORIGIN = process.env.SITE_ORIGIN || "*";
const SECRET = process.env.ADMIN_SECRET || "";
const IP_SALT = process.env.IP_SALT || "";
const TTL_DAYS = Number(process.env.COMMENT_TTL_DAYS || "7");
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || "3600000");
const RATE_MAX = Number(process.env.RATE_MAX || "5");
const REACTION_RATE_MAX = Number(process.env.REACTION_RATE_MAX || "60");
const REACTIONS_ALLOWED = ["like", "love", "laugh", "fire", "think"];
const COMMENT_MAX = Number(process.env.COMMENT_MAX || "1000");
const NAME_MAX = Number(process.env.NAME_MAX || "60");
const TITLE_MAX = Number(process.env.TITLE_MAX || "200");
const HTML_MAX = Number(process.env.HTML_MAX || "100000");
const PAGE_SIZE = Number(process.env.PAGE_SIZE || "10");
const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET || "";

const base = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS"
};
const ok = (body, extra = {}) => ({
  statusCode: 200,
  headers: { ...base, "Content-Type": "application/json", ...extra },
  body: JSON.stringify(body)
});
const fail = (code, msg) => ({ statusCode: code, headers: base, body: JSON.stringify({ error: msg }) });

const isAuthed = (e) => {
  const h = e.headers?.authorization || e.headers?.Authorization || "";
  return h === `Bearer ${SECRET}` && SECRET.length >= 16;
};
const parseBody = (e) => {
  let raw = e.body || "{}";
  if (e.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
  try { return JSON.parse(raw); } catch { return {}; }
};

async function verifyCaptcha(token) {
  if (!token) return false;
  try {
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ response: token, secret: HCAPTCHA_SECRET })
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) { console.error("captcha verify error", e); return false; }
}
const hashIp = (ip) => crypto.createHash("sha256").update(IP_SALT + ip).digest("hex").slice(0, 32);

/* ---- spam filter: leet-proof blacklist ---- */
const BLACKLIST = (process.env.SPAM_BLACKLIST || "").split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
const LEET = { "0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","8":"b","@":"a","$":"s","!":"i","|":"l","(":"c","+":"t","#":"h" };
const deLeet = (s) => String(s).toLowerCase().replace(/[0134578@$!|+(#]/g, c => LEET[c] || c);
const collapse = (s) => deLeet(s).replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1");
const BAD = BLACKLIST.map(collapse).filter(Boolean);
function isBlocked(text) {
  if (!text) return false;
  const words = deLeet(text).split(/[^a-z]+/).filter(Boolean);
  if (words.some(w => BLACKLIST.includes(w))) return true;
  const hay = collapse(text);
  return BAD.some(b => b.length >= 4 && hay.includes(b));
}

function ttlEpoch(days = TTL_DAYS) {
  return Math.floor(Date.now() / 1000) + Math.max(1, days) * 86400;
}

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method || "GET";
  const path = event.rawPath || "/";
  const qs = event.queryStringParameters || {};
  if (method === "OPTIONS") return { statusCode: 204, headers: base, body: "" };

  try {
    /* ---- RSS ---- */
    if ((path === "/rss" || path === "/rss.xml") && method === "GET") {
      const res = await db.send(new ScanCommand({ TableName: POSTS }));
      const posts = (res.Items || [])
        .filter(p => !p.hidden && matchesType(p, "blog"))
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .slice(0, 20);
      const items = posts.map(p => `    <item>
      <title><![CDATA[${escapeXml(p.title || "")}]]></title>
      <link>https://kerli.website/post.html?id=${p.id}</link>
      <guid>https://kerli.website/post.html?id=${p.id}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description><![CDATA[${stripHtml(p.html || "").slice(0, 300)}]]></description>
      ${(p.tags || []).map(t => `<category>${escapeXml(t)}</category>`).join("\n      ")}
    </item>`).join("\n");
      return {
        statusCode: 200,
        headers: { ...base, "Content-Type": "application/rss+xml; charset=utf-8" },
        body: `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n  <title>kerli</title>\n  <link>https://kerli.website</link>\n  <description>notes, half-formed ideas, and thoughts on the world</description>\n  <language>en-us</language>\n${items}\n</channel></rss>`
      };
    }

    /* ---- POSTS ---- */
    if (path === "/posts" && method === "GET") {
      const admin = qs.admin === "1" && isAuthed(event);
      const page = Math.max(1, parseInt(qs.page, 10) || 1);
      const pageSize = Math.min(500, Math.max(1, parseInt(qs.limit, 10) || PAGE_SIZE));
      const tag = (qs.tag || "").trim();
      const type = (qs.type || "").trim();
      const res = await db.send(new ScanCommand({ TableName: POSTS }));
      let items = res.Items || [];
      if (!admin) items = items.filter(p => !p.hidden);
      if (type) items = items.filter(p => matchesType(p, type));
      if (tag && tag !== "all") items = items.filter(p => (p.tags || []).includes(tag));
      items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const tags = collectTags(items);
      const start = (page - 1) * pageSize;
      const paged = items.slice(start, start + pageSize);
      return ok({ items: paged, hasMore: items.length > start + pageSize, tags });
    }

    if (path.startsWith("/posts/") && method === "GET") {
      const id = decodeURIComponent(path.split("/")[2]);
      const res = await db.send(new GetCommand({ TableName: POSTS, Key: { id } }));
      if (!res.Item) return fail(404, "not found");
      if (res.Item.hidden && !isAuthed(event)) return fail(404, "not found");
      return ok(res.Item);
    }

    if (path === "/posts" && method === "POST") {
      if (!isAuthed(event)) return fail(401, "unauthorized");
      const b = parseBody(event);
      const type = b.type || "blog";
      const item = buildPostItem(type, b);
      if (!item) return fail(400, "invalid post data");
      await db.send(new PutCommand({ TableName: POSTS, Item: item }));
      return ok({ id: item.id });
    }

    if (path.startsWith("/posts/") && method === "DELETE") {
      if (!isAuthed(event)) return fail(401, "unauthorized");
      const id = decodeURIComponent(path.split("/")[2]);
      await db.send(new DeleteCommand({ TableName: POSTS, Key: { id } }));
      // Delete all stickers/comments for this post
      const cs = await db.send(new QueryCommand({
        TableName: COMMENTS,
        KeyConditionExpression: "postId = :p",
        ExpressionAttributeValues: { ":p": id }
      }));
      for (const c of (cs.Items || [])) {
        await db.send(new DeleteCommand({ TableName: COMMENTS, Key: { postId: id, id: c.id } }));
        await deleteReactionsFor(c.id);
      }
      await deleteReactionsFor(id);
      return ok({ deleted: id });
    }

    /* ---- COMMENTS / AMA STICKERS ---- */
    if (path === "/archive" && method === "GET") {
      const postId = String(qs.postId || "");
      if (!postId) return fail(400, "missing postId");
      const res = await db.send(new QueryCommand({
        TableName: ARCHIVE,
        KeyConditionExpression: "postId = :p",
        ExpressionAttributeValues: { ":p": postId }
      }));
      const items = (res.Items || [])
        .filter(c => c.status === "approved")
        .sort((a, b) => (a.ts || 0) - (b.ts || 0));
      return ok({ items });
    }

    if (path === "/comments" && method === "GET") {
      const postId = String(qs.postId || "");
      if (!postId) return fail(400, "missing postId");
      const res = await db.send(new QueryCommand({
        TableName: COMMENTS,
        KeyConditionExpression: "postId = :p",
        ExpressionAttributeValues: { ":p": postId }
      }));
      let items = res.Items || [];
      if (!(qs.admin === "1" && isAuthed(event))) items = items.filter(c => c.status === "approved");
      items.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      return ok({ items });
    }

    if (path === "/comments" && method === "POST") {
      const b = parseBody(event);
      // Honeypot: hidden "website" field
      if (b.website) return ok({ ok: true });
      // Time-trap: form rendered with server-side timestamp; too fast = bot
      if (!b.ts || (Date.now() - Number(b.ts)) < 4000) return ok({ ok: true });
      // Optional hCaptcha
      if (HCAPTCHA_SECRET && !(await verifyCaptcha(b.captcha))) return fail(400, "captcha required");
      // Size limits
      const text = String(b.text || "").slice(0, COMMENT_MAX).trim();
      const name = String(b.name || "anon").slice(0, NAME_MAX).trim() || "anon";
      if (!text) return fail(400, "message required");
      if (text.length < 2) return fail(400, "message too short");
      // Spam blacklist
      if (isBlocked(text) || isBlocked(name)) return fail(400, "blocked content");
      const postId = String(b.postId || "");
      if (!postId) return fail(400, "missing postId");

      const parentId = b.parentId ? String(b.parentId) : null;
      if (parentId) {
        const parent = await db.send(new GetCommand({ TableName: COMMENTS, Key: { postId, id: parentId } }));
        if (!parent.Item) return fail(400, "parent not found");
      }

      // Rate limit per salted IP hash
      const rawIp = event.requestContext?.http?.sourceIp || "unknown";
      const ip = hashIp(rawIp);
      const cutoff = Date.now() - RATE_WINDOW_MS;
      const existing = await db.send(new QueryCommand({
        TableName: COMMENTS,
        IndexName: "ip-ts-index",
        KeyConditionExpression: "ip = :ip AND ts > :cutoff",
        ExpressionAttributeValues: { ":ip": ip, ":cutoff": cutoff }
      }));
      if ((existing.Items || []).length >= RATE_MAX) return fail(429, "too many notes, slow down");

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const item = {
        postId, id, name, text,
        parentId,
        ip, // hashed, never raw
        ts: Date.now(),
        status: "pending",
        ttl: ttlEpoch()
      };
      await db.send(new PutCommand({ TableName: COMMENTS, Item: item }));
      // Archive a copy immediately so TTL deletion does not lose it.
      await db.send(new PutCommand({
        TableName: ARCHIVE,
        Item: { ...item, archivedAt: new Date().toISOString(), ttl: undefined }
      }));
      return ok({ ok: true, pending: true });
    }

    if (path === "/comments/approve" && method === "POST") {
      if (!isAuthed(event)) return fail(401, "unauthorized");
      const b = parseBody(event);
      const g = await db.send(new GetCommand({ TableName: COMMENTS, Key: { postId: b.postId, id: b.id } }));
      if (!g.Item) return fail(404, "not found");
      g.Item.status = "approved";
      await db.send(new PutCommand({ TableName: COMMENTS, Item: g.Item }));
      // Keep archive status in sync so the public archive shows approved notes.
      await db.send(new PutCommand({ TableName: ARCHIVE, Item: { ...g.Item, archivedAt: g.Item.archivedAt || new Date().toISOString() } }));
      return ok({ approved: b.id });
    }

    if (path === "/comments" && method === "DELETE") {
      if (!isAuthed(event)) return fail(401, "unauthorized");
      const postId = qs.postId;
      const id = qs.id;
      if (!postId || !id) return fail(400, "missing params");
      await db.send(new DeleteCommand({ TableName: COMMENTS, Key: { postId, id } }));
      await deleteReactionsFor(id);
      return ok({ deleted: id });
    }

    /* ---- REACTIONS ---- */
    if (path === "/reactions" && method === "GET") {
      const targetId = String(qs.targetId || "").slice(0, 100);
      if (!targetId) return fail(400, "missing targetId");
      const clientId = String(qs.clientId || "").slice(0, 64);
      const counts = await getReactionCounts(targetId);
      let mine = null;
      if (clientId) {
        const g = await db.send(new GetCommand({ TableName: REACTIONS, Key: { targetId, clientId } }));
        mine = g.Item?.reaction || null;
      }
      return ok({ counts, mine });
    }

    if (path === "/reactions" && method === "POST") {
      const b = parseBody(event);
      const targetId = String(b.targetId || "").slice(0, 100);
      const targetType = String(b.targetType || "post");
      const reaction = String(b.reaction || "");
      const clientId = String(b.clientId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      if (!targetId || !clientId) return fail(400, "missing targetId or clientId");
      if (!REACTIONS_ALLOWED.includes(reaction)) return fail(400, "invalid reaction");
      if (!(await targetIsPublic(targetId, targetType, b.postId))) return fail(404, "not found");

      const rawIp = event.requestContext?.http?.sourceIp || "unknown";
      const ip = hashIp(rawIp);
      const cutoff = Date.now() - RATE_WINDOW_MS;
      const recent = await db.send(new QueryCommand({
        TableName: REACTIONS,
        IndexName: "ip-ts-index",
        KeyConditionExpression: "ip = :ip AND ts > :cutoff",
        ExpressionAttributeValues: { ":ip": ip, ":cutoff": cutoff }
      }));
      if ((recent.Items || []).length >= REACTION_RATE_MAX) return fail(429, "too many reactions, slow down");

      const key = { targetId, clientId };
      const existing = await db.send(new GetCommand({ TableName: REACTIONS, Key: key }));
      let mine;
      if (existing.Item?.reaction === reaction) {
        await db.send(new DeleteCommand({ TableName: REACTIONS, Key: key }));
        mine = null;
      } else {
        await db.send(new PutCommand({
          TableName: REACTIONS,
          Item: { ...key, reaction, targetType, ip, ts: Date.now() }
        }));
        mine = reaction;
      }
      return ok({ counts: await getReactionCounts(targetId), mine });
    }

    return fail(404, "not found");
  } catch (e) {
    // Never leak Lambda / DynamoDB details to the client
    console.error("Lambda error:", e);
    return fail(500, "service unavailable");
  }
};

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function collectTags(posts) {
  const set = new Set();
  for (const p of posts) (p.tags || []).forEach(t => set.add(t));
  return Array.from(set).sort();
}

async function targetIsPublic(targetId, targetType, postId) {
  if (targetType === "post") {
    const p = await db.send(new GetCommand({ TableName: POSTS, Key: { id: targetId } }));
    return !!p.Item && (!p.Item.hidden || p.Item.id === "ama");
  }
  if (targetType === "comment") {
    if (!postId) return false;
    const c = await db.send(new GetCommand({
      TableName: COMMENTS,
      Key: { postId: String(postId).slice(0, 100), id: targetId }
    }));
    return !!c.Item && c.Item.status === "approved";
  }
  return false;
}

async function getReactionCounts(targetId) {
  const counts = Object.fromEntries(REACTIONS_ALLOWED.map(r => [r, 0]));
  const res = await db.send(new QueryCommand({
    TableName: REACTIONS,
    KeyConditionExpression: "targetId = :t",
    ExpressionAttributeValues: { ":t": targetId }
  }));
  for (const item of (res.Items || [])) {
    if (counts[item.reaction] !== undefined) counts[item.reaction]++;
  }
  return counts;
}

async function deleteReactionsFor(targetId) {
  const res = await db.send(new QueryCommand({
    TableName: REACTIONS,
    KeyConditionExpression: "targetId = :t",
    ExpressionAttributeValues: { ":t": targetId }
  }));
  for (const item of (res.Items || [])) {
    await db.send(new DeleteCommand({
      TableName: REACTIONS,
      Key: { targetId: item.targetId, clientId: item.clientId }
    }));
  }
}

function matchesType(post, type) {
  if (type === "blog") return !post.type || post.type === "blog";
  return post.type === type;
}

function normalizeTags(input) {
  return (Array.isArray(input) ? input : String(input || "").split(","))
    .map(t => String(t).trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24))
    .filter(Boolean)
    .slice(0, 10);
}

function buildPostItem(type, b) {
  const id = b.id || Date.now().toString(36);
  const title = String(b.title || "").trim().slice(0, TITLE_MAX);
  const tags = normalizeTags(b.tags);
  const now = new Date().toISOString();
  const base = { id, type, title, tags, hidden: !!b.hidden, date: b.date || now, updated: now };

  if (type === "blog") {
    const html = String(b.html || "").slice(0, HTML_MAX);
    if (!title) return null;
    return { ...base, html };
  }

  if (type === "project") {
    const year = String(b.year || "").slice(0, 20);
    const summary = String(b.summary || "").trim().slice(0, 300);
    const description = String(b.description || "").trim().slice(0, 5000);
    const source = String(b.source || "").trim().slice(0, 500);
    const showSource = !!b.showSource;
    if (!title) return null;
    return { ...base, year, summary, description, source, showSource };
  }

  if (type === "rec") {
    const recType = String(b.recType || b.type || "").trim().toLowerCase().slice(0, 30);
    const year = b.year ? Number(b.year) : null;
    const rating = Math.min(10, Math.max(0, Number(b.rating) || 0));
    const image = String(b.image || "").trim().slice(0, 500);
    const review = String(b.review || "").trim().slice(0, 5000);
    if (!title) return null;
    return { ...base, recType, year, rating, image, review };
  }

  if (type === "photo") {
    const description = String(b.description || "").trim().slice(0, 2000);
    const image = String(b.image || "").trim().slice(0, 500);
    const lat = Number(b.lat) || 0;
    const lon = Number(b.lon) || 0;
    const zoom = Number(b.zoom) || 15;
    if (!title || !image) return null;
    return { ...base, description, image, lat, lon, zoom };
  }

  return null;
}