/**
 * 站点界面文案（WHI-1928）：唯一的中英文词典。
 *
 * 服务端用 t("zh", …) 渲染中文；同一份词典内联进每页 <head>，浏览器端的语言切换按元素上的标记替换：
 *  - data-i18n="key"（可带 data-i18n-vars='{"n":3}'）→ 文字；
 *  - data-i18n-attr="aria-label:key placeholder:key" → 属性；
 *  - data-en="…" / data-en-href="…" → 单条内容自己的英文文字 / 链接（报告标题、摘要、英文版地址）。
 * 英文缺失时回退中文。偏好存在本站 localStorage.rh_lang（"zh" | "en"，与报告外壳共用），两个站点之间不同步。
 */
export type Lang = "zh" | "en";

const zh = {
  brand: "Research Hub",
  tagline: "AI 研究报告的图文讲解",
  taglinePrivate: "全部已发布报告（含私有）",
  private: "私有",
  public: "公开",
  navReports: "报告",
  navTags: "标签",
  navArchive: "归档",
  navPrivateIndex: "全部报告",
  navPublicSite: "公开站点",
  navLabel: "站点导航",
  menu: "菜单",
  langSwitch: "EN",
  langSwitchLabel: "切换到英文",
  theme: "深色模式",
  footAll: "全部报告",
  footArchive: "按月归档",
  footTags: "标签",
  all: "全部",
  searchPlaceholder: "按标题、摘要或标签筛选",
  searchLabel: "筛选报告（快捷键 / 或 ⌘K）",
  domainGroup: "领域",
  tagGroup: "标签",
  nReports: "{n} 篇报告",
  nReportsOne: "{n} 篇报告",
  nOfReports: "{n} / {total} 篇报告",
  nShort: "{n} 篇",
  nTags: "{n} 个标签",
  nTagsOne: "{n} 个标签",
  emptyFilter: "没有符合条件的报告。",
  emptyList: "还没有报告。",
  emptyPublic: "还没有公开报告。",
  emptyPublished: "还没有已发布的报告。",
  emptyTags: "还没有标签。",
  created: "创建于",
  updated: "更新于",
  archive: "按月归档",
  archiveSub: "按报告的创建月份",
  month: "{y} 年 {m} 月",
  monthSub: "{n} 篇报告（按创建月份）",
  tags: "标签",
  tagTitle: "标签：{label}",
  privateIndex: "私有索引",
  notFound: "找不到页面",
  notFoundTitle: "找不到这个页面",
  notFoundSub: "链接可能已失效，或报告不是公开的。",
  notFoundBack: "返回全部报告",
};

export type I18nKey = keyof typeof zh;

const en: Partial<Record<I18nKey, string>> = {
  tagline: "Visual explainers of AI research reports",
  taglinePrivate: "All published reports (including private)",
  private: "Private",
  public: "Public",
  navReports: "Reports",
  navTags: "Tags",
  navArchive: "Archive",
  navPrivateIndex: "All reports",
  navPublicSite: "Public site",
  navLabel: "Site navigation",
  menu: "Menu",
  langSwitch: "中文",
  langSwitchLabel: "Switch to Chinese",
  theme: "Dark mode",
  footAll: "All reports",
  footArchive: "Monthly archive",
  footTags: "Tags",
  all: "All",
  searchPlaceholder: "Filter by title, summary or tag",
  searchLabel: "Filter reports (shortcut / or ⌘K)",
  domainGroup: "Domain",
  tagGroup: "Tags",
  nReports: "{n} reports",
  nReportsOne: "{n} report",
  nOfReports: "{n} / {total} reports",
  nShort: "{n}",
  nTags: "{n} tags",
  nTagsOne: "{n} tag",
  emptyFilter: "No matching reports.",
  emptyList: "No reports yet.",
  emptyPublic: "No public reports yet.",
  emptyPublished: "No published reports yet.",
  emptyTags: "No tags yet.",
  created: "Created",
  updated: "Updated",
  archive: "Monthly archive",
  archiveSub: "By the month a report was created",
  month: "{y}-{m}",
  monthSub: "{n} reports (by creation month)",
  tags: "Tags",
  tagTitle: "Tag: {label}",
  privateIndex: "Private index",
  notFound: "Page not found",
  notFoundTitle: "This page does not exist",
  notFoundSub: "The link may be outdated, or the report is not public.",
  notFoundBack: "Back to all reports",
};

export const I18N: Record<Lang, Partial<Record<I18nKey, string>>> = { zh, en };

export type I18nVars = Record<string, string | number>;

/**
 * 取文案并填入 {var}；n 为 1 且有 `<key>One` 时用单数形式；英文缺失时回退中文。
 * 浏览器端的 rhI18n.t 是同一规则（Base.astro），改这里要一起改。
 */
export function t(lang: Lang, key: I18nKey, vars: I18nVars = {}): string {
  const k = (Number(vars.n) === 1 && `${key}One` in zh ? `${key}One` : key) as I18nKey;
  const s = I18N[lang][k] ?? zh[k];
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** 页面 <title>：“标题 · Research Hub”，首页只有 “Research Hub”。 */
export const pageTitle = (title: string) => (title === zh.brand ? title : `${title} · ${zh.brand}`);
