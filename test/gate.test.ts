// 私有站点 Access 校验：失败即拒绝。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { checkAccess, normalizeTeamDomain } from "../worker/gate.ts";

const TEAM = "rh-test.cloudflareaccess.com";
const ISSUER = `https://${TEAM}`;
const AUD = "aud-tag-123";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
const jwks = createLocalJWKSet({ keys: [jwk] });
const getKey = () => jwks;

async function token(claims: { iss?: string; aud?: string; exp?: string; payload?: Record<string, unknown> } = {}) {
  return new SignJWT(claims.payload ?? { email: "reviewer@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience(claims.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? "5m")
    .sign(privateKey);
}
const headers = (jwt?: string) => new Headers(jwt ? { "cf-access-jwt-assertion": jwt } : {});
const config = { teamDomain: TEAM, audience: AUD };

test("valid Access token is allowed", async () => {
  const r = await checkAccess(headers(await token()), config, getKey);
  assert.deepEqual(r, { ok: true, identity: { kind: "human", email: "reviewer@example.com" } });
});

test("request without token is denied (Access bypassed/disabled)", async () => {
  const r = await checkAccess(headers(), config, getKey);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 403);
});

test("token for another Access application is denied", async () => {
  const r = await checkAccess(headers(await token({ aud: "other-app" })), config, getKey);
  assert.equal(r.ok, false);
});

test("token from another issuer is denied", async () => {
  const r = await checkAccess(headers(await token({ iss: "https://evil.cloudflareaccess.com" })), config, getKey);
  assert.equal(r.ok, false);
});

test("expired token is denied", async () => {
  const r = await checkAccess(headers(await token({ exp: "-1m" })), config, getKey);
  assert.equal(r.ok, false);
});

test("forged signature is denied", async () => {
  const other = await generateKeyPair("RS256");
  const forged = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setExpirationTime("5m")
    .sign(other.privateKey);
  const r = await checkAccess(headers(forged), config, getKey);
  assert.equal(r.ok, false);
});

test("missing configuration fails closed with 503", async () => {
  for (const c of [{}, { teamDomain: TEAM }, { audience: AUD }, { teamDomain: " ", audience: " " }]) {
    const r = await checkAccess(headers(await token()), c, getKey);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.status, 503);
  }
});

test("team domain normalization", () => {
  assert.equal(normalizeTeamDomain("rh-test"), TEAM);
  assert.equal(normalizeTeamDomain(`https://${TEAM}/`), TEAM);
  assert.equal(normalizeTeamDomain(""), undefined);
});

test("邮箱白名单：不在名单里的有效令牌也被拒绝", async () => {
  const denied = await checkAccess(headers(await token()), { ...config, allowedEmails: "owner@example.com" }, getKey);
  assert.equal(denied.ok, false);
  const allowed = await checkAccess(headers(await token()), { ...config, allowedEmails: "owner@example.com, Reviewer@Example.com" }, getKey);
  assert.equal(allowed.ok, true);
});

test("白名单：精确邮箱 + @域名（不含子域名、不被后缀伪造）", async () => {
  const { isEmailAllowed } = await import("../worker/gate.ts");
  const list = "demiwhisker@gmail.com, @mantle.xyz";
  assert.equal(isEmailAllowed("demiwhisker@gmail.com", list), true);
  assert.equal(isEmailAllowed("DemiWhisker@Gmail.com", list), true);
  assert.equal(isEmailAllowed("alice@mantle.xyz", list), true);
  assert.equal(isEmailAllowed("Bob@MANTLE.XYZ", list), true);
  assert.equal(isEmailAllowed("other@gmail.com", list), false);
  assert.equal(isEmailAllowed("eve@evilmantle.xyz", list), false);
  assert.equal(isEmailAllowed("eve@sub.mantle.xyz", list), false);
  assert.equal(isEmailAllowed("eve@mantle.xyz.evil.com", list), false);
  assert.equal(isEmailAllowed("a@mantle.xyz@evil.com", list), false);
  assert.equal(isEmailAllowed(undefined, list), false);
  assert.equal(isEmailAllowed("anyone@x.com", ""), true, "白名单为空时只依赖 Access 策略");
});

// ADR 0005 §8：agent = 没有 email、common_name 精确在 AGENT_CLIENT_IDS 里
const AGENT = "abc123.access";
const agentToken = (payload: Record<string, unknown>) => token({ payload });

test("allow-listed service token is an agent", async () => {
  const r = await checkAccess(headers(await agentToken({ common_name: AGENT, sub: "" })), { ...config, allowedEmails: "owner@example.com", agentClientIds: `x.access, ${AGENT}` }, getKey);
  assert.deepEqual(r, { ok: true, identity: { kind: "agent", clientId: AGENT } });
});

test("service token not allow-listed, or no allow-list at all, is denied", async () => {
  for (const agentClientIds of [undefined, "", " , ", "x.access", AGENT.toUpperCase(), `${AGENT}x`]) {
    const r = await checkAccess(headers(await agentToken({ common_name: AGENT })), { ...config, agentClientIds }, getKey);
    assert.equal(r.ok, false, String(agentClientIds));
    assert.equal(!r.ok && r.status, 403);
  }
});

test("token without email or common_name is denied even with an empty email allow-list", async () => {
  const r = await checkAccess(headers(await agentToken({ sub: "x" })), { ...config, agentClientIds: AGENT }, getKey);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 403);
});

test("a token with email is never an agent", async () => {
  for (const email of ["eve@example.com", "", 42]) {
    const r = await checkAccess(headers(await agentToken({ email, common_name: AGENT })), { ...config, allowedEmails: "owner@example.com", agentClientIds: AGENT }, getKey);
    assert.equal(r.ok, false, String(email));
  }
});

test("agent token for another app or issuer is denied", async () => {
  const c = { ...config, agentClientIds: AGENT };
  for (const t of [await token({ aud: "other-app", payload: { common_name: AGENT } }), await token({ iss: "https://evil.cloudflareaccess.com", payload: { common_name: AGENT } })]) {
    assert.equal((await checkAccess(headers(t), c, getKey)).ok, false);
  }
});
