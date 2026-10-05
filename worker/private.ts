/**
 * 私有站点 Worker（research-hub-private）：先校验 Access JWT，再从静态资源返回内容。
 * 公开站点（research-hub）没有 Worker 代码，只有静态资源。
 */
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { checkAccess } from "./gate.ts";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ALLOWED_EMAILS?: string;
}

const jwksByIssuer = new Map<string, JWTVerifyGetKey>();
const getKey = (issuer: string): JWTVerifyGetKey => {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
};

const SECURITY_HEADERS = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const result = await checkAccess(
      request.headers,
      { teamDomain: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD, allowedEmails: env.ALLOWED_EMAILS },
      getKey,
    );
    if (!result.ok) {
      return new Response(`Research Hub (private): ${result.reason}\n`, {
        status: result.status,
        headers: { "content-type": "text/plain; charset=utf-8", ...SECURITY_HEADERS },
      });
    }
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(null, { status: 302, headers: { location: "/p/", ...SECURITY_HEADERS } });
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
