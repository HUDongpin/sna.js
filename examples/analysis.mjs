import {
  betweenness,
  closeness,
  componentDist,
  componentSizeByVertex,
  connectedness,
  degree,
  dyadCensus,
  efficiency,
  evcent,
  gden,
  geodist,
  grecip,
  gtrans,
  hierarchy,
  isolates,
  mutuality,
  nties,
  reachability,
} from "../dist/index.js";

export const exampleGraph = [
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [1, 0, 0, 0],
  [0, 0, 0, 0],
];

export const exampleOptions = { mode: "digraph" };

export function runBasicAnalysis(graph = exampleGraph, options = exampleOptions) {
  const shortestPaths = geodist(graph, options);
  const weakComponents = componentDist(graph, { ...options, connected: "weak" });
  const strongComponents = componentDist(graph, { ...options, connected: "strong" });

  return {
    order: shortestPaths.distances.length,
    ties: nties(graph, options),
    density: gden(graph, options),
    dyadCensus: dyadCensus(graph, options),
    mutuality: mutuality(graph, options),
    reciprocity: grecip(graph, { ...options, measure: "dyadic" }),
    transitivity: gtrans(graph, { ...options, measure: "weak" }),
    connectedness: connectedness(graph, options),
    efficiency: efficiency(graph, options),
    hierarchy: hierarchy(graph, { ...options, measure: "reciprocity" }),
    outdegree: degree(graph, { ...options, cmode: "outdegree" }),
    indegree: degree(graph, { ...options, cmode: "indegree" }),
    totalDegree: degree(graph, { ...options, cmode: "total" }),
    closeness: closeness(graph, { ...options, cmode: "directed" }),
    gilSchmidtCloseness: closeness(graph, { ...options, cmode: "gil-schmidt" }),
    betweenness: betweenness(graph, { ...options, cmode: "directed" }),
    eigenvector: evcent(graph, options),
    isolates: isolates(graph, options),
    weakComponents,
    strongComponents,
    componentSizeByVertex: componentSizeByVertex(graph, { ...options, connected: "weak" }),
    reachability: reachability(graph, options),
    shortestDistances: shortestPaths.distances,
  };
}
