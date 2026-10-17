"""Train the claims fraud-risk model offline and export it as a portable JSON artifact.

The model is a standardized logistic regression: small, auditable (every score decomposes
into per-feature contributions), and trivially portable to the TypeScript runtime without
an inference server. Training data is SYNTHETIC — generated here from a documented
generative process with a fixed seed — so the artifact is fully reproducible.

Usage:
    uv run python train_fraud_model.py                # train + write artifact
    uv run python train_fraud_model.py --check        # retrain and verify committed artifact
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

SEED = 20261017
N_SAMPLES = 20_000
MODEL_VERSION = "fraud-lr-1.0.0"
ARTIFACT = Path(__file__).resolve().parent.parent / "packages" / "core" / "src" / "ml" / "fraud-model.v1.json"

FEATURES = [
    ("log_claim_amount", "ln(1 + claimed amount in USD)"),
    ("amount_to_limit", "claimed amount / policy coverage limit, capped at 3"),
    ("policy_tenure_log", "ln(1 + days between policy start and loss date)"),
    ("report_delay_days", "days between loss and first notice, capped at 365"),
    ("prior_claims_24m", "claims on the same policy in the previous 24 months, capped at 10"),
    ("night_incident", "1 if the incident happened between 00:00 and 04:59"),
    ("missing_police_report", "1 if theft/collision/vandalism was not reported to police"),
    ("documentation_gap", "1 if no amount-bearing document, else |claimed - documented| / claimed (max 1)"),
]

# Ground-truth generative coefficients (raw feature space) used ONLY to synthesize labels.
TRUE_INTERCEPT = -7.4
TRUE_COEF = np.array([0.35, 1.6, -0.55, 0.02, 0.45, 0.8, 1.1, 2.2])
CENTER = np.array([0.0, 0.0, -5.5, 0.0, 0.0, 0.0, 0.0, 0.0])


def synthesize(rng: np.random.Generator, n: int) -> tuple[np.ndarray, np.ndarray]:
    claimed = np.clip(rng.lognormal(mean=8.3, sigma=0.9, size=n), 100, 250_000)
    limit = rng.choice([15_000, 25_000, 50_000, 100_000], size=n, p=[0.25, 0.35, 0.3, 0.1])
    new_policy = rng.random(n) < 0.15
    tenure = np.where(new_policy, rng.integers(1, 60, size=n), rng.integers(60, 3_000, size=n))
    late = rng.random(n) < 0.1
    delay = np.where(late, rng.integers(15, 120, size=n), np.round(rng.exponential(3.0, size=n)))
    prior = np.clip(rng.poisson(0.4, size=n), 0, 10)
    night = (rng.random(n) < 0.12).astype(float)
    missing_police = (rng.random(n) < 0.25).astype(float)
    no_docs = rng.random(n) < 0.12
    gap = np.where(no_docs, 1.0, np.clip(np.abs(rng.normal(0, 0.08, size=n)), 0, 1))

    x = np.column_stack(
        [
            np.log1p(claimed),
            np.minimum(claimed / limit, 3.0),
            np.log1p(tenure),
            np.minimum(delay, 365),
            prior,
            night,
            missing_police,
            gap,
        ]
    ).astype(float)
    logit = TRUE_INTERCEPT + (x + CENTER) @ TRUE_COEF
    y = (rng.random(n) < 1.0 / (1.0 + np.exp(-logit))).astype(int)
    return x, y


def train() -> dict:
    rng = np.random.default_rng(SEED)
    x, y = synthesize(rng, N_SAMPLES)
    x_tr, x_te, y_tr, y_te = train_test_split(x, y, test_size=0.25, random_state=SEED, stratify=y)

    scaler = StandardScaler().fit(x_tr)
    clf = LogisticRegression(C=1.0, max_iter=1_000, solver="lbfgs").fit(scaler.transform(x_tr), y_tr)
    proba = clf.predict_proba(scaler.transform(x_te))[:, 1]

    def at(threshold: float) -> dict:
        pred = (proba >= threshold).astype(int)
        return {
            "threshold": threshold,
            "precision": round(float(precision_score(y_te, pred, zero_division=0)), 4),
            "recall": round(float(recall_score(y_te, pred, zero_division=0)), 4),
            "flagRate": round(float(pred.mean()), 4),
        }

    coef = clf.coef_[0]
    intercept = float(clf.intercept_[0])
    features = [
        {"name": name, "description": desc, "mean": float(m), "scale": float(s), "coefficient": float(c)}
        for (name, desc), m, s, c in zip(FEATURES, scaler.mean_, scaler.scale_, coef, strict=True)
    ]

    # Parity vectors: the TS scorer must reproduce these probabilities to 1e-9.
    parity = []
    for row in x_te[:8]:
        z = intercept + float(np.sum((row - scaler.mean_) / scaler.scale_ * coef))
        parity.append(
            {
                "features": {name: float(v) for (name, _), v in zip(FEATURES, row, strict=True)},
                "probability": 1.0 / (1.0 + math.exp(-z)),
            }
        )

    # Hash a rounded, platform-independent representation: libm may differ in the last ulp across OS/CPU.
    canonical = np.round(x, 9).astype("<f8").tobytes() + y.astype("<i8").tobytes()
    data_hash = hashlib.sha256(canonical).hexdigest()[:16]
    return {
        "modelVersion": MODEL_VERSION,
        "algorithm": "standardized logistic regression (L2, lbfgs)",
        "intercept": intercept,
        "features": features,
        "bands": {"medium": 0.3, "high": 0.7},
        "metrics": {
            "rocAuc": round(float(roc_auc_score(y_te, proba)), 4),
            "brier": round(float(brier_score_loss(y_te, proba)), 4),
            "atMedium": at(0.3),
            "atHigh": at(0.7),
        },
        "training": {
            "dataset": "synthetic (see ml/train_fraud_model.py::synthesize)",
            "samples": N_SAMPLES,
            "testFraction": 0.25,
            "positiveRate": round(float(y.mean()), 4),
            "seed": SEED,
            "dataHash": data_hash,
            "sklearnVersion": sklearn.__version__,
            "numpyVersion": np.__version__,
        },
        "parityVectors": parity,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify the committed artifact is reproducible")
    args = parser.parse_args()
    model = train()
    if args.check:
        # Data generation is bit-exact (seeded PCG64); the optimizer result can differ in the last
        # digits across CPU/BLAS builds, so coefficients are compared with a solver-level tolerance.
        committed = json.loads(ARTIFACT.read_text())
        coef_diff = max(
            [abs(committed["intercept"] - model["intercept"])]
            + [abs(a["coefficient"] - b["coefficient"]) for a, b in zip(committed["features"], model["features"], strict=True)]
        )
        mean_diff = max(abs(a["mean"] - b["mean"]) for a, b in zip(committed["features"], model["features"], strict=True))
        same_data = committed["training"]["dataHash"] == model["training"]["dataHash"]
        auc_diff = abs(committed["metrics"]["rocAuc"] - model["metrics"]["rocAuc"])
        ok = same_data and coef_diff < 1e-3 and mean_diff < 1e-9 and auc_diff <= 1e-4
        print(
            f"artifact reproducible: {ok} (same_data={same_data}, max_coef_diff={coef_diff:.2e}, "
            f"max_mean_diff={mean_diff:.2e}, auc={model['metrics']['rocAuc']})"
        )
        return 0 if ok else 1
    ARTIFACT.write_text(json.dumps(model, indent=2) + "\n")
    print(json.dumps({"artifact": str(ARTIFACT), **model["metrics"], **model["training"]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
