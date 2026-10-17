from __future__ import annotations

import json

from ragplatform.adapters.memory.store import InMemoryStore
from ragplatform.container import build_container
from ragplatform.evals import metrics
from ragplatform.evals.runner import EvalRunner, check_thresholds, load_golden
from tests.conftest import CORPUS, ROOT, make_settings


def test_metric_functions() -> None:
    assert metrics.recall_at_k(["a", "b", "c"], {"c"}, 2) == 0.0
    assert metrics.recall_at_k(["a", "b", "c"], {"c"}, 3) == 1.0
    assert metrics.reciprocal_rank(["a", "b"], {"b"}) == 0.5
    assert metrics.citation_precision(["a", "a", "b"], {"a"}) == 2 / 3
    assert metrics.citation_precision([], {"a"}) == 0.0
    assert (
        metrics.faithfulness(
            "Laptops are replaced every 3 years [x].", ["Laptops are replaced every 3 years."]
        )
        == 1.0
    )
    assert metrics.faithfulness("The moon is made of cheese.", ["Laptops are replaced."]) == 0.0
    assert metrics.contains_all("It is 16 Weeks", ["16 weeks"])
    assert metrics.percentile([1, 2, 3, 4], 0.5) in (2, 3)


def test_threshold_checks() -> None:
    failures = check_thresholds(
        {"recall_at_k": 0.5, "acl_leaks": 1.0},
        {"recall_at_k": {"min": 0.9}, "acl_leaks": {"max": 0}, "mrr": {"min": 0.1}},
    )
    assert len(failures) == 3


async def test_golden_set_passes_thresholds_offline() -> None:
    container = build_container(make_settings(), memory_store=InMemoryStore())
    runner = EvalRunner(container, k=5)
    await runner.ingest_corpus(CORPUS)
    thresholds = json.loads((ROOT / "evals" / "thresholds.json").read_text())
    report = await runner.run(load_golden(ROOT / "evals" / "golden.jsonl"), thresholds)
    assert report.passed, report.failures
    assert report.metrics["acl_leaks"] == 0
    assert report.metrics["forbidden_string_hits"] == 0
    assert json.loads(report.to_json())["items"] == report.items


async def test_llm_judge_path_with_fake_model() -> None:
    container = build_container(make_settings(), memory_store=InMemoryStore())
    runner = EvalRunner(container, k=5, judge="llm")
    await runner.ingest_corpus(CORPUS)
    items = [i for i in load_golden(ROOT / "evals" / "golden.jsonl") if i.id == "vpn-client"]
    report = await runner.run(items, {})
    assert report.metrics["judge_faithfulness"] == 1.0
