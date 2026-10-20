#!/usr/bin/env bash
# 线上冒烟测试：公开站点在线且就是刚部署的版本；私有站点对匿名请求绝不返回内容。
set -euo pipefail
cd "$(dirname "$0")/.."
PUBLIC_URL=$(node -p 'require("./rh.config.json").publicUrl')
PRIVATE_URL=$(node -p 'require("./rh.config.json").privateUrl')

# 新部署要几秒到一两分钟才在边缘生效：下面两项都轮询（默认 24 × 5 秒 ≈ 2 分钟；SMOKE_INTERVAL 只给测试用）
INTERVAL=${SMOKE_INTERVAL:-5}

# 1. /build.json（构建的提交 SHA）与部署产物一致：这是主要的版本检查。Daily 提交只改 /daily/…、不改首页，
#    旧部署的首页同样能通过首页检查；Daily 的 Lark 推送也靠 /build.json 找到线上版本
for attempt in $(seq 1 24); do
  if curl -sf --max-time 15 "${PUBLIC_URL}/build.json" | cmp -s - dist/public/build.json; then
    echo "✓ 公开站点 /build.json：$(cat dist/public/build.json)"
    break
  fi
  if [ "$attempt" = 24 ]; then
    SERVED=$(curl -s --max-time 15 -w ' (HTTP %{http_code})' "${PUBLIC_URL}/build.json" | tail -c 300 || true)
    echo "::error::公开站点 /build.json 轮询 24 次（每 ${INTERVAL} 秒）后仍没有切到刚部署的版本：期望 $(cat dist/public/build.json)，线上 ${SERVED}"
    exit 1
  fi
  sleep "$INTERVAL"
done

# 1b. 公开首页与部署产物逐字节一致
for attempt in $(seq 1 24); do
  if curl -sf --max-time 15 "${PUBLIC_URL}/" | cmp -s - dist/public/index.html; then
    echo "✓ 公开站点返回刚部署的首页：${PUBLIC_URL}/"
    break
  fi
  [ "$attempt" = 24 ] && { echo "::error::公开站点首页轮询 24 次（每 ${INTERVAL} 秒）后仍没有与部署产物一致"; exit 1; }
  sleep "$INTERVAL"
done

# 2. 公开站点上不存在 /p/
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${PUBLIC_URL}/p/")
[ "${CODE}" = 404 ] || { echo "::error::公开站点 /p/ 返回 ${CODE}（应为 404）"; exit 1; }
echo "✓ 公开站点 /p/ → 404"

# 3. 私有站点：匿名请求只能被 Access 重定向（302 → cloudflareaccess.com）或被网关拒绝（403 / 503）
for path in / /p/; do
  read -r CODE LOC < <(curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' --max-time 15 "${PRIVATE_URL}${path}")
  case "${CODE}" in
    302|303) [[ "${LOC}" == *cloudflareaccess.com* ]] || { echo "::error::私有站点 ${path} 重定向到了意外地址：${LOC}"; exit 1; } ;;
    401|403|503) ;;
    *) echo "::error::私有站点 ${path} 对匿名请求返回 ${CODE}（应被拦截）"; exit 1 ;;
  esac
  echo "✓ 私有站点 ${path} 匿名访问被拦截（${CODE}）"
done
