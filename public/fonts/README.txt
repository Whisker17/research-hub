Self-hosted Latin subsets (ADR 0003 §4, WHI-1928). All three fonts are licensed under the
SIL Open Font License 1.1; the licence text ships next to each file (OFL-*.txt).

Source: https://github.com/google/fonts at commit 47d54ca1ebb14fd864695f1d39dc734f39017c33
  inter.woff2           ofl/inter/Inter[opsz,wght].ttf                 Inter 4.001 (git-66647c0bb)
  jetbrains-mono.woff2  ofl/jetbrainsmono/JetBrainsMono[wght].ttf      JetBrains Mono 2.211
  newsreader.woff2      ofl/newsreader/Newsreader[opsz,wght].ttf       Newsreader 1.003

Reduced axes, then Latin subset (fonttools via `uv run --with fonttools --with brotli`):
  fonttools varLib.instancer Inter[opsz,wght].ttf opsz=14 wght=400:600 -o i.ttf
  fonttools varLib.instancer JetBrainsMono[wght].ttf wght=400:600 -o j.ttf
  fonttools varLib.instancer Newsreader[opsz,wght].ttf wght=400:600 opsz=16:72 -o n.ttf
  pyftsubset <x>.ttf --flavor=woff2 --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk,tnum,lnum,pnum,case' \
    --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-2013,U+2015-2017,U+2020-2025,U+2027-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'

The range is Google Fonts' "latin" range minus U+2014, U+2018-201F and U+2026 (em dash, curly
quotes, ellipsis): Chinese text uses those characters too, and they must come from the system CJK
font. The same range is the @font-face unicode-range in src/styles/tokens.css.
