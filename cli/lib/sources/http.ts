/**
 * rh ingest 的 HTTP 层：带 User-Agent、超时、响应大小上限、有界重试和按次计数。
 * 每一次尝试（包括重试）都算一次调用，记进 manifest 的 sources[].calls；超出 max_calls_per_run 就不再发请求。
 * 错误信息只写状态码和错误类别，不写响应正文，并抹掉已知的凭据（ADR 0004 §11：凭据不进日志和 artifact）。
 */

export type FetchFn = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

export interface HttpCtx {
  fetch: FetchFn;
  userAgent: string;
  timeoutMs: number;
  backoffMs: number;
  sleep: (ms: number) => Promise<void>;
  /** 要从任何错误信息里抹掉的值（API key） */
  secrets: string[];
}

export type ErrorKind = "http" | "timeout" | "network" | "format" | "auth" | "quota" | "budget";

export class SourceError extends Error {
  readonly kind: ErrorKind;
  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** 一个源在一次运行里能发的请求数（max_calls_per_run）。 */
export class CallBudget {
  readonly max: number;
  used = 0;
  constructor(max: number) {
    this.max = max;
  }
  take(): void {
    if (this.used >= this.max) throw new SourceError("budget", `max_calls_per_run（${this.max}）用完`);
    this.used++;
  }
}

export const MAX_BODY_BYTES = 5 * 1024 * 1024;

export function redact(msg: string, secrets: string[]): string {
  let out = msg;
  for (const s of secrets) if (s) out = out.split(s).join("***");
  return out;
}

export interface GetOptions {
  headers?: Record<string, string>;
  budget: CallBudget;
  /** 额外重试次数（不含第一次） */
  retries?: number;
  /** 哪些 HTTP 状态值得重试（超时和网络错误总是重试） */
  retryStatus?: (status: number) => boolean;
}

/** GET 一个 URL，返回 2xx 的正文；非 2xx（重试后）抛 SourceError("http")，204 返回空串。 */
export async function getText(ctx: HttpCtx, url: string, o: GetOptions): Promise<{ status: number; body: string }> {
  const retries = o.retries ?? 0;
  let last: SourceError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await ctx.sleep(ctx.backoffMs * attempt);
    o.budget.take();
    try {
      const res = await ctx.fetch(url, { headers: { "user-agent": ctx.userAgent, accept: "*/*", ...o.headers }, signal: AbortSignal.timeout(ctx.timeoutMs) });
      const body = await res.text();
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new SourceError("format", `响应超过 ${MAX_BODY_BYTES} 字节`);
      if (res.status >= 200 && res.status < 300) return { status: res.status, body };
      const kind: ErrorKind = res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "quota" : "http";
      last = new SourceError(kind, `HTTP ${res.status}`);
      if (!(o.retryStatus?.(res.status) ?? false)) break;
    } catch (e) {
      if (e instanceof SourceError) throw e;
      const err = e as Error;
      last = err.name === "TimeoutError" || err.name === "AbortError" ? new SourceError("timeout", `超时（${ctx.timeoutMs} ms）`) : new SourceError("network", `网络错误：${redact(String((err.cause as { code?: string })?.code ?? err.name), ctx.secrets)}`);
    }
  }
  throw last!;
}

export async function getJson(ctx: HttpCtx, url: string, o: GetOptions): Promise<unknown> {
  const { body } = await getText(ctx, url, o);
  try {
    return JSON.parse(body);
  } catch {
    throw new SourceError("format", "响应不是 JSON");
  }
}

/** 把错误变成 manifest 里的一句话（≤ 500 字，已抹掉凭据）。 */
export function errorText(e: unknown, secrets: string[]): string {
  const msg = e instanceof SourceError ? `${e.kind}: ${e.message}` : `internal: ${(e as Error)?.message ?? String(e)}`;
  return redact(msg, secrets).slice(0, 500);
}
