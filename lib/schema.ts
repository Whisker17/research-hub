/**
 * 报告元数据（meta.yml）的唯一 schema。CLI（rh）与 Astro 构建共用。
 * 规格：docs/product-spec.md §4.2
 */
import { z } from "zod";

export const DOMAINS = ["ai", "crypto", "finance", "work", "other"] as const;
export const STATUSES = ["draft", "published"] as const;
export const VISIBILITIES = ["public", "private"] as const;
export const KINDS = ["native", "imported"] as const;

export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_LABELS: Record<Domain, string> = {
  ai: "AI",
  crypto: "Crypto",
  finance: "Finance",
  work: "Work",
  other: "Other",
};

/** 小写 ASCII + 连字符。用于报告 slug 与标签键，避免大小写 / 同义写法分裂。 */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * 保留路由名（ADR 0003 §5）：报告与站点页面共用 /p/<name>/（将来合并域名后是根路径），所以报告 slug
 * 不能用这些名字，也不能是纯数字（与 /YYYY/ 归档路径冲突）。新增站点路由时先把名字加进这里。
 */
export const RESERVED_SLUGS = ["daily", "tags", "archive", "fonts", "about"] as const;

export const isReservedSlug = (s: string): boolean => (RESERVED_SLUGS as readonly string[]).includes(s) || /^\d+$/.test(s);

export const reservedSlugMessage = (s: string): string =>
  `slug“${s}”是保留的路由名（${RESERVED_SLUGS.join("、")} 与纯数字不能作报告 slug），换一个`;

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const isoDate = z.string().refine(isValidDate, { message: "日期格式必须是 YYYY-MM-DD" });
const slug = z.string().regex(SLUG_RE, { message: "只能用小写字母、数字和连字符（如 meme-launchpad）" });

export const changelogEntry = z.strictObject({
  date: isoDate,
  note: z.string().trim().min(1),
});

export const metaSchema = z
  .strictObject({
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    title_en: z.string().trim().min(1).optional(),
    summary_en: z.string().trim().min(1).optional(),
    created: isoDate,
    updated: isoDate,
    changelog: z.array(changelogEntry).min(1, { message: "至少要有一条 changelog（创建记录）" }),
    domain: z.enum(DOMAINS),
    tags: z.array(slug).default([]),
    status: z.enum(STATUSES),
    visibility: z.enum(VISIBILITIES),
    kind: z.enum(KINDS),
    source_repo: z.string().trim().min(1).optional(),
    brief_source: z.string().trim().min(1).optional(),
    am_version: z.string().trim().min(1).optional(),
    series: slug.optional(),
    related: z.array(slug).optional(),
  })
  .superRefine((m, ctx) => {
    if (m.updated < m.created) {
      ctx.addIssue({ code: "custom", path: ["updated"], message: `updated（${m.updated}）早于 created（${m.created}）` });
    }
    if (m.kind === "imported" && !m.source_repo) {
      ctx.addIssue({ code: "custom", path: ["source_repo"], message: "导入报告（kind: imported）必须写 source_repo" });
    }
    if (m.kind === "native" && !m.brief_source) {
      ctx.addIssue({ code: "custom", path: ["brief_source"], message: "原生报告（kind: native）必须写 brief_source（vault 中 brief 的原路径）" });
    }
    if (new Set(m.tags).size !== m.tags.length) {
      ctx.addIssue({ code: "custom", path: ["tags"], message: "tags 有重复项" });
    }
  });

export type Meta = z.infer<typeof metaSchema>;

/**
 * 标签登记表 tags.yml：键是标签 slug，值是展示名与可选的描述（ADR 0003 §6）。
 * 描述只在标签被 public + published 报告用到时才出现在公开站点；其余标签的描述是公开产物的泄漏指纹。
 */
export const tagsFileSchema = z.strictObject({
  tags: z.record(
    slug,
    z.strictObject({
      label: z.string().trim().min(1),
      description: z.string().trim().min(1).optional(),
      description_en: z.string().trim().min(1).optional(),
    }),
  ),
});

export type TagRegistry = z.infer<typeof tagsFileSchema>["tags"];

export function formatZodIssues(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`);
}
