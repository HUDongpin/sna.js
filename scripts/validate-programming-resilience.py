#!/usr/bin/env python3
"""Build private, local-only acceptance graphs from the sample workbook.

The workbook is never modified.  Row-level graph data is written only to a
directory outside the Git checkout; the script refuses an in-repository output
path so an accidental `git add` cannot publish participant-level records.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
from pathlib import Path

import numpy as np
import openpyxl
import pandas as pd


HEADERS = [
    "ID",
    "Gender",
    "Cmt1",
    "Cmt2",
    "Cmt3",
    "Cmt4",
    "Cnf1",
    "Cnf2",
    "Cnf3",
    "Cnf4",
    "Cop1",
    "Cop2",
    "Cop3",
    "Cop4",
    "Cmp1",
    "Cmp2",
    "Cmp3",
    "Cmp4",
]
ITEMS = HEADERS[2:]


def parse_args() -> argparse.Namespace:
    repo = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=repo.parent / "01_Programming_Resilience_811.xlsx",
    )
    parser.add_argument("--output-dir", type=Path, default=repo.parent / "validation")
    parser.add_argument("--sheet", default="数据")
    parser.add_argument("--correlation-threshold", type=float, default=0.30)
    parser.add_argument("--k", type=int, default=8)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def components(order: int, edges: list[dict[str, object]]) -> int:
    parent = list(range(order))

    def find(node: int) -> int:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    for edge in edges:
        source = int(edge["source"])
        target = int(edge["target"])
        root_source = find(source)
        root_target = find(target)
        if root_source != root_target:
            parent[root_target] = root_source
    return len({find(node) for node in range(order)})


def main() -> None:
    args = parse_args()
    repo = Path(__file__).resolve().parent.parent
    input_path = args.input.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir == repo or repo in output_dir.parents:
        raise ValueError("private validation output must remain outside the Git repository")
    if not 0 <= args.correlation_threshold <= 1:
        raise ValueError("correlation threshold must be between 0 and 1")
    if args.k < 1:
        raise ValueError("k must be positive")

    frame = pd.read_excel(input_path, sheet_name=args.sheet)
    if list(frame.columns) != HEADERS:
        raise ValueError(f"unexpected columns: {list(frame.columns)!r}")
    if frame["ID"].duplicated().any():
        raise ValueError("ID values must be unique")
    if frame.isna().any().any():
        raise ValueError("sample workbook contains missing values")
    values = frame[ITEMS].to_numpy(dtype=float)
    if np.any((values < 1) | (values > 5)):
        raise ValueError("Likert items must be in the inclusive range 1..5")

    correlations = frame[ITEMS].corr(method="pearson")
    item_edges: list[dict[str, object]] = []
    for source, source_name in enumerate(ITEMS):
        for target in range(source + 1, len(ITEMS)):
            weight = float(correlations.iloc[source, target])
            if abs(weight) >= args.correlation_threshold:
                item_edges.append(
                    {"source": source_name, "target": ITEMS[target], "weight": weight}
                )
    item_graph = {
        "directed": False,
        "nodes": [
            {"id": item, "attributes": {"construct": item[:3]}} for item in ITEMS
        ],
        "edges": item_edges,
    }

    standardized = (values - values.mean(axis=0)) / values.std(axis=0, ddof=1)
    squared_norm = np.sum(standardized * standardized, axis=1)
    squared_distances = np.maximum(
        squared_norm[:, None]
        + squared_norm[None, :]
        - 2 * standardized @ standardized.T,
        0,
    )
    np.fill_diagonal(squared_distances, np.inf)
    ids = frame["ID"].astype(int).to_numpy()
    selected: set[tuple[int, int]] = set()
    for source in range(len(frame)):
        ordered = np.lexsort((ids, squared_distances[source]))
        for target_raw in ordered[: args.k]:
            target = int(target_raw)
            selected.add((min(source, target), max(source, target)))
    respondent_edges = []
    for source, target in sorted(selected):
        distance = float(np.sqrt(squared_distances[source, target]))
        respondent_edges.append(
            {
                "source": source,
                "target": target,
                "weight": 1 / (1 + distance),
            }
        )
    respondent_graph = {
        "directed": False,
        "nodes": [
            {
                "id": index,
                "attributes": {
                    "sampleId": int(row.ID),
                    "gender": str(row.Gender),
                },
            }
            for index, row in enumerate(frame.itertuples(index=False))
        ],
        "edges": respondent_edges,
    }
    component_count = components(len(frame), respondent_edges)

    receipt = {
        "environment": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "openpyxl": openpyxl.__version__,
        },
        "source": input_path.name,
        "sha256": sha256(input_path),
        "sheet": args.sheet,
        "rows": int(len(frame)),
        "columns": int(len(frame.columns)),
        "missingCells": int(frame.isna().sum().sum()),
        "genderCounts": {
            str(key): int(value)
            for key, value in frame["Gender"].value_counts().sort_index().items()
        },
        "itemNetwork": {
            "nodes": len(ITEMS),
            "edges": len(item_edges),
            "threshold": args.correlation_threshold,
            "negativeEdges": sum(float(edge["weight"]) < 0 for edge in item_edges),
        },
        "respondentNetwork": {
            "nodes": int(len(frame)),
            "edges": len(respondent_edges),
            "k": args.k,
            "components": component_count,
            "weight": "1 / (1 + z-scored Euclidean distance)",
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "source-receipt.json").write_text(
        json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (output_dir / "item-network.local.json").write_text(
        json.dumps(item_graph, separators=(",", ":"), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (output_dir / "respondent-network.local.json").write_text(
        json.dumps(respondent_graph, separators=(",", ":"), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(receipt, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
