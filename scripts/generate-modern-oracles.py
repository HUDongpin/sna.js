#!/usr/bin/env python3
"""Generate deterministic external-oracle fixtures for the modern SNA API.

This script is development/test tooling only.  The published JavaScript
package has no Python dependency.  NetworkX supplies the primary numeric
oracle.  python-igraph independently cross-checks PageRank, HITS (on a graph
with a unique dominant singular vector), and modularity where definitions are
directly comparable.
"""

from __future__ import annotations

import hashlib
import json
import math
import platform
import sys
import warnings
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import igraph as ig
import networkx as nx
import numpy as np
import scipy


EXPECTED = {
    "igraph": "1.0.0",
    "networkx": "3.6.1",
    "numpy": "2.5.2",
    "scipy": "1.18.1",
}
SEED = 20260824
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "fixtures" / "modern" / "oracles.json"


def assert_versions() -> None:
    actual = {
        "igraph": ig.__version__,
        "networkx": nx.__version__,
        "numpy": np.__version__,
        "scipy": scipy.__version__,
    }
    if actual != EXPECTED:
        raise RuntimeError(
            "oracle dependencies do not match scripts/modern-oracle-requirements.txt: "
            f"expected {EXPECTED}, got {actual}"
        )
    if sys.version_info[:2] != (3, 13):
        raise RuntimeError(
            "oracle fixtures are generated with Python 3.13; "
            f"got {sys.version_info.major}.{sys.version_info.minor}"
        )


def finite(value: Any) -> Any:
    """Convert NumPy values and non-finite floats to deterministic JSON values."""
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        if value == 0:
            return 0.0
        # External solvers can differ in their last few ULPs across BLAS/ARPACK
        # builds. Fourteen significant digits retain far more precision than
        # the test tolerance while keeping regenerated JSON byte-stable.
        return float(f"{value:.14g}")
    if isinstance(value, Mapping):
        return {str(key): finite(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [finite(item) for item in value]
    return value


def add_attributes(graph: nx.Graph, *, karate: bool = False) -> nx.Graph:
    nodes = list(graph.nodes)
    midpoint = max(1, len(nodes) // 2)
    for position, node in enumerate(nodes):
        if karate:
            group = str(graph.nodes[node]["club"])
        else:
            group = "A" if position < midpoint else "B"
        graph.nodes[node]["group"] = group
        graph.nodes[node]["score"] = float(position)
    return graph


def corpus() -> list[tuple[str, nx.Graph]]:
    empty = add_attributes(nx.Graph())
    singleton = add_attributes(nx.empty_graph(1))
    path = add_attributes(nx.path_graph(5))
    star = add_attributes(nx.star_graph(5))
    cycle = add_attributes(nx.cycle_graph(6))
    complete = add_attributes(nx.complete_graph(5))

    disconnected = nx.Graph()
    disconnected.add_nodes_from(range(7))
    disconnected.add_edges_from([(0, 1), (1, 2), (3, 4), (4, 5), (5, 3)])
    add_attributes(disconnected)

    directed = nx.DiGraph()
    directed.add_nodes_from(range(7))
    directed.add_edges_from(
        [(0, 1), (1, 2), (2, 0), (2, 3), (3, 4), (4, 3), (5, 6)]
    )
    add_attributes(directed)

    # A strongly connected, asymmetric adjacency with a simple dominant HITS
    # singular vector. This avoids non-unique vectors on paths/cycles/stars.
    directed_hits = nx.DiGraph()
    directed_hits.add_nodes_from(range(5))
    directed_hits.add_edges_from(
        [
            (0, 1),
            (0, 2),
            (0, 3),
            (1, 2),
            (1, 3),
            (2, 0),
            (2, 3),
            (2, 4),
            (3, 0),
            (3, 4),
            (4, 0),
            (4, 1),
        ]
    )
    add_attributes(directed_hits)

    weighted = nx.Graph()
    weighted.add_nodes_from(range(5))
    weighted.add_weighted_edges_from(
        [(0, 1, 1.0), (1, 2, 2.0), (2, 0, 3.0), (2, 3, 4.0), (3, 4, 0.5)]
    )
    add_attributes(weighted)

    loops = nx.Graph()
    loops.add_nodes_from(range(4))
    loops.add_weighted_edges_from(
        [(0, 0, 2.0), (0, 1, 1.0), (1, 2, 1.0), (2, 3, 1.0)]
    )
    add_attributes(loops)

    bipartite = add_attributes(nx.complete_bipartite_graph(3, 4))
    for node, attributes in bipartite.nodes(data=True):
        # Preserve the generating bipartition as the categorical oracle value.
        attributes["group"] = f"part-{attributes['bipartite']}"

    planted = add_attributes(
        nx.planted_partition_graph(
            l=3,
            k=5,
            p_in=0.8,
            p_out=0.05,
            seed=SEED,
        )
    )
    for node, attributes in planted.nodes(data=True):
        # The external partition oracle below uses the known generating blocks;
        # no community-detection membership is copied from either library.
        attributes["group"] = f"block-{attributes['block']}"

    karate = add_attributes(nx.karate_club_graph(), karate=True)
    # The built-in graph has historical interaction weights. The corpus entry
    # intentionally tests the canonical unweighted topology.
    for _left, _right, attributes in karate.edges(data=True):
        attributes.clear()

    return [
        ("empty", empty),
        ("singleton", singleton),
        ("path-5", path),
        ("star-6", star),
        ("cycle-6", cycle),
        ("complete-5", complete),
        ("disconnected", disconnected),
        ("directed-scc-wcc", directed),
        ("directed-hits", directed_hits),
        ("weighted", weighted),
        ("loops", loops),
        ("bipartite-3-4", bipartite),
        ("planted-partition-3x5", planted),
        ("zachary-karate", karate),
    ]


def graph_data(graph: nx.Graph) -> dict[str, Any]:
    nodes = []
    for node, attributes in graph.nodes(data=True):
        nodes.append(
            {
                "id": int(node),
                "attributes": {
                    "group": str(attributes["group"]),
                    "score": float(attributes["score"]),
                },
            }
        )

    edges = []
    for source, target, attributes in graph.edges(data=True):
        edge: dict[str, Any] = {"source": int(source), "target": int(target)}
        if "weight" in attributes:
            edge["weight"] = float(attributes["weight"])
        edges.append(edge)
    return {"directed": graph.is_directed(), "nodes": nodes, "edges": edges}


def node_values(nodes: Sequence[int], values: Mapping[int, float]) -> list[float | None]:
    return [finite(values[node]) for node in nodes]


def igraph_graph(graph: nx.Graph) -> ig.Graph:
    edges = [(int(source), int(target)) for source, target in graph.edges]
    result = ig.Graph(n=graph.number_of_nodes(), edges=edges, directed=graph.is_directed())
    result.es["weight"] = [float(graph.edges[edge].get("weight", 1.0)) for edge in graph.edges]
    return result


def l2_nonnegative(values: Iterable[float]) -> list[float]:
    result = np.abs(np.asarray(list(values), dtype=float))
    norm = float(np.linalg.norm(result))
    if norm > 0:
        result /= norm
    return [float(value) for value in result]


def assert_close(left: Sequence[float], right: Sequence[float], label: str, tolerance: float = 1e-8) -> None:
    if len(left) != len(right) or any(abs(a - b) > tolerance for a, b in zip(left, right)):
        raise RuntimeError(f"NetworkX/igraph cross-check failed for {label}: {left} != {right}")


def pagerank_oracle(graph: nx.Graph, nodes: Sequence[int]) -> dict[str, Any]:
    nx_values = nx.pagerank(graph, alpha=0.85, max_iter=2_000, tol=1e-13, weight="weight")
    nx_vector = node_values(nodes, nx_values)
    ig_graph = igraph_graph(graph)
    ig_vector = [
        float(value)
        for value in ig_graph.pagerank(
            directed=graph.is_directed(), damping=0.85, weights="weight"
        )
    ]
    result: dict[str, Any] = {
        "damping": 0.85,
        "weighted": True,
        "values": nx_vector,
    }
    if nx.number_of_selfloops(graph) == 0:
        assert_close([float(value) for value in nx_vector], ig_vector, "PageRank", tolerance=2e-8)
        result["igraphValues"] = finite(ig_vector)
    else:
        result["igraphCompatibility"] = (
            "not cross-checked: NetworkX and igraph use different undirected self-loop transition conventions"
        )
    return result


def personalized_pagerank_oracle(graph: nx.DiGraph, nodes: Sequence[int]) -> dict[str, Any]:
    # Non-uniform vectors cover both modern API options. They are deliberately
    # not normalized here; both libraries/API normalize them internally.
    personalization = [float(index + 1) for index in range(len(nodes))]
    dangling = [float(len(nodes) - index) for index in range(len(nodes))]
    nx_personalization = dict(zip(nodes, personalization))
    nx_dangling = dict(zip(nodes, dangling))
    values = nx.pagerank(
        graph,
        alpha=0.85,
        personalization=nx_personalization,
        dangling=nx_dangling,
        max_iter=2_000,
        tol=1e-13,
        weight="weight",
    )
    return {
        "damping": 0.85,
        "weighted": True,
        "personalization": personalization,
        "dangling": dangling,
        "values": node_values(nodes, values),
    }


def hits_oracle(graph: nx.DiGraph, nodes: Sequence[int]) -> dict[str, Any]:
    hubs, authorities = nx.hits(
        graph,
        max_iter=2_000,
        tol=1e-13,
        nstart={node: 1.0 for node in nodes},
        normalized=False,
    )
    nx_hubs = l2_nonnegative(hubs[node] for node in nodes)
    nx_authorities = l2_nonnegative(authorities[node] for node in nodes)

    ig_graph = igraph_graph(graph)
    ig_hubs = l2_nonnegative(ig_graph.hub_score(weights="weight", scale=False))
    ig_authorities = l2_nonnegative(ig_graph.authority_score(weights="weight", scale=False))
    assert_close(nx_hubs, ig_hubs, "HITS hubs", tolerance=2e-8)
    assert_close(nx_authorities, ig_authorities, "HITS authorities", tolerance=2e-8)
    return {
        "weighted": True,
        "hubs": nx_hubs,
        "authorities": nx_authorities,
        "igraphHubs": ig_hubs,
        "igraphAuthorities": ig_authorities,
    }


def harmonic_oracle(graph: nx.Graph, nodes: Sequence[int]) -> dict[str, Any]:
    weighted = any("weight" in attributes for *_edge, attributes in graph.edges(data=True))
    oracle_graph = graph.copy()
    distance_key: str | None = None
    if weighted:
        distance_key = "oracle_distance"
        for _left, _right, attributes in oracle_graph.edges(data=True):
            strength = float(attributes.get("weight", 1.0))
            if strength <= 0:
                raise RuntimeError("weighted harmonic oracle requires positive strengths")
            attributes[distance_key] = 1.0 / strength
    # NetworkX's directed harmonic centrality measures paths ending at the
    # scored node. The modern API names this explicitly as direction='in'.
    values = nx.harmonic_centrality(oracle_graph, distance=distance_key)
    return {
        "direction": "in" if graph.is_directed() else "out",
        "weighted": weighted,
        "values": node_values(nodes, values),
    }


def labels_for(values: Sequence[Any], *, sorted_labels: bool = False) -> list[Any]:
    result = list(dict.fromkeys(values))
    return sorted(result) if sorted_labels else result


def matrix_values(matrix: np.ndarray) -> list[list[float]]:
    return [[float(value) for value in row] for row in matrix.tolist()]


def degree_values(graph: nx.Graph, mode: str) -> dict[int, float]:
    if not graph.is_directed() or mode == "total":
        return {int(node): float(value) for node, value in graph.degree(weight=None)}
    if mode == "in":
        return {int(node): float(value) for node, value in graph.in_degree(weight=None)}
    return {int(node): float(value) for node, value in graph.out_degree(weight=None)}


def mixing_oracles(graph: nx.Graph, nodes: Sequence[int]) -> dict[str, Any]:
    source_mode = "out" if graph.is_directed() else "total"
    target_mode = "in" if graph.is_directed() else "total"
    source_degree = degree_values(graph, source_mode)
    target_degree = degree_values(graph, target_mode)
    degree_labels = sorted(set(source_degree.values()) | set(target_degree.values()))
    degree_mapping = {label: index for index, label in enumerate(degree_labels)}
    degree_matrix = nx.degree_mixing_matrix(
        graph,
        x=source_mode,
        y=target_mode,
        weight=None,
        mapping=degree_mapping,
        normalized=True,
    )

    groups = [str(graph.nodes[node]["group"]) for node in nodes]
    group_labels = labels_for(groups)
    group_mapping = {label: index for index, label in enumerate(group_labels)}
    attribute_matrix = nx.attribute_mixing_matrix(
        graph, "group", mapping=group_mapping, normalized=True
    )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        degree_assortativity = nx.degree_assortativity_coefficient(
            graph, x=source_mode, y=target_mode, weight=None
        )
        reverse_assortativity = None
        if graph.is_directed():
            reverse_assortativity = nx.degree_assortativity_coefficient(
                graph, x="in", y="out", weight=None
            )
        categorical = nx.attribute_assortativity_coefficient(graph, "group")
        numeric = nx.numeric_assortativity_coefficient(graph, "score")

    return finite(
        {
            "degreeAssortativity": {
                "source": source_mode,
                "target": target_mode,
                "weighted": False,
                "value": degree_assortativity,
            },
            "reverseDegreeAssortativity": (
                {
                    "source": "in",
                    "target": "out",
                    "weighted": False,
                    "value": reverse_assortativity,
                }
                if graph.is_directed()
                else None
            ),
            "degreeMixing": {
                "labels": degree_labels,
                "values": matrix_values(degree_matrix),
            },
            "categoricalAssortativity": categorical,
            "numericAssortativity": numeric,
            "attributeMixing": {
                "attribute": "group",
                "labels": group_labels,
                "values": matrix_values(attribute_matrix),
            },
        }
    )


def statistics_oracles(graph: nx.Graph, nodes: Sequence[int]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "clustering": {
            "unweighted": node_values(nodes, nx.clustering(graph, weight=None)),
            "weighted": node_values(nodes, nx.clustering(graph, weight="weight")),
        },
    }
    if graph.number_of_nodes() > 0:
        unweighted = list(nx.clustering(graph, weight=None).values())
        weighted = list(nx.clustering(graph, weight="weight").values())
        nonzero = [value for value in unweighted if value != 0]
        result["averageClustering"] = {
            "unweighted": sum(unweighted) / len(unweighted),
            "weighted": sum(weighted) / len(weighted),
            "unweightedNonZero": (
                sum(nonzero) / len(nonzero) if nonzero else None
            ),
        }
    if graph.number_of_edges() > 0:
        result["mixing"] = mixing_oracles(graph, nodes)
    if not graph.is_directed():
        result["triangles"] = node_values(nodes, nx.triangles(graph))
    if (
        not graph.is_directed()
        and graph.number_of_edges() > 0
        and nx.number_of_selfloops(graph) == 0
    ):
        result["structuralHoles"] = finite(
            {
                "constraint": node_values(
                    nodes, nx.constraint(graph, nodes=nodes, weight=None)
                ),
                "effectiveSize": node_values(
                    nodes, nx.effective_size(graph, nodes=nodes, weight=None)
                ),
                "weightedConstraint": node_values(
                    nodes, nx.constraint(graph, nodes=nodes, weight="weight")
                ),
                "weightedEffectiveSize": node_values(
                    nodes,
                    nx.effective_size(graph, nodes=nodes, weight="weight"),
                ),
            }
        )
    return finite(result)


def candidate_non_edges(graph: nx.Graph, limit: int = 5) -> list[tuple[int, int]]:
    if graph.is_directed() or graph.number_of_nodes() < 2:
        return []
    pairs = sorted((int(left), int(right)) for left, right in nx.non_edges(graph))
    return pairs[:limit]


def link_prediction_oracle(graph: nx.Graph) -> dict[str, Any] | None:
    if graph.is_directed() or nx.number_of_selfloops(graph) > 0:
        return None
    pairs = candidate_non_edges(graph)
    if not pairs:
        return None

    def scores(iterator: Iterable[tuple[int, int, float]]) -> list[float]:
        by_pair = {(int(left), int(right)): float(score) for left, right, score in iterator}
        return [finite(by_pair[pair]) for pair in pairs]

    common = [len(list(nx.common_neighbors(graph, left, right))) for left, right in pairs]
    return {
        "pairs": [list(pair) for pair in pairs],
        "commonNeighbors": common,
        "jaccardCoefficient": scores(nx.jaccard_coefficient(graph, pairs)),
        "adamicAdar": scores(nx.adamic_adar_index(graph, pairs)),
        "resourceAllocation": scores(nx.resource_allocation_index(graph, pairs)),
        "preferentialAttachment": scores(
            nx.preferential_attachment(graph, pairs)
        ),
    }


def partition_for(name: str, graph: nx.Graph) -> list[list[int]] | None:
    partitions: dict[str, list[list[int]]] = {
        "path-5": [[0, 1], [2, 3, 4]],
        "star-6": [[0, 1, 2], [3, 4, 5]],
        "cycle-6": [[0, 1, 2], [3, 4, 5]],
        "complete-5": [[0, 1], [2, 3, 4]],
        "disconnected": [[0, 1, 2], [3, 4, 5], [6]],
        "directed-scc-wcc": [[0, 1, 2, 3, 4], [5, 6]],
        "directed-hits": [[0, 1, 2], [3, 4]],
        "weighted": [[0, 1, 2], [3, 4]],
        "loops": [[0, 1], [2, 3]],
        "bipartite-3-4": [[0, 1, 2], [3, 4, 5, 6]],
        "planted-partition-3x5": [
            [0, 1, 2, 3, 4],
            [5, 6, 7, 8, 9],
            [10, 11, 12, 13, 14],
        ],
    }
    if name == "zachary-karate":
        groups: dict[str, list[int]] = {}
        for node in graph.nodes:
            groups.setdefault(str(graph.nodes[node]["club"]), []).append(int(node))
        return list(groups.values())
    return partitions.get(name)


def membership_from_partition(nodes: Sequence[int], partition: Sequence[Sequence[int]]) -> list[int]:
    membership_by_node: dict[int, int] = {}
    for community, members in enumerate(partition):
        for node in members:
            membership_by_node[node] = community
    return [membership_by_node[node] for node in nodes]


def partition_oracle(name: str, graph: nx.Graph, nodes: Sequence[int]) -> dict[str, Any] | None:
    partition = partition_for(name, graph)
    if partition is None or graph.number_of_edges() == 0:
        return None
    nx_modularity = nx.community.modularity(
        graph, partition, weight="weight", resolution=1.0
    )
    ig_graph = igraph_graph(graph)
    membership = membership_from_partition(nodes, partition)
    result: dict[str, Any] = {
        "communities": partition,
        "modularity": float(nx_modularity),
    }
    if nx.number_of_selfloops(graph) == 0:
        ig_modularity = ig_graph.modularity(
            membership,
            weights="weight",
            resolution=1.0,
            directed=graph.is_directed(),
        )
        if abs(float(nx_modularity) - float(ig_modularity)) > 2e-8:
            raise RuntimeError(
                f"NetworkX/igraph modularity cross-check failed for {name}: "
                f"{nx_modularity} != {ig_modularity}"
            )
        result["igraphModularity"] = float(ig_modularity)
    else:
        result["igraphCompatibility"] = (
            "not cross-checked: NetworkX and igraph use different undirected self-loop degree conventions"
        )
    if not graph.is_directed() and nx.number_of_selfloops(graph) == 0:
        coverage, performance = nx.community.partition_quality(graph, partition)
        result["quality"] = {
            "coverage": float(coverage),
            "performance": float(performance),
        }
    return finite(result)


def case(name: str, graph: nx.Graph) -> dict[str, Any]:
    nodes = [int(node) for node in graph.nodes]
    oracle: dict[str, Any] = {
        "pageRank": pagerank_oracle(graph, nodes),
        "harmonicCentrality": harmonic_oracle(graph, nodes),
        "statistics": statistics_oracles(graph, nodes),
    }
    if name == "directed-hits":
        oracle["hits"] = hits_oracle(graph, nodes)
    if name == "directed-scc-wcc":
        oracle["personalizedPageRank"] = personalized_pagerank_oracle(graph, nodes)

    prediction = link_prediction_oracle(graph)
    if prediction is not None:
        oracle["linkPrediction"] = prediction

    partition = partition_oracle(name, graph, nodes)
    if partition is not None:
        oracle["partition"] = partition

    return {"name": name, "graph": graph_data(graph), "oracle": finite(oracle)}


def payload() -> dict[str, Any]:
    cases = [case(name, graph) for name, graph in corpus()]
    corpus_digest = hashlib.sha256(
        json.dumps([entry["graph"] for entry in cases], separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    return {
        "schemaVersion": 1,
        "provenance": {
            "generator": "scripts/generate-modern-oracles.py",
            "requirements": "scripts/modern-oracle-requirements.txt",
            "python": f"{sys.version_info.major}.{sys.version_info.minor}",
            "implementation": platform.python_implementation(),
            "libraries": EXPECTED,
            "seed": SEED,
            "corpusSha256": corpus_digest,
            "primaryOracle": "NetworkX 3.6.1",
            "secondaryOracle": "python-igraph 1.0.0",
            "references": [
                "https://networkx.org/documentation/stable/reference/algorithms/index.html",
                "https://networkx.org/documentation/stable/reference/algorithms/community.html",
                "https://python.igraph.org/en/1.0.0/api/igraph.Graph.html",
            ],
            "notes": [
                "Random community memberships are intentionally not oracle-gated; tests validate deterministic invariants and recomputed quality instead.",
                "NetworkX is the primary numeric oracle; igraph cross-checks directly comparable PageRank, HITS, and modularity values.",
                "Directed harmonic centrality uses incoming paths to match NetworkX semantics explicitly.",
                "NetworkX effective_size is called with an explicit node list so the documented Burt formula is used; its 3.6.1 all-nodes sparse shortcut disagrees on weighted graphs.",
            ],
        },
        "cases": cases,
    }


def main() -> None:
    assert_versions()
    result = payload()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(OUTPUT.relative_to(ROOT)),
                "cases": len(result["cases"]),
                "corpusSha256": result["provenance"]["corpusSha256"],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
