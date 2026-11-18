from __future__ import annotations

import argparse

from lib.tables import Tables


def parse_args(description: str, extra=None) -> tuple[argparse.Namespace, Tables]:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--batch-date", required=True, help="YYYY-MM-DD load batch")
    parser.add_argument("--lake-root", help="path-based Delta tables (local)")
    parser.add_argument("--catalog", help="Unity Catalog catalog (Databricks)")
    parser.add_argument("--schema", help="Unity Catalog schema (Databricks)")
    if extra:
        extra(parser)
    args = parser.parse_args()
    return args, Tables(root=args.lake_root, catalog=args.catalog, schema=args.schema)
