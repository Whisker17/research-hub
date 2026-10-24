/**
 * 私有站点 Worker（research-hub-private）：先校验 Access JWT，再处理评论 API（ADR 0005 §9）或从静态资源返回内容。
 * 公开站点（research-hub）没有 Worker 代码，只有静态资源。
 */
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { checkAccess } from "./gate.ts";
import { handleComments, isCommentsPath, type CommentsEnv } from "./comments.ts";

interface Env extends CommentsEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ALLOWED_EMAILS?: string;
  AGENT_CLIENT_IDS?: string;
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
    const url = new URL(request.url);
    const api = isCommentsPath(url.pathname);
    const result = await checkAccess(
      request.headers,
      {
        teamDomain: env.ACCESS_TEAM_DOMAIN,
        audience: env.ACCESS_AUD,
        allowedEmails: env.ALLOWED_EMAILS,
        agentClientIds: env.AGENT_CLIENT_IDS,
      },
      getKey,
    );
    if (!result.ok) {
      return api
        ? new Response(JSON.stringify({ error: result.reason }), {
            status: result.status,
            headers: { "content-type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
          })
        : new Response(`Research Hub (private): ${result.reason}\n`, {
            status: result.status,
            headers: { "content-type": "text/plain; charset=utf-8", ...SECURITY_HEADERS },
          });
    }
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(null, { status: 302, headers: { location: "/p/", ...SECURITY_HEADERS } });
    }
    const response = api ? await handleComments(request, env, result.identity) : await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
