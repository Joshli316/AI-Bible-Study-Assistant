// API base — Worker URL in production, localhost in dev
const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:8787'
  : 'https://bible-study-api.yellow-longitudinal.workers.dev';

type Lang = 'en' | 'zh';

const i18n: Record<string, Record<Lang, string>> = {
  title: { en: 'Bible Study Assistant', zh: '圣经学习助手' },
  subtitle: { en: 'Search 25 commentary series', zh: '搜索25套注释丛书' },
  searchPlaceholder: { en: 'Search commentaries...', zh: '搜索注释...' },
  searchBtn: { en: 'Search', zh: '搜索' },
  langToggle: { en: '中文', zh: 'English' },
  darkToggle: { en: 'Dark', zh: '深色' },
  lightToggle: { en: 'Light', zh: '浅色' },
  emptyTitle: { en: 'Search Bible Commentaries', zh: '搜索圣经注释' },
  emptyDesc: { en: 'Ask about any verse, topic, or theme across 25 commentary series.', zh: '在25套注释丛书中搜索任何经文、主题或话题。' },
  noResultsTitle: { en: 'No results found', zh: '未找到结果' },
  noResultsDesc: { en: 'Try a different query or adjust your filters.', zh: '尝试不同的搜索词或调整筛选条件。' },
  resultsFor: { en: 'Results for', zh: '搜索结果：' },
  page: { en: 'Page', zh: '页' },
  relevance: { en: 'Relevance', zh: '相关度' },
  allSeries: { en: 'All Series', zh: '所有丛书' },
  allTestaments: { en: 'All Testaments', zh: '新旧约' },
  ot: { en: 'Old Testament', zh: '旧约' },
  nt: { en: 'New Testament', zh: '新约' },
  vectors: { en: 'vectors indexed', zh: '个向量已索引' },
  series: { en: 'commentary series', zh: '套注释丛书' },
  files: { en: 'source files', zh: '个源文件' },
  errorMsg: { en: 'Something went wrong. Please try again.', zh: '出现错误，请重试。' },
  loading: { en: 'Searching...', zh: '搜索中...' },
};

const suggestions: Record<Lang, string[]> = {
  en: [
    'What does Romans 8:28 mean?',
    'What do commentaries say about suffering?',
    'Explain John 3:16',
    'The meaning of grace in Ephesians',
    'Psalm 23 commentary',
    'Faith and works in James',
  ],
  zh: [
    '罗马书 8:28 是什么意思？',
    '注释怎么解释苦难？',
    '约翰福音 3:16 的解释',
    '以弗所书中恩典的意义',
    '诗篇 23 篇注释',
    '雅各书中信心与行为',
  ],
};

let lang: Lang = 'en';
let debounceTimer: ReturnType<typeof setTimeout>;

// DOM elements
const $ = (sel: string) => document.querySelector(sel)!;
const $title = () => $('[data-i18n="title"]');
const $subtitle = () => $('[data-i18n="subtitle"]');
const $searchInput = () => $<HTMLInputElement>('.search-input');
const $searchBtn = () => $<HTMLButtonElement>('.search-btn');
const $langBtn = () => $<HTMLButtonElement>('#lang-toggle');
const $darkBtn = () => $<HTMLButtonElement>('#dark-toggle');
const $seriesFilter = () => $<HTMLSelectElement>('#series-filter');
const $testamentFilter = () => $<HTMLSelectElement>('#testament-filter');
const $results = () => $('#results');
const $statsBar = () => $('.stats-bar');

function t(key: string): string {
  return i18n[key]?.[lang] ?? key;
}

function updateUI() {
  $title().textContent = t('title');
  $subtitle().textContent = t('subtitle');
  $searchInput().placeholder = t('searchPlaceholder');
  $searchBtn().textContent = t('searchBtn');
  $langBtn().textContent = t('langToggle');

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  $darkBtn().textContent = isDark ? t('lightToggle') : t('darkToggle');

  // Update filter labels
  const seriesFilter = $seriesFilter();
  if (seriesFilter.options[0]) seriesFilter.options[0].textContent = t('allSeries');

  const testamentFilter = $testamentFilter();
  if (testamentFilter.options.length >= 3) {
    testamentFilter.options[0].textContent = t('allTestaments');
    testamentFilter.options[1].textContent = t('ot');
    testamentFilter.options[2].textContent = t('nt');
  }

  // Update stats
  updateStats();

  // If showing empty state, re-render it
  const emptyEl = $results().querySelector('.empty-state');
  if (emptyEl) showEmptyState();
}

function showEmptyState() {
  const sugs = suggestions[lang]
    .map(s => `<button class="suggestion-chip" data-query="${s}">${s}</button>`)
    .join('');

  $results().innerHTML = `
    <div class="empty-state">
      <h2>${t('emptyTitle')}</h2>
      <p>${t('emptyDesc')}</p>
      <div class="suggestions">${sugs}</div>
    </div>
  `;

  $results().querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const query = (chip as HTMLElement).dataset.query!;
      $searchInput().value = query;
      doSearch(query);
    });
  });
}

function showLoading() {
  $results().innerHTML = Array(3).fill(`
    <div class="skeleton-card">
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
    </div>
  `).join('');
}

function showError(msg?: string) {
  $results().innerHTML = `
    <div class="error-state">
      <p>${msg || t('errorMsg')}</p>
    </div>
  `;
}

function highlightTerms(text: string, query: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const words = query.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return escaped;

  const pattern = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return escaped.replace(pattern, '<mark>$1</mark>');
}

function renderResults(results: any[], query: string) {
  if (results.length === 0) {
    $results().innerHTML = `
      <div class="no-results">
        <h3>${t('noResultsTitle')}</h3>
        <p>${t('noResultsDesc')}</p>
      </div>
    `;
    return;
  }

  const header = `<h2 class="results-header">${t('resultsFor')} "${query}"</h2>`;
  const cards = results.map((r: any, i: number) => `
    <div class="result-card" style="animation-delay: ${i * 50}ms">
      <div class="result-meta">
        <span class="series-badge">${r.series}</span>
        <span class="testament-badge">${r.testament}</span>
        <span class="book-ref">${r.book} &middot; ${t('page')} ${r.pageNumber}</span>
      </div>
      <div class="result-text">${highlightTerms(r.text, query)}</div>
      <div class="result-score">${t('relevance')}: ${(r.score * 100).toFixed(1)}%</div>
    </div>
  `).join('');

  $results().innerHTML = header + cards;
}

async function doSearch(query: string) {
  if (!query.trim()) {
    showEmptyState();
    return;
  }

  showLoading();

  const filters: Record<string, string> = {};
  const seriesVal = $seriesFilter().value;
  const testamentVal = $testamentFilter().value;
  if (seriesVal) filters.series = seriesVal;
  if (testamentVal) filters.testament = testamentVal;

  try {
    const res = await fetch(`${API_BASE}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim(), limit: 10, filters }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderResults(data.results, query);
  } catch (err) {
    console.error('Search error:', err);
    showError();
  }
}

async function loadSeries() {
  try {
    const res = await fetch(`${API_BASE}/api/series`);
    if (!res.ok) return;
    const data = await res.json();
    const select = $seriesFilter();
    for (const s of data.series) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      select.appendChild(opt);
    }
  } catch (err) {
    console.error('Failed to load series:', err);
  }
}

async function updateStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    if (!res.ok) return;
    const data = await res.json();
    $statsBar().innerHTML = `
      <span class="stat-item"><strong>${data.totalVectors?.toLocaleString() ?? '—'}</strong> ${t('vectors')}</span>
      <span class="stat-item"><strong>${data.seriesCount ?? '—'}</strong> ${t('series')}</span>
      <span class="stat-item"><strong>${data.totalFiles ?? '—'}</strong> ${t('files')}</span>
    `;
  } catch {
    $statsBar().innerHTML = '';
  }
}

function initDarkMode() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  }
  updateUI();
}

function toggleLang() {
  lang = lang === 'en' ? 'zh' : 'en';
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  updateUI();
}

function init() {
  // Restore preferences
  initDarkMode();
  const savedLang = localStorage.getItem('lang');
  if (savedLang === 'zh' || savedLang === 'en') lang = savedLang;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

  // Bind events
  $searchBtn().addEventListener('click', () => doSearch($searchInput().value));
  $searchInput().addEventListener('keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Enter') doSearch($searchInput().value);
  });
  $searchInput().addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const val = $searchInput().value;
      if (val.length >= 3) doSearch(val);
    }, 300);
  });

  $langBtn().addEventListener('click', toggleLang);
  $darkBtn().addEventListener('click', toggleDarkMode);

  $seriesFilter().addEventListener('change', () => {
    const val = $searchInput().value;
    if (val.trim()) doSearch(val);
  });
  $testamentFilter().addEventListener('change', () => {
    const val = $searchInput().value;
    if (val.trim()) doSearch(val);
  });

  // Initial load
  loadSeries();
  updateUI();
  showEmptyState();
}

document.addEventListener('DOMContentLoaded', init);
