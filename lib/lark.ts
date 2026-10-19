/**
 * Lark 自定义机器人（WHI-1972）的共用部分：文字清理与 lark_md 转义、签名、请求体大小。
 * 只用 node 内置模块：Daily workflow 的 alert job 不装依赖也能用（scripts/daily-notify-plan.ts alert、scripts/lark-post.ts）。
 * 机器人协议：https://open.larksuite.com/document/client-docs/bot-v3/add-custom-bot
 */
import { createHash, createHmac } from "node:crypto";

/** 发送的消息（不含 timestamp / sign，发送时由 scripts/lark-post.ts 每次重新计算） */
export interface LarkMessage {
  msg_type: "interactive";
  card: Record<string, unknown>;
}

/** Lark 的请求体上限是 20 KB：超过的请求一律不发 */
export const REQUEST_LIMIT = 20 * 1024;
/** 卡片排版的预算：完整请求（含 timestamp 与 sign）不超过 18 KB */
export const CARD_BUDGET = 18 * 1024;

/** 签名 = Base64(HMAC-SHA256(key = timestamp + "\n" + secret, message = 空)) */
export const sign = (timestamp: string, secret: string): string => createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");

/** 完整的请求体：timestamp（秒）、sign、msg_type、card。 */
export const requestBody = (m: LarkMessage, timestamp: string, signature: string): string => JSON.stringify({ timestamp, sign: signature, ...m });

/** timestamp 固定 10 位、sign 固定 44 个字符（32 字节的 Base64），所以用占位值量出来的就是真实大小。 */
export const requestBytes = (m: LarkMessage): number => Buffer.byteLength(requestBody(m, "0000000000", "A".repeat(44)));

/**
 * 不可信文字（生成器输出）→ 一行纯文本：去掉 HTML 标签（含 <at …>）、控制字符和双向控制符，空白合并成一个空格；
 * 按码点截到 max（超出时最后一个字符换成 …，不会切开一个字符）。
 */
export function plain(s: string, max = Number.POSITIVE_INFINITY): string {
  const t = s
    .replace(/<\/?[A-Za-z!][^<>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cps = [...t];
  return cps.length > max ? `${cps.slice(0, Math.max(0, max - 1)).join("").trimEnd()}…` : t;
}

const MD_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "*": "&#42;",
  _: "&#95;",
  "~": "&#126;",
  "`": "&#96;",
  "[": "&#91;",
  "]": "&#93;",
  "(": "&#40;",
  ")": "&#41;",
  "\\": "&#92;",
};

/** lark_md 转义：标记字符（加粗、斜体、删除线、代码、链接、@ 标签、反斜杠）都换成 HTML 实体，原样显示。先 plain() 再转义。 */
export const md = (s: string): string => s.replace(/[&<>*_~`[\]()\\]/g, (c) => MD_ESCAPES[c]);

/** 键排序后的 JSON：同样的数据一定得到同样的字节（哈希用） */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** YYYY-MM-DD 且是真实的日期（不依赖 lib/schema.ts 的 zod） */
export const isDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
