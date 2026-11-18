#!/usr/bin/env python3
"""Assert that Marquez received the expected lineage graph (stdlib only)."""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request

MARQUEZ = os.getenv("MARQUEZ_URL", "http://localhost:5002")
NAMESPACE = "postgres://warehouse-db:5432"
MART = "shop.marts.daily_revenue_by_country"
EXPECTED_UPSTREAM = {"shop.staging.orders_enriched", "shop.raw.orders", "shop.raw.customers"}


def get(path: str) -> dict:
    with urllib.request.urlopen(MARQUEZ + path, timeout=15) as response:
        return json.loads(response.read())


def upstream_datasets(graph: dict, start: str) -> set[str]:
    nodes = {n["id"]: n for n in graph["graph"]}
    seen, frontier = set(), [start]
    while frontier:
        node = nodes.get(frontier.pop())
        if not node:
            continue
        for edge in node.get("inEdges", []):
            origin = edge["origin"]
            if origin not in seen:
                seen.add(origin)
                frontier.append(origin)
    prefix = f"dataset:{NAMESPACE}:"
    return {n.removeprefix(prefix) for n in seen if n.startswith(prefix)}


def main() -> None:
    node = f"dataset:{NAMESPACE}:{MART}"
    deadline = time.time() + 120
    found: set[str] = set()
    while time.time() < deadline:
        try:
            graph = get("/api/v1/lineage?" + urllib.parse.urlencode({"nodeId": node, "depth": 10}))
            found = upstream_datasets(graph, node)
            if EXPECTED_UPSTREAM <= found:
                print(f"lineage OK: {MART} <- {sorted(found)}")
                return
        except Exception as err:  # Marquez may still be ingesting
            print(f"waiting for lineage ({err.__class__.__name__})")
        time.sleep(5)
    sys.exit(f"missing upstream datasets: {sorted(EXPECTED_UPSTREAM - found)}; got {sorted(found)}")


if __name__ == "__main__":
    main()
