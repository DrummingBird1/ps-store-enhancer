#!/usr/bin/env python3
"""Check that the external APIs the extension depends on still answer in the shape the code expects.

The OpenCritic API silently started requiring a key and the extension kept "working" by falling
back to hardcoded data — this check exists so that can't happen unnoticed again. Run nightly by
.github/workflows/api-health.yml; run it locally with:  python scripts/check-apis.py

Exit code 0 = all good, 1 = at least one dependency is broken (details on stdout).
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

# CheapShark rejects missing/generic User-Agents (curl's default included).
UA = "PSStoreEnhancer-HealthCheck/1.0 (+https://github.com/DrummingBird1/ps-store-enhancer)"
CS = "https://www.cheapshark.com/api/1.0"
FRANKFURTER = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=ILS"

failures = []


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def check(name, fn):
    try:
        detail = fn()
        print(f"ok    {name}" + (f" — {detail}" if detail else ""))
    except Exception as e:  # noqa: BLE001 - report every failure kind the same way
        failures.append(name)
        print(f"FAIL  {name} — {type(e).__name__}: {e}")


def require(cond, msg):
    if not cond:
        raise AssertionError(msg)


state = {}


def games_search():
    data = get(f"{CS}/games?title={urllib.parse.quote('elden ring')}&limit=10")
    require(isinstance(data, list) and data, "empty or non-list response")
    for k in ("gameID", "external", "cheapest"):
        require(k in data[0], f"missing field '{k}' in first result")
    exact = [g for g in data if g["external"].lower() == "elden ring"]
    require(exact, "no exact 'ELDEN RING' result among the first 10")
    state["gameID"] = exact[0]["gameID"]
    state["steamAppID"] = exact[0].get("steamAppID")
    return f"{len(data)} results"


def game_detail():
    data = get(f"{CS}/games?id={state['gameID']}")
    require(set(("info", "cheapestPriceEver", "deals")) <= set(data), f"keys: {sorted(data)}")
    require(data["deals"], "no deals")
    for k in ("storeID", "dealID", "price", "retailPrice", "savings"):
        require(k in data["deals"][0], f"deal is missing '{k}'")
    require("price" in data["cheapestPriceEver"] and "date" in data["cheapestPriceEver"], "cheapestPriceEver shape")
    return f"{len(data['deals'])} deals"


def ratings():
    require(state.get("steamAppID"), "search result had no steamAppID")
    data = get(f"{CS}/deals?steamAppID={state['steamAppID']}&pageSize=1")
    require(isinstance(data, list) and data, "no deal for the Steam app")
    for k in ("metacriticScore", "steamRatingPercent", "steamRatingCount", "steamRatingText"):
        require(k in data[0], f"deal is missing '{k}'")
    return f"metacritic={data[0]['metacriticScore']} steam={data[0]['steamRatingPercent']}%"


def stores():
    data = get(f"{CS}/stores")
    require(isinstance(data, list) and len(data) > 5, "unexpected stores list")
    require("storeID" in data[0] and "storeName" in data[0], "store shape")
    names = {s["storeID"]: s["storeName"] for s in data}
    require(names.get("1") == "Steam", "storeID 1 is no longer Steam")
    return f"{len(data)} stores"


def frankfurter():
    data = get(FRANKFURTER)
    require(isinstance(data.get("rates", {}).get("ILS"), (int, float)), "no ILS rate")
    return f"1 USD = {data['rates']['ILS']} ILS"


check("CheapShark: games search", games_search)
if "gameID" in state:
    check("CheapShark: game detail (deals + all-time low)", game_detail)
    check("CheapShark: Metacritic / Steam ratings", ratings)
check("CheapShark: store names", stores)
check("Frankfurter: exchange rates", frankfurter)

if failures:
    print(f"\n{len(failures)} check(s) failed: {', '.join(failures)}")
    sys.exit(1)
print("\nAll external APIs look healthy.")
