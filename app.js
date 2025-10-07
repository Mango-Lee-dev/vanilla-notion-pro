const emojiPicker = $("#emojiPicker");
const emojiGrid = $("#emojiGrid");
const titleInput = $("#titleInput");
const docMeta = $("#docMeta");
const editor = $("#editor");

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

function renderTrees() {
  renderTree();
  renderFavorites();
}

function renderTree() {
  if (!docListRoot) return;
  docListRoot.innerHTML = "";
  const roots = childrenOf(null);
  if (roots.length === 0) {
    const p = el("p", {
      className: "muted",
      textContent: "No pages available",
    });
    docListRoot.appendChild(p);
  }
  roots.forEach((doc) => {
    docListRoot.appendChild(renderNode(doc, 0));
  });
}

function renderNode(doc, level) {
  const wrap = el("div");
  const row = el("div", {
    className: "tree-row",
    draggable: true,
  });
  row.dataset.id = doc.id;
  if (state.activeId === doc.id) row.classList.add("active");
  row.style.paddingLeft = 12 + level * 12 + "px";

  const careBtn = el("div", { className: "caret", title: "Expand/Collapse" });
  const hasChildren = childrenOf(doc.id).length > 0;
  careBtn.textContent = hasChildren
    ? state.expanded[doc.id]
      ? "▼"
      : "▶"
    : " ";

  if (hasChildren) {
    careBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.expanded[doc.id] = !state.expanded[doc.id];
      renderTrees();
    });
  }

  const iconCls = "doc-icon " + (doc.icon ? "has-icon" : "no-icon");
  const icon = el("div", {
    className: iconCls,
    textContent: doc.icon ? doc.icon : "📄",
  });

  const labelCls = "label" + (doc.icon ? "has-icon" : "no-icon");
  const label = el("div", {
    className: labelCls,
    textContent: doc.title,
    style: "flex:1 1 auto; min-width:0;",
  });
  label.addEventListener("dbclick", (e) => {
    e.stopPropagation();
    inlineRename(doc.id, label);
  });

  const actions = el("div", { className: "tree-actions" });
  const addBtn = el("div", {
    className: "icon-btn ghost",
    title: "Add child",
    textContent: "➕",
  });

  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = createDoc({
      title: "Untitled",
      parentId: doc.id,
    });
    state.expanded[doc.id] = true;
    toast("New page created", "success");
    navigateTo(id);
  });

  const ddBtn = el("div", {
    className: "dropdown-btn ghost",
    title: "More",
    textContent: "...",
  });

  ddBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDropdownMenu(ddBtn, doc, label);
  });

  actions.append(addBtn, ddBtn);

  row.append(careBtn, icon, label, actions);

  row.addEventListener("dragstart", handleDragStart);
  row.addEventListener("dragover", handleDragOver);
  row.addEventListener("dragleave", handleDragLeave);
  row.addEventListener("drop", handleDrop);
  row.addEventListener("dragend", handleDragEnd);

  wrap.append(row);

  if (state.expanded[doc.id]) {
    const kidsWrap = el("div", {
      className: "children",
    });
    childrenOf(doc.id).forEach((kid) => {
      kidsWrap.appendChild(renderNode(kid, level + 1));
    });
    wrap.append(kidsWrap);
  }
  return wrap;
}

let dragSrcId = null;
function handleDragStart(e) {
  dragSrcId = this.dataset.id;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragSrcId);
}

function handleDragOver(e) {
  e.preventDefault();
  const rect = this.getBoundingClientRect();
  const y = e.clientY - rect.top;
  this.classList.remove("dragover-top", "dragover-bottom", "dragover-inside");

  if (y < rect.height * 0.25) {
    this.classList.add("dragover-top");
  } else if (y > rect.height * 0.75) {
    this.classList.add("dragover-bottom");
  } else {
    this.classList.add("dragover-inside");
  }
}

function handleDragLeave() {
  this.classList.remove("dragover-top", "dragover-bottom", "dragover-inside");
}

function handleDrop(e) {
  e.preventDefault();
  const targetId = this.dataset.id;
  const rect = this.getBoundingClientRect();
  const y = e.clientY - rect.top;

  let pos = "inside";
  if (y < rect.height * 0.25) pos = "before";
  else if (y > rect.height * 0.75) pos = "after";

  moveDoc(dragSrcId, targetId, pos);
  this.classList.remove("dragover-top", "dragover-bottom", "dragover-inside");
  renderTrees();
}

function handleDragEnd() {
  $$(".tree-row").forEach((row) =>
    row.classList.remove("dragover-top", "dragover-bottom", "dragover-inside")
  );
  dragSrcId = null;
}

function inlineRename(id, labelEl) {
  const doc = findDoc(id);

  if (!doc) return;

  const input = el("input", {
    value: doc.title,
    className: "label-edit",
  });

  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }

    if (e.key === "Escape") {
      e.preventDefault();
      input.value = doc.title;
      input.blur();
    }
  });

  input.addEventListener("blur", (e) => {
    const title = input.value.trim() || "Untitled";
    updateDoc(id, { title });
    renderTrees();

    if (state.activeId === id) {
      $("#titleInput").value = title;
      updateDocMeta();
    }
  });

  labelEl.appendChild(input);
  input.focus();
  input.select();
}

function navigateTo(id) {
  if (!id) location.hash = "#/documents";
  else location.hash = "#documents/" + id;
}

function syncFromLocation() {
  const m = location.hash.match(/#\/documents\/?([\w-]+)?/);
  const id = m && m[1] ? m[1] : null;
  state.activeId = id;
  renderTrees();
  renderPage();
  save();
}

window.addEventListener("hashchange", syncFromLocation);

function pathOf(id) {
  const path = [];
  let cur = findDoc(id);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? findDoc(cur.parentId) : null;
  }
  return path;
}

function renderPage() {
  if (!breadcrumbs || !titleInput || !editor || !starBtn || !docMeta) return;
  if (!state.activeId) {
    breadcrumbs.textContent = "No Page Selected";
    titleInput.value = "Welcome to Mini Notion";
    docMeta.textContent = "-";
    editor.innerHTML =
      "<p>좌측에서 문서를 선택하거나 새로운 페이지를 만들어 보세요.</p>";
    starBtn.textContent = "☆";
    return;
  }

  const doc = findDoc(state.activeId);
  if (!doc) {
    breadcrumbs.textContent = "Unknown Page";
    titleInput.value = "Not found";
    editor.innerHTML = "<p>존재하지 않는 페이지입니다.</p>";
    return;
  }

  const path = pathOf(doc.activeId)
    .map((d) => d.title)
    .join(" / ");
  breadcrumbs.textContent = path;
  titleInput.value = doc.title;
  editor.innerHTML = doc.content || "<p></p>";
  starBtn.textContent = doc.starred ? "★" : "☆";
  updateDocMeta();
}

function updateDocMeta() {
  if (!docMeta) return;
  const d = state.activeId ? findDoc(state.activeId) : null;
  const ld = $("#lastEdited");
  if (ld) ld.textContent = new Date().toLocaleString();
  if (!d) {
    docMeta.textContent = "-";
    return;
  }

  docMeta.textContent = `Created ${fmtDate(d.createdAt)} • Updated ${fmtDate(
    d.updatedAt
  )}`;
}

function init() {
  load();
  if (state.isMobile) {
    collapse();
  } else {
    resetWidth();
  }
  renderTrees();
  renderTrash();

  if (!location.hash) {
    navigateTo("welcome");
  } else {
    syncFromLocation();
  }

  const ld = $("#lastEdited");
  if (ld) ld.textContent = new Date().toLocaleString();
  syncFromLocation();
}

init();

titleInput.addEventListener("input", (e) => {
  if (!state.activeId) return;
  const t = titleInput.value.trim() || "Untitled";
  updateDoc(state.activeId, { title: t });
  renderTrees();
  updateDocMeta();
});

let saveTimer = null;

function saveEditorDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveEditor, 400);
}

function saveEditor() {
  if (!state.activeId) return;
  const html = editor.innerHTML;
  updateDoc(state.activeId, { content: html });
  updateDocMeta();
}

editor?.addEventListener("input", saveEditorDebounced);
