from math import log, sqrt, exp, erf, pi

def N(x):  # standard normal CDF
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))

def n(x):  # standard normal PDF
    return exp(-0.5 * x * x) / sqrt(2.0 * pi)

def bs(S, K, T, r, sigma, kind="call"):
    """European Black-Scholes (no dividends). T in years.
    Greeks: vega per 1 vol point, theta per calendar day, rho per 1% rate."""
    sqT = sqrt(T)
    d1 = (log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * sqT)
    d2 = d1 - sigma * sqT
    df = exp(-r * T)
    if kind == "call":
        price = S * N(d1) - K * df * N(d2)
        delta = N(d1)
        theta = -S * n(d1) * sigma / (2 * sqT) - r * K * df * N(d2)
        rho = K * T * df * N(d2)
    else:
        price = K * df * N(-d2) - S * N(-d1)
        delta = N(d1) - 1.0
        theta = -S * n(d1) * sigma / (2 * sqT) + r * K * df * N(-d2)
        rho = -K * T * df * N(-d2)
    gamma = n(d1) / (S * sigma * sqT)
    vega = S * n(d1) * sqT
    return {"price": price, "delta": delta, "gamma": gamma,
            "vega": vega / 100, "theta": theta / 365, "rho": rho / 100}

def black76(F, K, T, r, sigma, kind="call"):
    sqT = sqrt(T)
    d1 = (log(F / K) + 0.5 * sigma**2 * T) / (sigma * sqT)
    d2 = d1 - sigma * sqT
    df = exp(-r * T)
    if kind == "call":
        return df * (F * N(d1) - K * N(d2))
    return df * (K * N(-d2) - F * N(-d1))

def implied_vol(price, S, K, T, r, kind="call", lo=1e-4, hi=5.0):
    for _ in range(100):  # bisection: price is monotone increasing in sigma
        mid = 0.5 * (lo + hi)
        if bs(S, K, T, r, mid, kind)["price"] > price:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)

def payoff(kind, K, ST):
    return max(ST - K, 0.0) if kind == "call" else max(K - ST, 0.0)

if __name__ == "__main__":
    S, T, r, vol = 2500.0, 30 / 365, 0.0, 0.60
    for K in (2500, 2750):
        for kind in ("call", "put"):
            g = bs(S, K, T, r, vol, kind)
            print(K, kind, {k: round(v, 4) for k, v in g.items()})
    c = bs(S, 2500, T, r, vol)["price"]
    print("IV round-trip:", round(implied_vol(c, S, 2500, T, r), 4))
    # delta-hedged short ATM call, instantaneous ±10% jump
    g0 = bs(S, 2500, T, r, vol)
    for S1 in (2750.0, 2250.0):
        c1 = bs(S1, 2500, T, r, vol)["price"]
        pnl = -(c1 - g0["price"]) + g0["delta"] * (S1 - S)
        print(S1, round(pnl, 2), round(-0.5 * g0["gamma"] * (S1 - S) ** 2, 2))
