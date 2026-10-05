#!/usr/bin/env bash
# 线上冒烟测试：公开站点在线且就是刚部署的版本；私有站点对匿名请求绝不返回内容。
set -euo pipefail
cd "$(dirname "$0")/.."
PUBLIC_URL=$(node -p 'require("./rh.config.json").publicUrl')
PRIVATE_URL=$(node -p 'require("./rh.config.json").privateUrl')

# 1. 公开首页与部署产物逐字节一致（新部署可能需要几秒才生效，轮询）
for attempt in $(seq 1 24); do
  if curl -sf --max-time 15 "${PUBLIC_URL}/" | cmp -s - dist/public/index.html; then
    echo "✓ 公开站点返回刚部署的版本：${PUBLIC_URL}/"
    break
  fi
  [ "$attempt" = 24 ] && { echo "::error::公开站点 2 分钟内没有返回刚部署的版本"; exit 1; }
  sleep 5
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
