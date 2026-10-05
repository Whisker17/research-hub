/**
 * 私有站点的 Access 校验（纯逻辑，worker/gate.test.ts 覆盖）。
 *
 * Cloudflare Access 挡在私有站点（research-hub-private 的 workers.dev 域名）前面，
 * 放行的请求会带上签名的 `Cf-Access-Jwt-Assertion`。Worker 再校验一次这个 JWT
 * （团队 JWKS 签名、issuer、audience、有效期，可选邮箱白名单）。
 * 失败即拒绝：Access 被关掉或配置错时，请求没有有效令牌 → 403；
 * Worker 自身没配置 → 503。私有报告不会因为任何一层配置失误而公开。
 */
import { jwtVerify, type JWTVerifyGetKey } from "jose";

export interface GateConfig {
  /** Access 团队域名，例如 `myteam.cloudflareaccess.com`（可带协议） */
  teamDomain?: string;
  /** Access 应用的 Audience（AUD）标签 */
  audience?: string;
  /** 可选：逗号分隔的邮箱白名单（在 Access 策略之外再加一层） */
  allowedEmails?: string;
}

export type GateResult =
  | { ok: true; email?: string }
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
  let email: string | undefined;
  try {
    const { payload } = await jwtVerify(token, getKey(issuer), { issuer, audience });
    email = typeof payload.email === "string" ? payload.email : undefined;
  } catch {
    return { ok: false, status: 403, reason: "invalid Cloudflare Access token" };
  }
  const allow = (config.allowedEmails ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && (!email || !allow.includes(email.toLowerCase()))) {
    return { ok: false, status: 403, reason: "email not allowed" };
  }
  return { ok: true, email };
}
