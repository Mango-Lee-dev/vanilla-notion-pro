// =============================================================
// Mini Notion
// -------------------------------------------------------------
// ✅ 구성: [상태/스토리지] → [테마] → [영속화] → [사이드바 폭/반응형] → [트리 렌더] →
// [드롭다운/인라인 이름변경] → [드래그앤드롭] → [라우팅] → [에디터/툴바]
// [이모지] → [즐겨찾기/새 하위] → [루트 추가] → [휴지통] → [즐겨찾기 모달]
// [퀵서치] → [설정/테마/내보내기/가져오기] → [컨펌 모달] → [단축키] → [init]
// =============================================================

// =====================
// Storage / State
// =====================
// - 앱의 모든 데이터는 메모리 state에 올라가며, 주요 변경 시 localStorage에 저장됩니다.
// - 문서 트리는 parentId + order 로 계층/정렬이 유지됩니다.
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
  docs: [], // 전체 문서(트리)
  trash: [], // 휴지통으로 이동한 문서들
  expanded: {}, // { [docId]: true } 펼침 상태 캐시
  activeId: null, // 현재 열려 있는 문서 id
  isMobile: matchMedia("(max-width:768px)").matches, // 반응형 플래그
};

// =====================
// Theme (Light/Dark) – explicit override via data-theme
// =====================
// - UI 테마는 <html data-theme="light|dark"> 속성으로 제어합니다.
// - 시스템 모드에 맞추는 대신, 사용자가 명시적으로 토글(설정)하도록 했습니다.
const THEME_KEY = "vnotion:theme"; // 'light' | 'dark'

function applyTheme(theme) {
  // DOM 루트에 data-theme를 설정 → CSS 변수들이 즉시 교체됨
  document.documentElement.setAttribute("data-theme", theme);
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {}
}

function loadTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch (e) {}
  // 기본값은 다크 테마. (원한다면 prefers-color-scheme으로 자동화 가능)
  return "dark";
}
// 부팅 시 현재 테마를 로드 후 즉시 적용
let currentTheme = loadTheme();
applyTheme(currentTheme);

// =====================
// Persistence & helpers (영속화 + 유틸)
// =====================
// - load(): localStorage → state 복원(없으면 defaultDocs 사용)
// - save(): state → localStorage 저장
// - childrenOf/findDoc/maxOrder 등은 문서 트리 계산 유틸
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  } catch (e) {
    console.warn("Failed to load, using defaults", e);
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

function normalizeOrders(pid) {
  // 동일 부모 아래에서 order를 0,1,2…로 재정렬하여 간격/소수점 정렬을 정리
  const list = childrenOf(pid);
  list.forEach((d, i) => {
    d.order = i;
  });
}

function uid() {
  // 간단한 랜덤 id 생성기(충돌 위험은 매우 낮으나 실서비스면 nanoid 등 사용 권장)
  return Math.random().toString(36).slice(2, 11);
}

function childrenOf(pid) {
  // 주어진 부모 아래의 자식들을 정렬 규칙대로 반환
  return state.docs
    .filter((d) => d.parentId === pid)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

function findDoc(id) {
  return state.docs.find((d) => d.id === id);
}

function maxOrder(pid) {
  // 새로 추가될 아이템의 기본 order(맨 뒤)를 구함
  const kids = childrenOf(pid);
  return kids.length ? Math.max(...kids.map((k) => k.order)) + 1 : 0;
}

function existsInDocs(id) {
  return !!findDoc(id);
}

function isDescendant(id, maybeAncestorId) {
  // id 문서가 maybeAncestorId의 하위(자손)인지 검사 → 자기 하위로 드롭 방지에 사용
  if (!id || !maybeAncestorId) return false;
  let cur = findDoc(id);
  while (cur && cur.parentId) {
    if (cur.parentId === maybeAncestorId) return true;
    cur = findDoc(cur.parentId);
  }
  return false;
}

function createDoc({ title = "Untitled", parentId = null, afterId = null }) {
  // 새 문서 생성: 같은 부모 내 원하는 위치(afterId 바로 뒤)에 0.5 간격 order로 삽입 → normalizeOrders로 정리
  const id = uid();
  let order = maxOrder(parentId);
  if (afterId) {
    const sibs = childrenOf(parentId);
    const idx = sibs.findIndex((s) => s.id === afterId);
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
  // 특정 문서의 일부 필드만 부분 업데이트 + updatedAt 갱신
  const d = findDoc(id);
  if (!d) return;
  Object.assign(d, patch, { updatedAt: Date.now() });
  save();
}

function archiveDoc(id) {
  // 삭제(휴지통으로 이동): 자신과 모든 자손을 찾아 docs → trash로 옮김
  const toArchive = [id, ...descendantsOf(id).map((d) => d.id)];
  toArchive.forEach((did) => {
    const idx = state.docs.findIndex((x) => x.id === did);
    if (idx > -1) {
      // 복원을 위해 원래 부모를 보존
      state.docs[idx].__origParentId = state.docs[idx].parentId ?? null;
      state.trash.push(state.docs[idx]);
      state.docs.splice(idx, 1);
    }
  });
  save();
}

function restoreDoc(id) {
  // 휴지통 복원: 원래 부모가 존재하면 붙이고, 부모가 아직 휴지통이면 루트로 복원 + 고아 플래그
  const idx = state.trash.findIndex((d) => d.id === id);
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
  // 부모가 돌아왔을 때 기다리던 고아들을 재부착
  reattachOrphansFor(doc.id);
  save();
}

function removeDoc(id) {
  // 휴지통에서 영구 삭제(자손 포함)
  const targetIds = new Set([id, ...descendantsOf(id).map((d) => d.id)]);
  for (let i = state.trash.length - 1; i >= 0; i--) {
    if (targetIds.has(state.trash[i].id)) state.trash.splice(i, 1);
  }
  save();
}

function moveDoc(srcId, targetId, pos) {
  // 드래그앤드롭 핵심 로직: before/after/inside 위치에 맞게 parentId/order 재배치
  if (!srcId || !targetId || srcId === targetId) return;
  if (isDescendant(targetId, srcId)) return; // 자기 하위로 이동 금지

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
    const newParent = tgt.parentId ?? null;
    const oldParent = src.parentId;
    src.parentId = newParent;
    // 중간 지점(0.5 간격)으로 먼저 넣고, normalizeOrders로 정리
    src.order = pos === "before" ? tgt.order - 0.5 : tgt.order + 0.5;
    console.log("src.order: ", src.order);
    normalizeOrders(newParent);
    normalizeOrders(oldParent);
  }
  src.updatedAt = Date.now();
  save();
}

function descendantsOf(id) {
  // 깊이 우선으로 모든 자손을 수집 (휴지통 이동/삭제 등에 사용)
  const res = [];
  const walk = (pid) => {
    state.docs
      .filter((d) => d.parentId === pid)
      .forEach((c) => {
        res.push(c);
        walk(c.id);
      });
  };
  walk(id);
  return res;
}

function reattachOrphansFor(parentId) {
  // 어떤 부모가 복원되면, 그 부모를 기다리던 고아(__restoredOrphan)들을 자동으로 재부착
  let changed = false;
  state.docs.forEach((d) => {
    if (d.__restoredOrphan && d.__origParentId === parentId) {
      d.parentId = parentId;
      delete d.__restoredOrphan;
      changed = true;
    }
  });
  if (changed) {
    normalizeOrders(parentId);
  }
}

// =====================
// DOM helpers & UI
// =====================
// - 간단한 셀렉터/생성 유틸과 토스트, 날짜 포맷 등 공통 UI 도우미
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function el(tag, opts = {}) {
  const e = document.createElement(tag);
  Object.assign(e, opts);
  return e;
}

function toast(msg, type = "") {
  // 우측 하단 토스트 알림 (일회성 UX 피드백)
  const wrap = $("#toasts");
  if (!wrap) return;
  const t = el("div", { className: `toast ${type}` });
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 200);
  }, 1800);
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

// Layout refs (자주 쓰는 DOM 요소 캐시)
const sidebar = $("#sidebar");
const collapseBtn = $("#collapseBtn");
const resizeHandle = $("#resizeHandle");
const menuBtn = $("#menuBtn");
const sidebarPeekBtn = $("#sidebarPeekBtn");
const docListRoot = $("#docListRoot");
const breadcrumbs = $("#breadcrumbs");
const starBtn = $("#starBtn");
const newChildBtn = $("#newChildBtn");

// ---- Sidebar width memory (collapse/restore) ----
// - 사이드바 폭은 CSS 변수 --sidebar-w 로 제어하며, 마지막 폭을 localStorage에 저장
const LS_LAST_WIDTH_KEY = "vnotion:lastSidebarWidth";
let lastSidebarWidth = null;

function readLastWidth() {
  try {
    const raw = localStorage.getItem(LS_LAST_WIDTH_KEY);
    if (raw) {
      const n = parseFloat(raw);
      if (!isNaN(n)) lastSidebarWidth = n;
    }
  } catch (e) {}
}

function writeLastWidth(w) {
  lastSidebarWidth = w;
  try {
    localStorage.setItem(LS_LAST_WIDTH_KEY, String(w));
  } catch (e) {}
}

function getCurrentSidebarWidth() {
  const sb = document.querySelector("#sidebar");
  if (!sb) return null;
  const v = parseFloat(getComputedStyle(sb).width || "0");
  return isNaN(v) ? null : v;
}

function defaultSidebarWidth() {
  // 모바일에서는 약간 넓게(280), 데스크톱은 260 — 초기 스냅 기준
  return window.matchMedia("(max-width:768px)").matches ? 280 : 260;
}

readLastWidth();

// ---- Width setters & animation ----
function setSidebarWidth(px) {
  // CSS 변수로 즉시 반영 (레이아웃이 이 변수에 의존)
  document.documentElement.style.setProperty("--sidebar-w", px + "px");
}

function animateSidebarWidth(toPx, duration = 300) {
  // 폭 변화를 부드럽게 보간 (초기/복원/더블클릭 스냅 시 사용)
  const fromPx = getCurrentSidebarWidth() || 0;
  if (fromPx === toPx) {
    setSidebarWidth(toPx);
    return;
  }
  const start = performance.now();
  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    const cur = fromPx + (toPx - fromPx) * progress;
    setSidebarWidth(cur);
    if (progress < 1) requestAnimationFrame(frame);
    else setSidebarWidth(toPx);
  }
  requestAnimationFrame(frame);
}

// ---- Collapse & Reset ----
function collapse() {
  // 접기: 현재 폭을 저장해두고 CSS 변수를 0으로 애니메이션
  const cur = getCurrentSidebarWidth();
  if (cur && cur > 0) writeLastWidth(cur);
  sidebar.classList.add("is-collapsed");
  animateSidebarWidth(0);
  syncMenuBtnVisibility();
}

function resetWidth() {
  // 펼치기: 마지막 사용자 선호 폭(lastSidebarWidth) 또는 기본 폭으로 복원
  sidebar.classList.remove("is-collapsed");
  const remembered =
    lastSidebarWidth && lastSidebarWidth > 0
      ? lastSidebarWidth
      : defaultSidebarWidth();
  animateSidebarWidth(remembered);
  syncMenuBtnVisibility();
}

// Show/hide navbar hamburger based on state
function syncMenuBtnVisibility() {
  // 모바일이거나 사이드바가 접힌 상태면 상단 햄버거 버튼 노출
  if (!menuBtn) return;
  const show = state.isMobile || sidebar.classList.contains("is-collapsed");
  menuBtn.style.display = show ? "grid" : "none";
}

collapseBtn?.addEventListener("click", () => {
  collapse();
  syncMenuBtnVisibility();
});

menuBtn?.addEventListener("click", () => {
  resetWidth();
  syncMenuBtnVisibility();
});

sidebarPeekBtn?.addEventListener("click", () => {
  resetWidth();
  syncMenuBtnVisibility();
});

// Drag resize

// Drag resize (사이드바 드래그 리사이즈)
let isResizing = false;
resizeHandle?.addEventListener("mousedown", (e) => {
  // 더블클릭: 기본 폭으로 스냅 or 접힌 상태면 펼치기
  if (e.detail === 2) {
    e.preventDefault();
    if (sidebar.classList.contains("is-collapsed")) {
      resetWidth();
    } else {
      const px = defaultSidebarWidth();
      animateSidebarWidth(px);
      writeLastWidth(px);
    }
    isResizing = false;
    syncMenuBtnVisibility();
    return;
  }
  isResizing = true;
  e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (!isResizing) return;
  let w = e.clientX; // 좌상단 기준 X좌표가 사이드바 폭이 됨
  // 최소/최대 폭 제한으로 UX 안정화
  if (w < 220) w = 220;
  if (w > 420) w = 420;
  sidebar.classList.remove("is-collapsed");
  setSidebarWidth(w); // 실시간 반영(애니메이션 없이)
  writeLastWidth(w); // 사용자의 선호 폭 저장
});

document.addEventListener("mouseup", () => {
  isResizing = false;
});

// Media query에 따른 접힘/펼침 전환과 초기 세팅
matchMedia("(max-width:768px)").addEventListener("change", (ev) => {
  state.isMobile = ev.matches;
  if (state.isMobile) {
    collapse();
  } else {
    resetWidth();
  }
  syncMenuBtnVisibility();
});
if (state.isMobile) {
  collapse();
} else {
  resetWidth();
}
syncMenuBtnVisibility();

// 화면 회전/리사이즈 시 보완 처리
window.addEventListener("orientationchange", () => {
  if (state.isMobile) {
    setSidebarWidth(0);
  }
});

window.addEventListener("resize", () => {
  const vw = window.innerWidth;
  if (vw < 768 && !sidebar.classList.contains("is-collapsed")) {
    collapse();
  }
  syncMenuBtnVisibility();
});

// =====================
// Render: Trees (사이드바 문서 트리 렌더링)
// =====================
function renderTrees() {
  renderTree();
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
  roots.forEach((d) => docListRoot.appendChild(renderNode(d, 0)));
}

function renderNode(doc, level) {
  const wrap = el("div");
  const row = el("div", { className: "tree-row", draggable: true });
  row.dataset.id = doc.id;
  if (state.activeId === doc.id) row.classList.add("active");
  row.style.paddingLeft = 12 + level * 12 + "px";

  const caretBtn = el("div", { className: "caret", title: "Expand/collapse" });
  const hasChildren = childrenOf(doc.id).length > 0;
  caretBtn.textContent = hasChildren
    ? state.expanded[doc.id]
      ? "▾"
      : "▸"
    : "";
  if (hasChildren) {
    caretBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.expanded[doc.id] = !state.expanded[doc.id];
      renderTrees();
    });
  }

  const iconCls = "doc-icon " + (doc.icon ? "has-icon" : "no-icon");
  const icon = el("div", {
    className: iconCls,
    textContent: doc.icon ? doc.icon : "∅",
  });

  const labelCls = "label " + (doc.icon ? "has-icon" : "no-icon");
  const label = el("div", {
    className: labelCls,
    textContent: doc.title,
    style: "flex:1 1 auto; min-width:0;",
  });
  label.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    inlineRename(doc.id, label);
  });

  const actions = el("div", { className: "tree-actions" });
  const addBtn = el("div", {
    className: "icon-btn ghost",
    title: "Add child",
    textContent: "＋",
  });

  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = createDoc({ title: "Untitled", parentId: doc.id });
    state.expanded[doc.id] = true;
    toast("New note created!", "success");
    navigateTo(id);
  });

  const ddBtn = el("div", {
    className: "dropdown-btn ghost",
    title: "More",
    textContent: "⋯",
  });

  ddBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDropdownMenu(ddBtn, doc, label);
  });

  actions.append(ddBtn, addBtn);
  row.append(caretBtn, icon, label, actions);

  row.addEventListener("click", () => navigateTo(doc.id));

  // DnD
  row.addEventListener("dragstart", handleDragStart);
  row.addEventListener("dragover", handleDragOver);
  row.addEventListener("dragleave", handleDragLeave);
  row.addEventListener("drop", handleDrop);
  row.addEventListener("dragend", handleDragEnd);

  wrap.append(row);

  if (state.expanded[doc.id]) {
    const kidsWrap = el("div", { className: "children" });
    childrenOf(doc.id).forEach((ch) =>
      kidsWrap.appendChild(renderNode(ch, level + 1))
    );
    wrap.append(kidsWrap);
  }
  return wrap;
}

// Body-portal dropdown (트리 행의 더보기 메뉴)
let currentDropdown = null;

function openDropdownMenu(anchorEl, doc, labelEl) {
  closeDropdownMenu(); //  이전 메뉴 닫아주는 로직
  const rect = anchorEl.getBoundingClientRect(); //  element의 크기를 가져옴 -> dropdown 메뉴의 위치를 계산하기 위해 사용
  const menu = el("div", { className: "dropdown-menu open" });
  const miRename = el("div", {
    className: "menu-item",
    textContent: "Rename (F2)",
  });
  const miStar = el("div", {
    className: "menu-item",
    textContent: doc.starred ? "Unstar" : "Add to favorites",
  });

  const miDel = el("div", {
    className: "menu-item",
    textContent: "Delete (move to trash)",
  });
  const sep = el("div", { className: "menu-sep" });
  const editedBy = el("div", { className: "menu-item muted" });
  editedBy.textContent = "Last edited by: Guest";

  miRename.addEventListener("click", (e) => {
    e.stopPropagation();
    inlineRename(doc.id, labelEl);
    closeDropdownMenu();
  });

  // 즐겨찾기 버튼 클릭 시 상태 변경 -> renderTrees() 호출하여 트리 렌더링 -> 즐겨찾기 버튼 텍스트 변경 -> 메뉴 닫기
  miStar.addEventListener("click", (e) => {
    e.stopPropagation();
    updateDoc(doc.id, { starred: !doc.starred });
    if (state.activeId === doc.id) {
      const d = findDoc(doc.id);
      starBtn.textContent = d.starred ? "★" : "☆";
    }
    renderTrees();
    closeDropdownMenu();
  });

  miDel.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmModal(`Move “${doc.title}” and its subpages to Trash?`, () => {
      archiveDoc(doc.id);
      toast("Note moved to trash!");
      if (state.activeId === doc.id) navigateTo(null);
      renderTrees();
      renderTrash();
    });
    closeDropdownMenu();
  });

  menu.append(miRename, miStar, miDel, sep, editedBy);
  document.body.appendChild(menu);
  const top = rect.bottom + 6;
  const left = Math.min(rect.left, window.innerWidth - 260); //  메뉴의 위치를 계산하기 위해 사용 -> 메뉴가 화면 왼쪽에 위치하도록 함
  menu.style.top = top + "px";
  menu.style.left = left + "px";

  currentDropdown = menu;
}

function closeDropdownMenu() {
  if (currentDropdown) {
    currentDropdown.remove();
    currentDropdown = null;
  }
}
document.addEventListener("click", closeDropdownMenu);

function inlineRename(id, labelEl) {
  // 라벨을 인풋으로 교체하여 즉시 이름 변경(UI 인라인 편집)
  const doc = findDoc(id);
  if (!doc) return;
  const input = el("input", { value: doc.title, className: "label-edit" });
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
  input.addEventListener("blur", () => {
    const title = input.value.trim() || "Untitled";
    updateDoc(id, { title });
    renderTrees();
    if (state.activeId === id) {
      $("#titleInput").value = title;
      updateDocMeta();
    }
  });
  labelEl.replaceWith(input);
  input.focus();
  input.select();
}

// DnD handlers (트리 행 드래그 이동 UX)
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
  $$(".tree-row").forEach((r) =>
    r.classList.remove("dragover-top", "dragover-bottom", "dragover-inside")
  );
  dragSrcId = null;
}

// =====================
// Routing & content (Hash 기반 라우팅)
// =====================
function navigateTo(id) {
  // URL 해시에 현재 문서 id를 반영 → 새로고침/뒤로가기와 자연스럽게 연동
  if (!id) {
    location.hash = "#/documents";
  } else {
    location.hash = "#/documents/" + id;
  }
}

function syncFromLocation() {
  // 해시에서 id를 파싱하여 상태를 동기화하고, 트리/페이지를 렌더
  const m = location.hash.match(/#\/documents\/?([\w-]+)?/);
  const id = m && m[1] ? m[1] : null;
  state.activeId = id;
  renderTrees();
  renderPage();
  save();
}
window.addEventListener("hashchange", syncFromLocation);

function pathOf(id) {
  // 현재 문서의 루트까지 경로(빵크럼용)
  const path = [];
  let cur = findDoc(id);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? findDoc(cur.parentId) : null;
  }
  return path;
}

// =====================
// Editor / Toolbar (콘텐츠 편집 및 서식 버튼)
// =====================

const emojiPicker = $("#emojiPicker");
const emojiGrid = $("#emojiGrid");

const titleInput = $("#titleInput");
const docMeta = $("#docMeta");
const editor = $("#editor");

function renderPage() {
  if (!breadcrumbs || !titleInput || !editor || !starBtn || !docMeta) return;
  if (!state.activeId) {
    breadcrumbs.textContent = "No page selected";
    titleInput.value = "Welcome 👋";
    docMeta.textContent = "—";
    editor.innerHTML =
      "<p>좌측에서 문서를 선택하거나 새로운 페이지를 만들어 보세요.</p>";
    starBtn.textContent = "☆";
    return;
  }
  const doc = findDoc(state.activeId);
  if (!doc) {
    breadcrumbs.textContent = "Unknown page";
    titleInput.value = "Not found";
    editor.innerHTML = "<p>이 문서는 존재하지 않습니다.</p>";
    return;
  }
  const path = pathOf(doc.id)
    .map((d) => d.title)
    .join(" / ");
  breadcrumbs.textContent = path;
  titleInput.value = doc.title;
  editor.innerHTML = doc.content || "<p></p>";
  starBtn.textContent = doc.starred ? "★" : "☆";
  updateDocMeta();
}

function updateDocMeta() {
  // 생성/수정 시간 표시. (학습용으로 간단 표기)
  if (!docMeta) return;
  const d = state.activeId ? findDoc(state.activeId) : null;
  const ld = $("#lastEdited");
  if (ld) ld.textContent = new Date().toLocaleDateString();
  if (!d) {
    docMeta.textContent = "—";
    return;
  }
  docMeta.textContent = `Created ${fmtDate(d.createdAt)} · Updated ${fmtDate(
    d.updatedAt
  )}`;
}

// 툴바 버튼 클릭 → execCommand 기반 서식 적용
$("#toolbar")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const cmd = btn.dataset.cmd;
  const fmt = btn.dataset.format;
  editor.focus();

  if (cmd) {
    document.execCommand(cmd, false, null);
    saveEditor();
    return;
  }

  if (fmt) {
    document.execCommand("formatBlock", false, fmt === "P" ? "P" : fmt);
    saveEditor();
    return;
  }
});

$("#bulletsBtn")?.addEventListener("click", () => {
  editor.focus();
  document.execCommand("insertUnorderedList");
  saveEditor();
});

$("#numbersBtn")?.addEventListener("click", () => {
  editor.focus();
  document.execCommand("insertOrderedList");
  saveEditor();
});

$("#codeBtn")?.addEventListener("click", () => {
  editor.focus();
  document.execCommand("formatBlock", false, "PRE");
  saveEditor();
});

$("#quoteBtn")?.addEventListener("click", () => {
  editor.focus();
  document.execCommand("formatBlock", false, "BLOCKQUOTE");
  saveEditor();
});

$("#todoBtn")?.addEventListener("click", () => {
  // 간단한 To-do 블록 삽입 (체크박스 + 라벨)
  const box = document.createElement("div");
  box.innerHTML = '<label><input type="checkbox"> <span>To-do</span></label>';
  const sel = window.getSelection();
  if (!sel.rangeCount) {
    editor.appendChild(box);
  } else {
    sel.getRangeAt(0).insertNode(box);
  }
  saveEditor();
});

let saveTimer = null;

function saveEditorDebounced() {
  // 입력시 너무 자주 저장하지 않도록 400ms 디바운스
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

titleInput?.addEventListener("input", () => {
  // 제목 입력 시 트리 라벨과 메타도 동기화
  if (!state.activeId) return;
  const t = titleInput.value.trim() || "Untitled";
  updateDoc(state.activeId, { title: t });
  renderTrees();
  updateDocMeta();
});

// =====================
// Emoji picker (portal)
// =====================
const EMOJI = [
  "📄",
  "📘",
  "📙",
  "📗",
  "📕",
  "📚",
  "🧠",
  "🧰",
  "🧪",
  "🧭",
  "🗂️",
  "📝",
  "🧾",
  "📊",
  "📈",
  "📎",
  "📌",
  "⭐",
  "⚡",
  "🔥",
  "✅",
  "🧩",
  "🎯",
  "🔧",
  "🔗",
  "💡",
  "🚀",
  "🌟",
  "🛠️",
  "🗒️",
  "🧱",
  "🪄",
  "🗃️",
  "🧭",
  "💼",
  "🗓️",
];

function openEmojiPicker() {
  const btn = document.getElementById("iconBtn");
  if (!btn || !emojiPicker) return;
  const rect = btn.getBoundingClientRect();
  emojiPicker.style.left = Math.min(rect.left, window.innerWidth - 340) + "px";
  emojiPicker.style.top = rect.bottom + 8 + "px";
  emojiPicker.classList.add("open");
}

function closeEmojiPicker() {
  emojiPicker?.classList.remove("open");
}

document.getElementById("iconBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  buildEmojiGrid();
  openEmojiPicker();
});

document.addEventListener("click", (e) => {
  if (
    emojiPicker &&
    !emojiPicker.contains(e.target) &&
    e.target.id !== "iconBtn"
  )
    closeEmojiPicker();
});

function buildEmojiGrid() {
  if (!emojiGrid) return;
  emojiGrid.innerHTML = "";
  EMOJI.forEach((em) => {
    const b = el("button", { textContent: em });
    b.addEventListener("click", () => {
      if (state.activeId) {
        updateDoc(state.activeId, { icon: em });
        const btn = document.getElementById("iconBtn");
        if (btn) btn.textContent = em;
        renderTrees();
      }
      closeEmojiPicker();
    });
    emojiGrid.appendChild(b);
  });
}

// Star (favorite)
starBtn?.addEventListener("click", () => {
  if (!state.activeId) return;
  const d = findDoc(state.activeId);
  updateDoc(state.activeId, { starred: !d.starred });
  const nd = findDoc(state.activeId);
  starBtn.textContent = nd.starred ? "★" : "☆";
  renderTrees();
});

// New subpage button
newChildBtn?.addEventListener("click", () => {
  const pid = state.activeId || null;
  const id = createDoc({ title: "Untitled", parentId: pid });
  if (pid) state.expanded[pid] = true;
  toast("New subpage created!", "success");
  navigateTo(id);
});

// =====================
// Root add-page actions (루트에 새 페이지 추가)
// =====================
const actionAddPage = document.getElementById("actionAddPage");
const actionCreateRoot = document.getElementById("actionCreateRoot");
[actionAddPage, actionCreateRoot].forEach((btn) => {
  if (btn) {
    btn.addEventListener("click", () => {
      const id = createDoc({ title: "Untitled", parentId: null });
      toast("New page created!", "success");
      navigateTo(id);
    });
  }
});

// =====================
// Trash popover (portal)
// =====================
const trashTrigger = $("#trashTrigger");
const trashPopover = $("#trashPopover");

function positionTrashPopover() {
  // 트리거 위치/뷰포트에 따라 팝오버를 적절한 좌표에 배치
  if (!trashTrigger || !trashPopover) return;
  const rect = trashTrigger.getBoundingClientRect();
  const bottom = window.matchMedia("(max-width:768px)").matches;
  if (bottom) {
    trashPopover.style.left =
      Math.min(rect.left, window.innerWidth - 340) + "px";
    trashPopover.style.top = rect.bottom + 8 + "px";
  } else {
    trashPopover.style.left =
      Math.min(rect.right + 8, window.innerWidth - 340) + "px";
    trashPopover.style.top = rect.top + "px";
  }
}

function toggleTrash() {
  if (!trashPopover) return;
  if (trashPopover.classList.contains("open")) {
    trashPopover.classList.remove("open");
    return;
  }
  positionTrashPopover();
  trashPopover.classList.add("open");
}

trashTrigger?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleTrash();
});

window.addEventListener("resize", () => {
  if (trashPopover?.classList.contains("open")) positionTrashPopover();
});

document.addEventListener("click", (e) => {
  if (
    trashPopover &&
    !trashPopover.contains(e.target) &&
    e.target !== trashTrigger
  )
    trashPopover.classList.remove("open");
});

function renderTrash() {
  // 휴지통 목록 필터링/렌더
  const list = $("#trashList");

  if (!list) return;
  const search = ($("#trashSearch")?.value || "").trim().toLowerCase();
  list.innerHTML = "";
  const filtered = state.trash.filter((d) =>
    d.title.toLowerCase().includes(search)
  );

  if (filtered.length === 0) {
    const p = el("p", {
      className: "muted",
      textContent: "No documents found",
    });
    list.appendChild(p);
    return;
  }

  filtered.forEach((doc) => {
    const row = el("div", { className: "trash-row" });
    const title = el("span", {
      textContent: doc.title,
      style: "flex:1 1 auto; min-width:0",
    });

    const info = el("span", {
      className: "muted",
      textContent:
        doc.__origParentId && !existsInDocs(doc.__origParentId)
          ? "→ 복원 시 루트로 이동"
          : "",
    });

    const acts = el("div", { className: "trash-actions" });
    const restore = el("div", {
      className: "icon-btn",
      title: "Restore",
      textContent: "↩",
    });

    const del = el("div", {
      className: "icon-btn",
      title: "Delete permanently",
      textContent: "🗑️",
    });

    restore.addEventListener("click", (e) => {
      e.stopPropagation();
      restoreDoc(doc.id);
      renderTrees();
      renderTrash();
    });

    del.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmModal(`Delete “${doc.title}” permanently?`, () => {
        removeDoc(doc.id);
        toast("Note deleted!", "error");
        renderTrash();
      });
    });

    acts.append(info, restore, del);
    row.append(title, acts);
    row.addEventListener("click", () => {
      trashPopover?.classList.remove("open");
      navigateTo(doc.id);
    });
    list.appendChild(row);
  });
}

document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "trashSearch") renderTrash();
});

// =====================
// Favorites modal (즐겨찾기 모달)
// =====================

const favoritesOverlay = $("#favoritesOverlay");
const favoritesListModal = $("#favoritesListModal");
const openFavoritesModalBtn = $("#openFavoritesModal");
const favoritesCloseBtn = $("#favoritesClose");

function openFavoritesModal() {
  buildFavoritesModal();
  if (favoritesOverlay) favoritesOverlay.style.display = "grid";
}

function closeFavoritesModal() {
  if (favoritesOverlay) favoritesOverlay.style.display = "none";
}

function buildFavoritesModal() {
  if (!favoritesListModal) return;
  favoritesListModal.innerHTML = "";

  const favs = state.docs
    .filter((d) => d.starred)
    .sort((a, b) => a.title.localeCompare(b.title));

  if (favs.length === 0) {
    favoritesListModal.innerHTML =
      '<div class="muted" style="padding:12px">No favorites yet</div>';
    return;
  }

  favs.forEach((doc) => {
    const row = el("div", { className: "fav-row" });
    const ico = el("div", {
      className: "doc-icon " + (doc.icon ? "has-icon" : "no-icon"),
      textContent: doc.icon || "∅",
    });
    const title = el("div", { textContent: doc.title, style: "flex:1" });
    const acts = el("div", { className: "fav-actions" });
    const unstar = el("div", {
      className: "icon-btn",
      title: "Unstar",
      textContent: "☆",
    });

    unstar.addEventListener("click", (e) => {
      e.stopPropagation();
      updateDoc(doc.id, { starred: false });
      if (state.activeId === doc.id) {
        const d = findDoc(doc.id);
        if (starBtn) starBtn.textContent = d.starred ? "★" : "☆";
      }
      renderTrees();
      buildFavoritesModal();
    });

    row.append(ico, title, acts);
    acts.append(unstar);
    row.addEventListener("click", () => {
      closeFavoritesModal();
      navigateTo(doc.id);
    });
    favoritesListModal.appendChild(row);
  });
}

openFavoritesModalBtn?.addEventListener("click", openFavoritesModal);
favoritesCloseBtn?.addEventListener("click", closeFavoritesModal);
favoritesOverlay?.addEventListener("click", (e) => {
  if (e.target === favoritesOverlay) closeFavoritesModal();
});

document.addEventListener("keydown", (e) => {
  if (
    favoritesOverlay &&
    favoritesOverlay.style.display === "grid" &&
    e.key === "Escape"
  ) {
    e.preventDefault();
    closeFavoritesModal();
  }
});

// =====================
// Quick Search Modal (제목 기반 빠른 검색)
// =====================

const searchOverlay = $("#searchOverlay");
const searchInput = $("#searchInput");
const searchResults = $("#searchResults");

let searchActiveIndex = -1; // ↑/↓로 현재 선택된 결과 인덱스

function openSearch() {
  if (searchOverlay && searchInput) {
    searchOverlay.style.display = "grid";
    searchInput.value = "";
    renderSearchResults("");
    searchInput.focus();
  }
}

function closeSearch() {
  if (searchOverlay) searchOverlay.style.display = "none";
}

function renderSearchResults(q) {
  if (!searchResults) return;
  const items = state.docs.filter((d) =>
    d.title.toLowerCase().includes(q.toLowerCase())
  );
  searchResults.innerHTML = "";
  items.forEach((d, i) => {
    const row = el("div", { className: "trash-row" });
    row.innerHTML = `<span>${d.icon || "📄"} ${d.title}</span>`;
    row.addEventListener("click", () => {
      closeSearch();
      navigateTo(d.id);
    });
    if (i === searchActiveIndex) row.style.background = "var(--panel-3)";
    searchResults.appendChild(row);
  });
}

searchInput?.addEventListener("input", () => {
  searchActiveIndex = -1;
  renderSearchResults(searchInput.value);
});

searchInput?.addEventListener("keydown", (e) => {
  const items = searchResults?.children || [];
  if (e.key === "Escape") {
    e.preventDefault();
    closeSearch();
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    searchActiveIndex = Math.min(items.length - 1, searchActiveIndex + 1);
    renderSearchResults(searchInput.value);
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    searchActiveIndex = Math.max(0, searchActiveIndex - 1);
    renderSearchResults(searchInput.value);
  }
  if (e.key === "Enter") {
    e.preventDefault();
    if (items.length && searchActiveIndex >= 0) {
      items[searchActiveIndex].click();
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (
    searchOverlay &&
    searchOverlay.style.display === "grid" &&
    e.key === "Escape"
  ) {
    e.preventDefault();
    closeSearch();
  }
});

searchOverlay?.addEventListener("click", (e) => {
  if (e.target === searchOverlay) closeSearch();
});

// 사이드바/네비바에 중복 ID(actionSearch)가 있으므로 querySelectorAll로 모두 바인딩
// (실제 서비스면 id 중복 대신 data-action 같은 속성이 더 안전)
document.querySelectorAll("#actionSearch").forEach((el) => {
  el.addEventListener("click", openSearch);
});

// =====================
// Settings Modal + Theme + Export/Import
// =====================

const settingsOverlay = $("#settingsOverlay");
const themeToggle = $("#themeToggle"); // "Use light theme" 체크박스

function openSettings() {
  // 현재 테마 반영: 'light'면 체크, 'dark'면 체크 해제
  currentTheme = loadTheme();
  if (themeToggle) themeToggle.checked = currentTheme === "light";
  if (settingsOverlay) settingsOverlay.style.display = "grid";
}

// 사이드바/네비바에 중복 ID(actionSettings) → 모두 바인딩
document.querySelectorAll("#actionSettings").forEach((el) => {
  el.addEventListener("click", openSettings);
});

$("#settingsClose")?.addEventListener("click", () => {
  if (settingsOverlay) settingsOverlay.style.display = "none";
});

settingsOverlay?.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) settingsOverlay.style.display = "none";
});

document.addEventListener("keydown", (e) => {
  if (
    settingsOverlay &&
    settingsOverlay.style.display === "grid" &&
    e.key === "Escape"
  ) {
    e.preventDefault();
    settingsOverlay.style.display = "none";
  }
});

// ✔ 라이트/다크 즉시 전환
themeToggle?.addEventListener("change", () => {
  const next = themeToggle.checked ? "light" : "dark";
  currentTheme = next;
  applyTheme(next);
  saveTheme(next);
});

// Export / Import (백업/복원)
$("#exportBtn")?.addEventListener("click", () => {
  const data = localStorage.getItem(STORAGE_KEY) || "{}";
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "notion-export.json";
  a.click();
  URL.revokeObjectURL(url);
});

$("#importFile")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      localStorage.setItem(STORAGE_KEY, reader.result);
      load();
      renderTrees();
      renderPage();
      toast("Import complete", "success");
    } catch (err) {
      toast("Import failed", "error");
    }
  };
  reader.readAsText(file);
});

// =====================
// Confirm modal (확인 다이얼로그)
// =====================

const modalOverlay = $("#modalOverlay");
let modalResolver = null; // 확인 시 실행할 콜백을 보관

function confirmModal(message, onConfirm) {
  const t = $("#modalTitle"),
    m = $("#modalMessage");
  if (t) t.textContent = "Confirm";
  if (m) m.textContent = message;
  if (modalOverlay) modalOverlay.style.display = "flex";
  modalResolver = onConfirm;
}

$("#modalCancel")?.addEventListener("click", () => {
  if (modalOverlay) modalOverlay.style.display = "none";
  modalResolver = null;
});

$("#modalConfirm")?.addEventListener("click", () => {
  if (modalOverlay) modalOverlay.style.display = "none";
  if (modalResolver) modalResolver();
  modalResolver = null;
});

// =====================
// Keyboard shortcuts (핫키)
// =====================

document.addEventListener("keydown", (e) => {
  const meta = e.ctrlKey || e.metaKey;

  if (meta && e.key.toLowerCase() === "k") {
    // ⌘/Ctrl + K → 퀵서치
    e.preventDefault();
    openSearch();
  }

  if (meta && e.altKey && e.key.toLowerCase() === "n") {
    // ⌘/Ctrl + Alt + N → 현재 페이지의 하위로 새 문서
    e.preventDefault();
    const pid = state.activeId || null;
    const id = createDoc({ title: "Untitled", parentId: pid });
    if (pid) state.expanded[pid] = true;
    navigateTo(id);
  }

  if (e.key === "F2" && state.activeId) {
    // F2 → 현재 선택 문서 이름 바꾸기(인라인)
    e.preventDefault();
    const row = document.querySelector(
      `.tree-row[data-id="${state.activeId}"]`
    );

    if (row) {
      const label = row.querySelector(".label");
      if (label) inlineRename(state.activeId, label);
    }
  }
});

// =====================
// Init
// =====================

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
  if (ld) ld.textContent = new Date().toLocaleDateString();
  syncMenuBtnVisibility();
}

init();
