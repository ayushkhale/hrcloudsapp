// ─────────────────────────────────────────────────────────────────────────────
// features/org/orgMeta.js — what the Org Chart and Company Profile know about
// the organisation's shape.
//
// PORTED from the web's shared/organization/orgChartMeta.js (CLAUDE.md §10) —
// `buildOrgIndex`, `ancestorsOf`, `defaultExpanded`, `searchPeople`,
// `visibleRows`, `departmentKeyOf`, `displayNameOf`, `levelLabel` keep their
// names and behaviour. What did NOT come across is the Tailwind class strings
// for role/department colour: tones live in theme/tokens.js here, so this stays
// pure logic. Roles map to the house tone keys (all render purple-family):
// HR = purple, manager = indigo, employee = blue.
//
// GET /organizations/hierarchy returns `{ total_members, roots[] }`, a FOREST:
// several people can sit at the top, and a member whose manager was deactivated
// comes back as a root still carrying that manager's `reporting_to_id`. This
// turns that into an index the screens can ask questions of without walking the
// tree per render.
//
// Contract traps carried over:
// • `reporting_to_id` is the parent FROM THE MAPPING, not always the tree
//   parent. A root with a non-null one reports to somebody no longer active —
//   `formerManager` flags it. Never print either id (CLAUDE.md §4).
// • A `seen` set guards duplicates: two children with one key would drop a
//   branch silently.
// • Avatar URLs are presigned (~5 min) — never stored past the response.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_LABEL = { hr: 'HR', manager: 'Manager', employee: 'Employee' };
export const roleLabel = (role) => ROLE_LABEL[String(role || '').toLowerCase()] || 'Employee';

const ROLE_TONE = { hr: 'purple', manager: 'indigo', employee: 'blue' };
export const roleToneOf = (role) => ROLE_TONE[String(role || '').toLowerCase()] || 'blue';

/** Key for the "no department" group — never a real department id. */
export const NO_DEPARTMENT = '__none__';

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Which department a node is grouped under — `department_id` first, then name. */
export const departmentKeyOf = (node) => {
  if (node?.department_id) return String(node.department_id);
  return node?.department || NO_DEPARTMENT;
};

/** The name to show. The server already falls back to first + last, then email. */
export function displayNameOf(raw) {
  const full = [clean(raw?.first_name), clean(raw?.last_name)].filter(Boolean).join(' ');
  return clean(raw?.name) || clean(full) || clean(raw?.email) || 'A colleague';
}

/** Build the chart index from a hierarchy response. */
export function buildOrgIndex(data) {
  const byId = new Map();
  const flat = [];
  const seen = new Set();
  let depth = 0;
  let biggestTeam = null;
  let formerManagerCount = 0;
  const roleCounts = { hr: 0, manager: 0, employee: 0 };
  const deptCounts = new Map();

  const visit = (raw, parentId, level, fallbackKey) => {
    const id = clean(raw?.user_id) || fallbackKey;
    if (seen.has(id)) return null;
    seen.add(id);
    const role = ['hr', 'manager', 'employee'].includes(raw?.role) ? raw.role : 'employee';
    const node = {
      id,
      name: displayNameOf(raw),
      email: clean(raw?.email),
      avatar_url: clean(raw?.avatar_url),
      role,
      employee_code: clean(raw?.employee_code),
      designation: clean(raw?.designation),
      department: clean(raw?.department),
      department_id: clean(raw?.department_id),
      work_location: clean(raw?.work_location),
      gender: raw?.gender,
      parentId,
      formerManager: !parentId && !!clean(raw?.reporting_to_id),
      level,
      children: [],
      teamSize: 0,
    };
    byId.set(id, node);
    flat.push(node);
    depth = Math.max(depth, level + 1);
    roleCounts[role] += 1;
    if (node.formerManager) formerManagerCount += 1;
    const kids = Array.isArray(raw?.children) ? raw.children : [];
    kids.forEach((child, i) => {
      const c = visit(child, id, level + 1, `${id}:${i}`);
      if (c) {
        node.children.push(c);
        node.teamSize += 1 + c.teamSize;
      }
    });
    if (node.children.length && (!biggestTeam || node.children.length > biggestTeam.children.length)) biggestTeam = node;
    return node;
  };

  const rawRoots = Array.isArray(data?.roots) ? data.roots : [];
  const roots = rawRoots.map((r, i) => visit(r, null, 0, `root:${i}`)).filter(Boolean);

  const deptNames = new Map();
  for (const node of flat) {
    const key = departmentKeyOf(node);
    deptCounts.set(key, (deptCounts.get(key) || 0) + 1);
    if (key !== NO_DEPARTMENT && node.department && !deptNames.has(key)) deptNames.set(key, node.department);
  }

  const departments = [...deptCounts.entries()]
    .map(([key, count]) => ({
      key,
      name: key === NO_DEPARTMENT ? 'No department' : deptNames.get(key) || 'No department name',
      count,
    }))
    .sort((a, b) => (a.key === NO_DEPARTMENT) - (b.key === NO_DEPARTMENT) || b.count - a.count || a.name.localeCompare(b.name));

  return {
    roots,
    byId,
    flat,
    total: flat.length,
    depth,
    departments,
    roleCounts,
    biggestTeam,
    formerManagerCount,
  };
}

/** The people above `id`, top first (not including `id`). */
export function ancestorsOf(index, id) {
  const chain = [];
  let cur = index?.byId.get(id);
  const guard = new Set();
  while (cur?.parentId && !guard.has(cur.parentId)) {
    guard.add(cur.parentId);
    cur = index.byId.get(cur.parentId);
    if (cur) chain.unshift(cur);
  }
  return chain;
}

/** Which people start unfolded — the top, then each level while it still fits a budget. */
export function defaultExpanded(index, budget = 24) {
  const open = new Set();
  let level = index.roots;
  let visible = level.length;
  let first = true;
  while (level.length) {
    const withKids = level.filter((n) => n.children.length);
    const next = withKids.flatMap((n) => n.children);
    if (!first && visible + next.length > budget) break;
    withKids.forEach((n) => open.add(n.id));
    visible += next.length;
    level = next;
    first = false;
  }
  return open;
}

/** Every person with reports — the "Open every team" set. */
export const allExpandable = (index) => new Set(index.flat.filter((n) => n.children.length).map((n) => n.id));

/** People matching a search, best first. */
export function searchPeople(index, query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !index) return [];
  const scored = [];
  for (const n of index.flat) {
    const name = n.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;
    else if ([n.designation, n.department, n.employee_code, n.email].some((v) => v && v.toLowerCase().includes(q))) score = 3;
    if (score >= 0) scored.push([score, n]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, n]) => n);
}

/** The rows an expandable list shows: visible people in reading order. */
export function visibleRows(roots, expanded) {
  const rows = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      rows.push(n);
      if (n.children.length && expanded.has(n.id)) walk(n.children);
    }
  };
  walk(roots);
  return rows;
}

/** "Level 1" is the top of the chart. */
export const levelLabel = (node) => `Level ${node.level + 1}`;

/**
 * A team drawn as a compact vertical stack instead of a wide row: when everyone
 * in it is a leaf and there are enough of them that a row would stretch the
 * chart sideways (a support lead with 30 agents). Ported from orgChartMeta.js.
 */
export const STACK_AT = 5;
export const isStackedTeam = (node) =>
  node.children.length >= STACK_AT && node.children.every((c) => c.children.length === 0);

/* ── Company Profile helpers (ported from CompanyProfilePage) ─────────────── */

/** "acme.example" → "https://acme.example"; anything that isn't a web address → null. */
export function websiteHref(raw) {
  const v = clean(raw);
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}
export const websiteLabel = (raw) => String(raw || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');

/** "51-200" → "51–200 people". */
export function sizeLabel(raw) {
  const v = clean(raw);
  if (!v) return null;
  if (/^\d+\s*-\s*\d+$/.test(v)) return `${v.replace(/\s*-\s*/, '–')} people`;
  if (/^\d+\+$/.test(v)) return `${v} people`;
  return v;
}
