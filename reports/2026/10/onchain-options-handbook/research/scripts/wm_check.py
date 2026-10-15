from math import log, sqrt, exp, erf
N = lambda x: 0.5*(1+erf(x/sqrt(2)))
S, T, v = 2510.8339, 7/365, 0.5
def call(K, s=S, t=T, vol=v):
    if t <= 0: return max(s-K, 0.0)
    d1 = (log(s/K)+0.5*vol*vol*t)/(vol*sqrt(t)); return s*N(d1)-K*N(d1-vol*sqrt(t))
def delta(K, s=S, t=T, vol=v): return N((log(s/K)+0.5*vol*vol*t)/(vol*sqrt(t)))
for off in (50, 25, 10):
    K1, K2 = S, S+off
    nd = delta(K1)-delta(K2); q = int(60/nd); h = q*nd
    credit = call(K1)-call(K2)
    worst = 0
    for m in [x/100 for x in range(-20, 21, 1)]:
        for vol in (0.25, 0.5, 0.75):
            for days in (7, 3, 1, 0):
                s1, t1 = S*(1+m), days/365
                pv = -call(K1, s1, t1, vol)+call(K2, s1, t1, vol)+nd*(s1-S)
                worst = max(worst, -(pv+credit))
    print(off, round(nd, 4), q, round(q/90, 1), round(158.51/q, 2), round(worst, 2))
print(1-exp(-2.24), 1-exp(-10), 1e9*(exp(-2.24)-exp(-10)))
