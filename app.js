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
