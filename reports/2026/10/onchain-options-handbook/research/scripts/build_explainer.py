"""Inline the SVG charts into the explainer drafts."""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
rd = os.path.dirname(here)
root = os.path.dirname(rd)
for tpl, out, suf in (("explainer.zh.tpl.md", "explainer.md", ""), ("explainer.en.tpl.md", "explainer.en.md", "-en")):
    p = os.path.join(rd, tpl)
    if not os.path.exists(p):
        continue
    s = open(p).read()
    for i in (1, 2, 3):
        s = s.replace(f"@@FIG{i}@@", open(os.path.join(here, f"fig{i}{suf}.svg")).read())
    open(os.path.join(root, out), "w").write(s)
    print("wrote", out)
