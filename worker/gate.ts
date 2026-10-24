/**
 * 私有站点的 Access 校验（纯逻辑，worker/gate.test.ts 覆盖）。
 *
 * Cloudflare Access 挡在私有站点（research-hub-private 的 workers.dev 域名）前面，
 * 放行的请求会带上签名的 `Cf-Access-Jwt-Assertion`。Worker 再校验一次这个 JWT
 * （团队 JWKS 签名、issuer、audience、有效期），再按 ADR 0005 §8 区分身份：
 * 人 = 带 `email` 且在邮箱白名单里；agent = 没有 `email`、`common_name` 在 `AGENT_CLIENT_IDS` 里。
 * 失败即拒绝：Access 被关掉或配置错时，请求没有有效令牌 → 403；
 * Worker 自身没配置 → 503。私有报告不会因为任何一层配置失误而公开。
 */
import { jwtVerify, type JWTVerifyGetKey } from "jose";

export interface GateConfig {
  /** Access 团队域名，例如 `myteam.cloudflareaccess.com`（可带协议） */
  teamDomain?: string;
  /** Access 应用的 Audience（AUD）标签 */
  audience?: string;
  /**
   * 可选：逗号分隔的白名单（在 Access 策略之外再加一层）。
   * 完整邮箱精确匹配（demiwhisker@gmail.com）；以 @ 开头的条目匹配整个域名（@mantle.xyz，不含子域名）。
   */
  allowedEmails?: string;
  /** 逗号分隔的 service token client id（精确匹配）；为空 = 不接受任何 agent */
  agentClientIds?: string;
}

export type Identity = { kind: "human"; email: string } | { kind: "agent"; clientId: string };

export type GateResult =
  | { ok: true; identity: Identity }
  | { ok: false; status: 403 | 503; reason: string };

export function normalizeTeamDomain(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!v) return undefined;
  return v.includes(".") ? v : `${v}.cloudflareaccess.com`;
}

export async function checkAccess(
  headers: Headers,
  config: GateConfig,
  getKey: (issuer: string) => JWTVerifyGetKey,
): Promise<GateResult> {
  const team = normalizeTeamDomain(config.teamDomain);
  const audience = config.audience?.trim();
  if (!team || !audience) {
    return { ok: false, status: 503, reason: "private site gate not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD)" };
  }
  const token = headers.get("cf-access-jwt-assertion");
  if (!token) return { ok: false, status: 403, reason: "missing Cloudflare Access token" };
  const issuer = `https://${team}`;
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, getKey(issuer), { issuer, audience }));
  } catch {
    return { ok: false, status: 403, reason: "invalid Cloudflare Access token" };
  }
  // 带 email 的令牌永远不当 agent
  if (payload.email !== undefined) {
    const email = payload.email;
    if (typeof email !== "string" || !email.trim() || !isEmailAllowed(email, config.allowedEmails)) {
      return { ok: false, status: 403, reason: "email not allowed" };
    }
    return { ok: true, identity: { kind: "human", email } };
  }
  const clientId = payload.common_name;
  const agents = (config.agentClientIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (typeof clientId === "string" && agents.includes(clientId)) {
    return { ok: true, identity: { kind: "agent", clientId } };
  }
  return { ok: false, status: 403, reason: "identity not allowed" };
}

/** 白名单为空时放行（只依赖 Access 策略）；否则邮箱必须精确匹配某一项，或属于某个 @域名。 */
export function isEmailAllowed(email: string | undefined, allowList: string | undefined): boolean {
  const allow = (allowList ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allow.length) return true;
  const e = email?.trim().toLowerCase();
  if (!e || e.indexOf("@") <= 0 || e.indexOf("@") !== e.lastIndexOf("@")) return false;
  const domain = e.slice(e.indexOf("@"));
  return allow.some((a) => (a.startsWith("@") ? domain === a : e === a));
}
