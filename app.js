const STORAGE_KEY = "vnotion:pro:final:v1";

const defaultDocs = [
  {
    id: "welcome",
    title: "Welcome",
    icon: "📄",
    parentId: null,
    content: "<p>첫 문서: 좌측 트리에서 추가/삭제/정렬을 연습하세요.</p>",
    starred: false,
    order: 0,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: "guides",
    title: "Guides",
    icon: "",
    parentId: null,
    content:
      "<h2>Guide Index</h2><ul><li>Project Setup</li><li>Performance</li></ul>",
    starred: true,
    order: 1,
    createdAt: Date.now() - 84000000,
    updatedAt: Date.now() - 4200000,
  },
  {
    id: "setup",
    title: "Project Setup",
    icon: "🧰",
    parentId: "guides",
    content:
      "<h1>Setup</h1><p>npm, bundler, dev server… (이 예제는 Vanilla JS!)</p>",
    starred: false,
    order: 0,
    createdAt: Date.now() - 82000000,
    updatedAt: Date.now() - 4000000,
  },
  {
    id: "perf",
    title: "Performance",
    icon: "",
    parentId: "guides",
    content: "<p>CRP, LCP/FCP, 이미지/폰트 최적화 아이디어</p>",
    starred: false,
    order: 1,
    createdAt: Date.now() - 80000000,
    updatedAt: Date.now() - 3800000,
  },
];

const state = {
  docs: [],
  trash: [],
  expanded: {},
  activeId: null,
  isMobile: matchMedia("(max-width: 768px)").matches,
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    //  처음 실행하는 상태
    if (!raw) {
      state.docs = defaultDocs.slice();
      state.trash = [];
      return;
    }
    const data = JSON.parse(raw);
    state.docs = data.docs || defaultDocs.slice();
    state.trash = data.trash || [];
    state.expanded = data.expanded || {};
    state.activeId = data.activeId || null;
  } catch (error) {
    console.warn("Failed to load data from localStorage", error);
    state.docs = defaultDocs.slice();
    state.trash = [];
  }
}

function save() {
  const data = {
    docs: state.docs,
    trash: state.trash,
    expanded: state.expanded,
    activeId: state.activeId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid() {
  return Math.random().toString(36).slice(2, 11);
}

function childrenOf(pid) {
  return state.docs
    .filter((doc) => doc.parentId === pid)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

function findDoc(id) {
  return state.docs.find((doc) => doc.id === id);
}

function maxOrder(pid) {
  const kids = childrenOf(pid);
  return kids.length ? Math.max(...kids.map((doc) => doc.order)) + 1 : 0;
}

function existsInDocs(id) {
  return !!findDoc(id);
}

function isDescendant(id, maybeAncestorId) {
  if (!id || !maybeAncestorId) return false;
  let cur = findDoc(id);
  while (cur && cur.parentId) {
    if (cur.parentId === maybeAncestorId) return true;
    cur = findDoc(cur.parentId);
  }
  return false;
}

function createDoc({ title = "Untitled", parentId = null, afterId = null }) {
  const id = uid();
  let order = maxOrder(parentId); //  부모 문서의 최대 순서
  if (afterId) {
    const sibs = childrenOf(parentId);
    const idx = sibs.findIndex((doc) => doc.id === afterId);
    order = idx >= 0 ? sibs[idx].order + 0.5 : order;
  }

  const doc = {
    id,
    title,
    icon: "",
    parentId,
    content: "",
    starred: false,
    order,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.docs.push(doc);
  normalizeOrders(parentId);
  save();
  return id;
}

function updateDoc(id, patch) {
  const d = findDoc(id);
  if (!d) return;
  Object.assign(d, patch, { updatedAt: Date.now() });
  save();
}

function archiveDoc(id) {
  const toArchive = [id, ...descendantsOf(id).map((doc) => doc.id)];
  toArchive.forEach((did) => {
    const idx = state.docs.findIndex((doc) => doc.id === did);
    if (idx > -1) {
      state.docs[idx].__origParentId = state.docs[idx].parentId ?? null;
      state.trash.push(state.docs[idx]);
      state.docs.splice(idx, 1);
    }
  });
  save();
}

function restoreDoc(id) {
  const idx = state.trash.findIndex((doc) => doc.id === id);
  if (idx === -1) return;

  const doc = state.trash[idx];
  state.trash.splice(idx, 1);

  const desiredParentId =
    doc.__origParentId !== undefined ? doc.__origParentId : doc.parentId;

  if (desiredParentId && !existsInDocs(desiredParentId)) {
    doc.parentId = null;
    doc.__restoredOrphan = true;
    doc.__origParentId = desiredParentId;
    toast("부모가 휴지통에 있어 루트로 복원되었습니다.", "success");
  } else {
    doc.parentId = desiredParentId ?? null;
    delete doc.__restoredOrphan;
  }

  state.docs.push(doc);
  normalizeOrders(doc.parentId);
  reattachOrphansFor(doc.id);
  save();
}

function removeDoc(id) {
  const targetIds = new Set([id, ...descendantsOf(id).map((doc) => doc.id)]);
  for (let i = state.trash.length - 1; i >= 0; i--) {
    if (targetIds.has(state.trash[i].id)) state.trash.splice(i, 1);
  }
  save();
}

function moveDoc(srcId, targetId, pos) {
  if (!srcId || !targetId || srcId === targetId) return;

  if (isDescendant(targetId, srcId)) return;

  const src = findDoc(srcId);
  const tgt = findDoc(targetId);
  if (!src || !tgt) return;

  if (pos === "inside") {
    const oldParent = src.parentId;
    src.parentId = tgt.id;
    src.order = maxOrder(tgt.id);
    normalizeOrders(oldParent);
    normalizeOrders(tgt.id);
  } else {
    const newParent = tgt.parentId;
    const oldParent = src.parentId;
    src.parentId = newParent;
    src.order = pos === "before" ? tgt.order - 0.5 : tgt.order + 0.5;
    normalizeOrders(newParent);
    normalizeOrders(oldParent);
  }

  src.updatedAt = Date.now();
  save();
}

function normalizeOrders(parentId) {
  const list = childrenOf(parentId);
  list.forEach((doc, index) => {
    doc.order = index;
  });
}

function descendantsOf(id) {
  const res = [];
  const walk = (pid) => {
    state.docs
      .filter((doc) => doc.parentId === pid)
      .forEach((doc) => {
        res.push(doc);
        walk(doc.id);
      });
  };
  walk(id);
  return res;
}

function reattachOrphansFor(parentId) {
  let changed = false;
  state.docs.forEach((doc) => {
    if (doc.__restoredOrphan && doc.__origParentId === parentId) {
      doc.parentId = parentId;
      delete doc.__restoredOrphan;
      changed = true;
    }
  });
  if (changed) {
    normalizeOrders(parentId);
  }
}

//  ===============================================
//  DOM Helpers
//  ===============================================

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function el(tag, opts = {}) {
  const element = document.createElement(tag);
  Object.assign(element, opts);
  return element;
}

function toast(msg, type = "") {
  const wrap = $("#toasts");
  if (!wrap) return;
  const toast = el("div", { className: `toast ${type}` });
  toast.textContent = msg;
  wrap.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 1800);
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

//  Layout refs
const sidebar = $("#sidebar");
const collapseBtn = $("#collapseBtn");
const resizeHandle = $("#resizeHandle");
const menuBtn = $("#menuBtn");
const sidebarPeekBtn = $("#sidebarPeekBtn");
const docListRoot = $("#docListRoot");
const breadcrumbs = $("#breadcrumbs");
const starBtn = $("#starBtn");
const newChildBtn = $("#newChildBtn");
