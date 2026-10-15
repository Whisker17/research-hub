"""Generate SVG payoff charts for the explainer (S0=2500, T=30d, sigma=60%, r=0)."""
import sys
sys.path.insert(0, '.')
from bs import bs

S0, T, R, V = 2500.0, 30/365, 0.0, 0.60
C = lambda K: bs(S0, K, T, R, V, 'call')['price']
P = lambda K: bs(S0, K, T, R, V, 'put')['price']
c25, p25, c275, p225 = C(2500), P(2500), C(2750), P(2250)

def chart(series, title, xr=(1500, 3500), yr=(-600, 800), yt=200, w=640, h=320, labels_en=False, extra=None, xlabel=None):
    L, Rm, Tp, B = 62, 20, 16, 40
    nrows = (len(series)+1)//2
    pw, ph = w-L-Rm, h-Tp-B
    H = h + 14 + nrows*22
    X = lambda x: L + (x-xr[0])/(xr[1]-xr[0])*pw
    Y = lambda y: Tp + (yr[1]-y)/(yr[1]-yr[0])*ph
    out = [f'<svg viewBox="0 0 {w} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="{title}" style="width:100%;height:auto;font-family:system-ui,sans-serif;font-size:13px">']
    y = yr[0]
    while y <= yr[1]:
        out.append(f'<line x1="{L}" y1="{Y(y):.1f}" x2="{w-Rm}" y2="{Y(y):.1f}" stroke="#999" stroke-opacity="{0.8 if y==0 else 0.25}"/>')
        out.append(f'<text x="{L-6}" y="{Y(y)+4:.1f}" text-anchor="end" fill="currentColor">{y:+d}</text>'.replace('+0<', '0<'))
        y += yt
    for x in range(xr[0], xr[1]+1, 500):
        out.append(f'<line x1="{X(x):.1f}" y1="{Tp}" x2="{X(x):.1f}" y2="{h-B}" stroke="#999" stroke-opacity="0.15"/>')
        out.append(f'<text x="{X(x):.1f}" y="{h-B+18}" text-anchor="middle" fill="currentColor">{x}</text>')
    out.append(f'<text x="{L+pw/2:.1f}" y="{h-4}" text-anchor="middle" fill="currentColor" opacity="0.7">{xlabel or ("ETH price at expiry (USD)" if labels_en else "到期 ETH 价格（USD）")}</text>')
    for i, (name, f, color, dash) in enumerate(series):
        pts = []
        x = xr[0]
        while x <= xr[1]:
            yv = max(min(f(x), yr[1]), yr[0])
            pts.append(f'{X(x):.1f},{Y(yv):.1f}')
            x += 10
        d = f' stroke-dasharray="{dash}"' if dash else ''
        out.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{color}" stroke-width="2.5"{d}/>')
        lx = L + (i % 2) * 290
        ly = h + 18 + (i // 2) * 22
        out.append(f'<line x1="{lx}" y1="{ly-4}" x2="{lx+22}" y2="{ly-4}" stroke="{color}" stroke-width="3"{d}/>')
        out.append(f'<text x="{lx+28}" y="{ly}" fill="currentColor">{name}</text>')
    if extra:
        out += extra(X, Y)
    out.append('</svg>')
    return '\n'.join(out)

col = ['#2f6fdf', '#d9534f', '#2a9d5b', '#c98a00']

def figs(en):
    t = (lambda zh, e: e if en else zh)
    f1 = chart([
        (t('买 call K=2500（付 171.35）', 'Long call K=2500 (pays 171.35)'), lambda s: max(s-2500, 0)-c25, col[0], ''),
        (t('买 put K=2500（付 171.35）', 'Long put K=2500 (pays 171.35)'), lambda s: max(2500-s, 0)-p25, col[1], ''),
        (t('卖 call K=2500（收 171.35）', 'Short call K=2500 (gets 171.35)'), lambda s: c25-max(s-2500, 0), col[0], '6 5'),
        (t('现货多头（2500 买入）', 'Long spot (bought at 2500)'), lambda s: s-2500, '#888', '2 4'),
    ], t('到期盈亏：call、put 与现货', 'PnL at expiry: call, put and spot'), yr=(-1200, 1200), yt=300, labels_en=en)
    f2 = chart([
        (t('Protective put：现货 + 买 P2500', 'Protective put: spot + long P2500'), lambda s: (s-2500)+max(2500-s, 0)-p25, col[0], ''),
        (t('Covered call：现货 − C2750', 'Covered call: spot − C2750'), lambda s: (s-2500)-max(s-2750, 0)+c275, col[1], ''),
        (t('Collar：现货 + P2250 − C2750', 'Collar: spot + P2250 − C2750'), lambda s: (s-2500)+max(2250-s, 0)-max(s-2750, 0)-p225+c275, col[2], ''),
        (t('Bull call spread 2500/2750', 'Bull call spread 2500/2750'), lambda s: max(s-2500, 0)-max(s-2750, 0)-(c25-c275), col[3], '6 5'),
    ], t('常见结构的到期盈亏', 'PnL at expiry of common structures'), yr=(-1000, 1000), yt=250, labels_en=en)
    def tv(X, Y):
        return []
    f3 = chart([
        (t('到期 payoff max(S−2500,0)', 'Payoff at expiry max(S−2500,0)'), lambda s: max(s-2500, 0), '#888', '6 5'),
        (t('还剩 30 天的 call 价值', 'Call value with 30 days left'), lambda s: bs(s, 2500, T, R, V, 'call')['price'], col[0], ''),
        (t('还剩 7 天的 call 价值', 'Call value with 7 days left'), lambda s: bs(s, 2500, 7/365, R, V, 'call')['price'], col[2], ''),
    ], t('期权价值 = 内在价值 + 时间价值', 'Option value = intrinsic + time value'), xr=(2000, 3000), yr=(0, 600), yt=100, labels_en=en, xlabel=t('ETH 价格（USD）', 'ETH price (USD)'))
    return f1, f2, f3

for en in (False, True):
    for i, s in enumerate(figs(en), 1):
        open(f'../../assets-fig{i}{"-en" if en else ""}.svg' if False else f'fig{i}{"-en" if en else ""}.svg', 'w').write(s)
print('ok', round(c25, 2), round(c275, 2), round(p225, 2))
