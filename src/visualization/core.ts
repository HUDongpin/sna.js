import { createNumberMatrix } from "../core/matrix";
import { resolveRandomSource, type RandomOptions, type RandomSource } from "../core/random";
import type { GraphInput, GraphMode } from "../core/types";
import { asEdgelistSna, asSociomatrixSna, symmetrize, type SnaEdgeList } from "../algorithms/dataprep";
import { degree } from "../algorithms/degree";
import { geodist } from "../algorithms/geodist";
import { isIsolate } from "../algorithms/isolates";

export type GplotMode = "digraph" | "graph" | "twomode";
export type GplotLayoutMode =
  | "adj"
  | "circle"
  | "circrand"
  | "eigen"
  | "fruchtermanreingold"
  | "geodist"
  | "hall"
  | "kamadakawai"
  | "mds"
  | "princoord"
  | "random"
  | "rmds"
  | "segeo"
  | "seham"
  | "spring"
  | "springrepulse"
  | "target";

export interface Coordinate2D {
  readonly x: number;
  readonly y: number;
}

export interface Coordinate3D extends Coordinate2D {
  readonly z: number;
}

export interface Bounds2D {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly width: number;
  readonly height: number;
}

export interface GplotLayoutOptions extends RandomOptions {
  readonly mode?: GplotLayoutMode;
  readonly gmode?: GplotMode;
  readonly diag?: boolean;
  readonly dim?: 2 | 3;
  readonly coord?: readonly (readonly number[])[];
  readonly jitter?: boolean;
  readonly layoutPar?: GplotLayoutPar;
}

export interface GplotLayoutPar {
  readonly niter?: number;
  readonly maxDelta?: number;
  readonly area?: number;
  readonly coolExp?: number;
  readonly repulseRad?: number;
  readonly seedCoord?: readonly (readonly number[])[];
  readonly sigma?: number;
  readonly initemp?: number;
  readonly coolexp?: number;
  readonly kkconst?: number;
  readonly edgeValAsStr?: boolean;
  readonly elen?: readonly (readonly number[])[];
  readonly dist?: "canberra" | "euclidean" | "manhattan" | "maximum" | "none" | "normal" | "unif" | "uniang";
  readonly var?: "col" | "invadj" | "geodist" | "raw" | "rcdiff" | "rcsum" | "row" | "rowcol" | "symupper" | "symlower" | "symstrong" | "symweak" | "user";
  readonly exp?: number;
  readonly mat?: readonly (readonly number[])[];
  readonly evsel?: "first" | "size";
  readonly radius?: readonly number[] | number;
  readonly circRad?: readonly number[] | number;
  readonly periphOutside?: boolean;
  readonly periphOutsideOffset?: number;
}

export interface GplotOptions extends RandomOptions {
  readonly g?: number;
  readonly gmode?: GplotMode;
  readonly diag?: boolean;
  readonly label?: readonly (string | number)[];
  readonly coord?: readonly (readonly number[])[];
  readonly jitter?: boolean;
  readonly thresh?: number;
  readonly threshAbsval?: boolean;
  readonly usearrows?: boolean;
  readonly mode?: GplotLayoutMode;
  readonly displayisolates?: boolean;
  readonly interactive?: boolean;
  readonly xlab?: string;
  readonly ylab?: string;
  readonly xlim?: readonly [number, number];
  readonly ylim?: readonly [number, number];
  readonly pad?: number;
  readonly labelPad?: number;
  readonly displaylabels?: boolean;
  readonly boxedLabels?: boolean;
  readonly labelPos?: number | readonly number[];
  readonly labelBg?: string | readonly string[];
  readonly vertexEnclose?: boolean;
  readonly vertexSides?: number | readonly number[];
  readonly vertexRot?: number | readonly number[];
  readonly arrowheadCex?: number;
  readonly labelCex?: number | readonly number[];
  readonly loopCex?: number | readonly number[];
  readonly vertexCex?: number | readonly number[];
  readonly edgeCol?: string | number | readonly (string | number)[];
  readonly labelCol?: string | number | readonly (string | number)[];
  readonly vertexCol?: string | number | readonly (string | number)[];
  readonly labelBorder?: string | number | readonly (string | number)[];
  readonly vertexBorder?: string | number | readonly (string | number)[];
  readonly edgeLty?: number | readonly number[];
  readonly edgeLtyNeg?: number | null;
  readonly labelLty?: number | readonly number[] | null;
  readonly vertexLty?: number | readonly number[];
  readonly edgeLwd?: number | readonly number[];
  readonly labelLwd?: number | readonly number[];
  readonly edgeLen?: number;
  readonly edgeCurve?: number;
  readonly edgeSteps?: number;
  readonly loopSteps?: number;
  readonly objectScale?: number;
  readonly uselen?: boolean;
  readonly usecurve?: boolean;
  readonly suppressAxes?: boolean;
  readonly verticesLast?: boolean;
  readonly layoutPar?: GplotLayoutPar;
  readonly width?: number;
  readonly height?: number;
}

export interface GplotNode {
  readonly id: number;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly sides: number;
  readonly color: string;
  readonly border: string;
  readonly visible: boolean;
}

export interface GplotEdge {
  readonly tail: number;
  readonly head: number;
  readonly value: number;
  readonly path: string;
  readonly color: string;
  readonly width: number;
  readonly lty: number;
  readonly arrowhead: boolean;
}

export interface GplotLoop {
  readonly vertex: number;
  readonly value: number;
  readonly path: string;
  readonly color: string;
  readonly width: number;
  readonly arrowhead: boolean;
}

export interface GplotLabel {
  readonly vertex: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly boxed: boolean;
}

export interface GplotResult {
  readonly nodes: GplotNode[];
  readonly edges: GplotEdge[];
  readonly loops: GplotLoop[];
  readonly labels: GplotLabel[];
  readonly bounds: Bounds2D;
  readonly coordinates: Coordinate2D[];
  readonly svg: string;
}

export interface PlotSociomatrixOptions {
  readonly labels?: readonly [readonly (string | number)[] | null, readonly (string | number)[] | null];
  readonly drawlab?: boolean;
  readonly diaglab?: boolean;
  readonly drawlines?: boolean;
  readonly xlab?: string;
  readonly ylab?: string;
  readonly scaleValues?: boolean;
  readonly cellCol?: (value: number) => string;
  readonly width?: number;
  readonly height?: number;
}

export interface SociomatrixCell {
  readonly row: number;
  readonly col: number;
  readonly value: number;
  readonly scaledValue: number;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlotSociomatrixResult {
  readonly cells: SociomatrixCell[];
  readonly labels: readonly [string[], string[]];
  readonly bounds: Bounds2D;
  readonly svg: string;
}

export interface ArrowOptions {
  readonly length?: number;
  readonly width?: number;
  readonly color?: string | number;
  readonly border?: string | number;
  readonly lty?: number;
  readonly offsetHead?: number;
  readonly offsetTail?: number;
  readonly arrowhead?: boolean;
  readonly curve?: number;
  readonly edgeSteps?: number;
}

export interface PrimitiveSvgResult {
  readonly path: string;
  readonly svg: string;
}

export function gplot(input: GraphInput | readonly GraphInput[], options: GplotOptions = {}): GplotResult {
  if (options.interactive) throw new Error("gplot interactive locator mode is not implemented in SNA.js visualization.");

  const gmode = options.gmode ?? "digraph";
  const diag = options.diag ?? false;
  const selected = selectGraph(input, options.g ?? 0, gmode, diag);
  const order = selected.order;
  const rawEdges = selected.edges.filter((edge) => !Number.isNaN(edge[2]));
  const threshold = options.thresh ?? 0;
  const threshAbsval = options.threshAbsval ?? true;
  const edges = rawEdges.filter((edge) => (threshAbsval ? Math.abs(edge[2]) > threshold : edge[2] > threshold));
  const graphForLayout: SnaEdgeList = { ...selected, edges };
  const layoutOptions: GplotLayoutOptions = {
    mode: options.mode ?? "fruchtermanreingold",
    gmode,
    diag,
    dim: 2,
    jitter: options.jitter ?? true,
    ...(options.coord === undefined ? {} : { coord: options.coord }),
    ...(options.layoutPar === undefined ? {} : { layoutPar: options.layoutPar }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(options.rng === undefined ? {} : { rng: options.rng }),
  };
  const coordinates = normalizeCoordinates(maybeJitter(layoutByMode(graphForLayout, layoutOptions), options.jitter ?? true, 2, options));
  const displayIsolates = options.displayisolates ?? true;
  const visible = Array.from({ length: order }, (_unused, vertex) => displayIsolates || !isIsolate(selected, vertex, { mode: gmode === "graph" ? "graph" : "digraph", diag }));
  const labels = resolveLabels(options.label, order);
  const displayLabels = options.displaylabels ?? options.label !== undefined;
  const bounds = resolveBounds(coordinates, visible, options);
  const baseRadius = Math.min(bounds.width, bounds.height) * (options.objectScale ?? 0.01) * (16 / (4 + Math.sqrt(Math.max(order, 1))));
  const vertexCex = recycleNumbers(options.vertexCex ?? 1, order);
  const vertexSides = recycleNumbers(options.vertexSides ?? (gmode === "twomode" && selected.bipartite !== undefined ? twoModeValues(order, selected.bipartite, 50, 4) : 50), order);
  const vertexColor = recycleColors(options.vertexCol ?? (gmode === "twomode" && selected.bipartite !== undefined ? twoModeValues(order, selected.bipartite, "red", "blue") : "red"), order);
  const vertexBorder = recycleColors(options.vertexBorder ?? "black", order);
  const nodeData = coordinates.map((coord, vertex) => ({
    id: vertex,
    label: labels[vertex]!,
    x: coord.x,
    y: coord.y,
    radius: baseRadius * vertexCex[vertex]!,
    sides: vertexSides[vertex]!,
    color: vertexColor[vertex]!,
    border: vertexBorder[vertex]!,
    visible: visible[vertex]!,
  }));

  const useArrows = gmode === "graph" ? false : (options.usearrows ?? true);
  const edgeColors = recycleColors(options.edgeCol ?? "black", Math.max(edges.length, 1));
  const edgeWidths = recycleNumbers(options.edgeLwd ?? baseRadius * 0.75, Math.max(edges.length, 1));
  const edgeLty = edgeLineTypes(edges, options);
  const plottedEdges: GplotEdge[] = [];
  const loops: GplotLoop[] = [];
  for (let index = 0; index < edges.length; index += 1) {
    const [tail, head, value] = edges[index]!;
    if (!visible[tail] || !visible[head]) continue;
    if (tail === head) {
      const loop = gplotLoop(coordinates[tail]!.x, coordinates[tail]!.y, {
        length: baseRadius * 5 * (recycleNumbers(options.loopCex ?? 1, order)[tail] ?? 1),
        width: edgeWidths[index]!,
        color: edgeColors[index]!,
        arrowhead: useArrows,
        ...(options.loopSteps === undefined ? {} : { edgeSteps: options.loopSteps }),
      });
      loops.push({ vertex: tail, value, path: loop.path, color: edgeColors[index]!, width: edgeWidths[index]!, arrowhead: useArrows });
      continue;
    }
    const tailRadius = nodeData[tail]!.radius;
    const headRadius = nodeData[head]!.radius;
    const arrow = gplotArrow(coordinates[tail]!.x, coordinates[tail]!.y, coordinates[head]!.x, coordinates[head]!.y, {
      length: (options.edgeLen ?? 0.5) * baseRadius * (options.arrowheadCex ?? 1),
      width: edgeWidths[index]!,
      color: edgeColors[index]!,
      offsetTail: tailRadius,
      offsetHead: headRadius,
      arrowhead: useArrows,
      curve: options.usecurve ? (options.edgeCurve ?? 0.1) : 0,
      ...(options.edgeSteps === undefined ? {} : { edgeSteps: options.edgeSteps }),
      lty: edgeLty[index]!,
    });
    plottedEdges.push({
      tail,
      head,
      value,
      path: arrow.path,
      color: edgeColors[index]!,
      width: edgeWidths[index]!,
      lty: edgeLty[index]!,
      arrowhead: useArrows,
    });
  }

  const labelData = displayLabels ? buildLabels(nodeData, labels, options) : [];
  const svg = renderGplotSvg(nodeData, plottedEdges, loops, labelData, bounds, options);
  return { nodes: nodeData, edges: plottedEdges, loops, labels: labelData, bounds, coordinates, svg };
}

export function plotSociomatrix(input: GraphInput, options: PlotSociomatrixOptions = {}): PlotSociomatrixResult {
  const matrix = asSociomatrixSna(input) as number[][];
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const width = options.width ?? Math.max(240, cols * 24 + 80);
  const height = options.height ?? Math.max(240, rows * 24 + 80);
  const margin = options.drawlab ?? true ? 48 : 12;
  const cellWidth = (width - margin - 12) / Math.max(cols, 1);
  const cellHeight = (height - margin - 12) / Math.max(rows, 1);
  const labels = resolveMatrixLabels(options.labels, rows, cols);
  const values = matrix.flat().filter((value) => !Number.isNaN(value));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const color = options.cellCol ?? grayscale;
  const cells: SociomatrixCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const value = matrix[row]![col]!;
      const scaledValue = Number.isNaN(value) ? Number.NaN : options.scaleValues === false || max === min ? value : 1 - (value - min) / (max - min);
      cells.push({
        row,
        col,
        value,
        scaledValue,
        color: Number.isNaN(scaledValue) ? "#ffffff" : color(scaledValue),
        x: margin + col * cellWidth,
        y: margin + row * cellHeight,
        width: cellWidth,
        height: cellHeight,
      });
    }
  }
  const svg = renderSociomatrixSvg(cells, labels, rows, cols, width, height, margin, cellWidth, cellHeight, options);
  return {
    cells,
    labels,
    bounds: { xMin: 0, xMax: width, yMin: 0, yMax: height, width, height },
    svg,
  };
}

export function gplotArrow(x0: number, y0: number, x1: number, y1: number, options: ArrowOptions = {}): PrimitiveSvgResult {
  const curve = options.curve ?? 0;
  const { start, end } = offsetSegment({ x: x0, y: y0 }, { x: x1, y: y1 }, options.offsetTail ?? 0, options.offsetHead ?? 0);
  let path: string;
  if (curve === 0) {
    path = `M ${fmt(start.x)} ${fmt(start.y)} L ${fmt(end.x)} ${fmt(end.y)}`;
  } else {
    const mid = midpoint(start, end);
    const perp = unitPerp(start, end);
    const distance = euclidean(start, end);
    const control = { x: mid.x + perp.x * curve * distance, y: mid.y + perp.y * curve * distance };
    path = `M ${fmt(start.x)} ${fmt(start.y)} Q ${fmt(control.x)} ${fmt(control.y)} ${fmt(end.x)} ${fmt(end.y)}`;
  }
  const stroke = colorToCss(options.color ?? "black");
  const marker = options.arrowhead === false ? "" : ` marker-end="url(#sna-arrowhead)"`;
  return { path, svg: `<path d="${path}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${fmt(options.width ?? 1)}"${dash(options.lty ?? 1)}${marker}/>` };
}

export function gplotLoop(x0: number, y0: number, options: ArrowOptions & { radius?: number; angle?: number } = {}): PrimitiveSvgResult {
  const radius = options.radius ?? options.length ?? 0.1;
  const path = `M ${fmt(x0)} ${fmt(y0 - radius)} C ${fmt(x0 + radius)} ${fmt(y0 - radius * 1.8)} ${fmt(x0 + radius * 1.8)} ${fmt(y0 + radius * 0.8)} ${fmt(x0)} ${fmt(y0 + radius)}`;
  const stroke = colorToCss(options.color ?? "black");
  const marker = options.arrowhead === false ? "" : ` marker-end="url(#sna-arrowhead)"`;
  return { path, svg: `<path d="${path}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${fmt(options.width ?? 1)}"${dash(options.lty ?? 1)}${marker}/>` };
}

export function gplotVertex(x: number, y: number, radius = 1, sides = 4, options: { border?: string | number; col?: string | number; lty?: number; rot?: number } = {}): string {
  const fill = colorToCss(options.col ?? "red");
  const stroke = colorToCss(options.border ?? "black");
  if (sides >= 40) return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(radius)}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}"${dash(options.lty ?? 1)}/>`;
  const points = polygonPoints(x, y, radius, Math.max(3, Math.round(sides)), options.rot ?? 0).map((point) => `${fmt(point.x)},${fmt(point.y)}`).join(" ");
  return `<polygon points="${points}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}"${dash(options.lty ?? 1)}/>`;
}

export function gplotTarget(input: GraphInput, x: readonly number[], options: GplotOptions & { circRad?: readonly number[]; circCol?: string; circLwd?: number } = {}): GplotResult {
  const radii = options.circRad ?? [0.1, 0.2, 0.4, 0.6, 0.8, 1];
  const coord = x.map((value, index) => {
    const angle = (2 * Math.PI * index) / Math.max(x.length, 1);
    return [value * Math.cos(angle), value * Math.sin(angle)] as const;
  });
  return gplot(input, { ...options, coord, mode: "target", layoutPar: { ...(options.layoutPar ?? {}), circRad: radii } });
}

export function gplotLayout(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return layoutByMode(input, { ...options, dim: options.dim ?? 2 });
}

export function gplotLayoutCircle(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return circleLayout(graphOrder(input), options.dim ?? 2);
}

export function gplotLayoutCircrand(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  const n = graphOrder(input);
  const rng = resolveRandomSource(options);
  const angles = Array.from({ length: n }, () => rng() * 2 * Math.PI).sort((a, b) => a - b);
  return angles.map((angle) => (options.dim === 3 ? [Math.sin(angle), Math.cos(angle), 0] : [Math.sin(angle), Math.cos(angle)]));
}

export function gplotLayoutRandom(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  const n = graphOrder(input);
  const rng = resolveRandomSource(options);
  const dist = options.layoutPar?.dist ?? "euclidean";
  if (dist === "uniang") {
    const radius = recycleNumbers(options.layoutPar?.radius ?? 1, n);
    return Array.from({ length: n }, (_unused, index) => {
      const angle = rng() * 2 * Math.PI;
      const r = radius[index]!;
      return options.dim === 3 ? [r * Math.sin(angle), r * Math.cos(angle), 0] : [r * Math.sin(angle), r * Math.cos(angle)];
    });
  }
  return Array.from({ length: n }, () => Array.from({ length: options.dim ?? 2 }, () => rng() * 2 - 1));
}

export function gplotLayoutTarget(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  const n = graphOrder(input);
  const radii = recycleNumbers(options.layoutPar?.circRad ?? options.layoutPar?.radius ?? 1, n);
  return Array.from({ length: n }, (_unused, index) => {
    const angle = (2 * Math.PI * index) / Math.max(n, 1);
    const r = radii[index]!;
    return options.dim === 3 ? [r * Math.cos(angle), r * Math.sin(angle), 0] : [r * Math.cos(angle), r * Math.sin(angle)];
  });
}

export function gplotLayoutMds(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  const matrix = variableMatrix(input, options);
  const distances = distanceMatrixFromVariable(matrix, options.layoutPar);
  return classicalMds(distances, options.dim ?? 2);
}

export function gplotLayoutAdj(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return gplotLayoutMds(input, { ...options, layoutPar: { ...(options.layoutPar ?? {}), var: "invadj", dist: "none", exp: 1 } });
}

export function gplotLayoutGeodist(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return gplotLayoutMds(input, { ...options, layoutPar: { ...(options.layoutPar ?? {}), var: "geodist", dist: "none", exp: 1 } });
}

export function gplotLayoutRmds(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return gplotLayoutMds(input, { ...options, layoutPar: { ...(options.layoutPar ?? {}), dist: "euclidean", var: "raw" } });
}

export function gplotLayoutSegeo(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return gplotLayoutMds(input, { ...options, layoutPar: { ...(options.layoutPar ?? {}), var: "geodist", dist: "euclidean" } });
}

export function gplotLayoutSeham(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return gplotLayoutMds(input, { ...options, layoutPar: { ...(options.layoutPar ?? {}), var: "rowcol", dist: "manhattan", exp: 1 } });
}

export function gplotLayoutPrincoord(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  const matrix = correlationMatrix(toMatrix(input));
  return eigenCoordinates(matrix, options.dim ?? 2, "size");
}

export function gplotLayoutEigen(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  const matrix = variableMatrix(input, options);
  return eigenCoordinates(symmetrizedMatrix(matrix), options.dim ?? 2, options.layoutPar?.evsel ?? "first");
}

export function gplotLayoutHall(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  const matrix = symmetrize(toMatrix(input), { rule: "weak" }) as number[][];
  const n = matrix.length;
  const laplacian = createNumberMatrix(n, n);
  const deg = degree(matrix, { mode: "graph" });
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) laplacian[i]![j] = i === j ? deg[i]! : -matrix[i]![j]!;
  }
  const eig = jacobiEigen(laplacian);
  const order = eig.values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value).map((entry) => entry.index);
  return coordinatesFromEigenvectors(eig.vectors, order.slice(1, (options.dim ?? 2) + 1), options.dim ?? 2);
}

export function gplotLayoutFruchtermanreingold(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return forceLayout(input, options, "fr");
}

export function gplotLayoutKamadakawai(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return forceLayout(input, options, "kk");
}

export function gplotLayoutSpring(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return forceLayout(input, options, "spring");
}

export function gplotLayoutSpringrepulse(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions = {}): number[][] {
  return forceLayout(input, options, "springrepulse");
}

export function layoutByMode(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions): number[][] {
  if (options.coord) return options.coord.map((row) => row.slice(0, options.dim ?? 2) as number[]);
  switch (options.mode ?? "fruchtermanreingold") {
    case "adj":
      return gplotLayoutAdj(input, options);
    case "circle":
      return gplotLayoutCircle(input, options);
    case "circrand":
      return gplotLayoutCircrand(input, options);
    case "eigen":
      return gplotLayoutEigen(input, options);
    case "geodist":
      return gplotLayoutGeodist(input, options);
    case "hall":
      return gplotLayoutHall(input, options);
    case "kamadakawai":
      return gplotLayoutKamadakawai(input, options);
    case "mds":
      return gplotLayoutMds(input, options);
    case "princoord":
      return gplotLayoutPrincoord(input, options);
    case "random":
      return gplotLayoutRandom(input, options);
    case "rmds":
      return gplotLayoutRmds(input, options);
    case "segeo":
      return gplotLayoutSegeo(input, options);
    case "seham":
      return gplotLayoutSeham(input, options);
    case "spring":
      return gplotLayoutSpring(input, options);
    case "springrepulse":
      return gplotLayoutSpringrepulse(input, options);
    case "target":
      return gplotLayoutTarget(input, options);
    case "fruchtermanreingold":
    default:
      return gplotLayoutFruchtermanreingold(input, options);
  }
}

export function visualizationR2D() {
  return {
    gplot,
    "gplot.arrow": gplotArrow,
    "gplot.layout.adj": gplotLayoutAdj,
    "gplot.layout.circle": gplotLayoutCircle,
    "gplot.layout.circrand": gplotLayoutCircrand,
    "gplot.layout.eigen": gplotLayoutEigen,
    "gplot.layout.fruchtermanreingold": gplotLayoutFruchtermanreingold,
    "gplot.layout.geodist": gplotLayoutGeodist,
    "gplot.layout.hall": gplotLayoutHall,
    "gplot.layout.kamadakawai": gplotLayoutKamadakawai,
    "gplot.layout.mds": gplotLayoutMds,
    "gplot.layout.princoord": gplotLayoutPrincoord,
    "gplot.layout.random": gplotLayoutRandom,
    "gplot.layout.rmds": gplotLayoutRmds,
    "gplot.layout.segeo": gplotLayoutSegeo,
    "gplot.layout.seham": gplotLayoutSeham,
    "gplot.layout.spring": gplotLayoutSpring,
    "gplot.layout.springrepulse": gplotLayoutSpringrepulse,
    "gplot.layout.target": gplotLayoutTarget,
    "gplot.loop": gplotLoop,
    "gplot.target": gplotTarget,
    "gplot.vertex": gplotVertex,
    "plot.sociomatrix": plotSociomatrix,
    sociomatrixplot: plotSociomatrix,
  } as const;
}

function forceLayout(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions, variant: "fr" | "kk" | "spring" | "springrepulse"): number[][] {
  const matrix = symmetrize(toMatrix(input), { rule: "weak" }) as number[][];
  const n = matrix.length;
  const dim = options.dim ?? 2;
  if (n === 0) return [];
  const rng = resolveRandomSource(options);
  const layoutPar = options.layoutPar ?? {};
  const iterations = layoutPar.niter ?? (variant === "fr" ? 500 : 1000);
  const area = layoutPar.area ?? n * n;
  const k = Math.sqrt(area / Math.max(n, 1));
  let positions = layoutPar.seedCoord ? layoutPar.seedCoord.map((row) => Array.from({ length: dim }, (_unused, d) => row[d] ?? 0)) : gplotLayoutRandom(input, { ...options, dim, rng });
  if (variant === "kk") positions = gplotLayoutCircle(input, { ...options, dim });
  for (let iter = 0; iter < iterations; iter += 1) {
    const temperature = (layoutPar.maxDelta ?? n) * (1 - iter / Math.max(iterations, 1)) ** (layoutPar.coolExp ?? layoutPar.coolexp ?? 3);
    const disp = Array.from({ length: n }, () => Array.from({ length: dim }, () => 0));
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const delta = vectorDiff(positions[i]!, positions[j]!);
        const distance = Math.max(vectorNorm(delta), 1e-6);
        const repulse = variant === "spring" ? k / distance : (k * k) / distance;
        const dispI = disp[i]!;
        const dispJ = disp[j]!;
        for (let d = 0; d < dim; d += 1) {
          const force = (delta[d]! / distance) * repulse;
          dispI[d] = dispI[d]! + force;
          dispJ[d] = dispJ[d]! - force;
        }
      }
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j || matrix[i]![j]! === 0) continue;
        const delta = vectorDiff(positions[i]!, positions[j]!);
        const distance = Math.max(vectorNorm(delta), 1e-6);
        const attraction = variant === "kk" ? (distance - geodesicLength(matrix, i, j)) / Math.max(geodesicLength(matrix, i, j), 1) : (distance * distance) / k;
        const dispI = disp[i]!;
        for (let d = 0; d < dim; d += 1) dispI[d] = dispI[d]! - (delta[d]! / distance) * attraction * 0.5;
      }
    }
    if (variant === "springrepulse") {
      for (let i = 0; i < n; i += 1) {
        const dispI = disp[i]!;
        const posI = positions[i]!;
        for (let d = 0; d < dim; d += 1) dispI[d] = dispI[d]! + posI[d]! * -0.01;
      }
    }
    positions = positions.map((position, i) => {
      const move = disp[i]!;
      const norm = Math.max(vectorNorm(move), 1e-9);
      return position.map((value, d) => value + (move[d]! / norm) * Math.min(norm, temperature));
    });
  }
  return positions;
}

function geodesicLength(matrix: number[][], i: number, j: number): number {
  const d = geodist(matrix, { mode: "graph", infReplace: matrix.length * 1.25 }).distances[i]![j]!;
  return Math.max(d, 1);
}

function selectGraph(input: GraphInput | readonly GraphInput[], g: number, gmode: GplotMode, diag = true): SnaEdgeList {
  const asDigraph = gmode !== "graph";
  const forceBipartite = gmode === "twomode";
  const edgelist = asEdgelistSna(input as never, { asDigraph, forceBipartite, suppressDiag: !diag }) as SnaEdgeList | SnaEdgeList[];
  if (Array.isArray(edgelist)) {
    if (!Number.isInteger(g) || g < 0 || g >= edgelist.length) throw new RangeError("g is outside graph stack");
    return edgelist[g]!;
  }
  return edgelist;
}

function graphOrder(input: GraphInput | SnaEdgeList): number {
  if (isSnaEdgeList(input)) return input.order;
  return (asSociomatrixSna(input) as number[][]).length;
}

function toMatrix(input: GraphInput | SnaEdgeList): number[][] {
  return asSociomatrixSna(input as never) as number[][];
}

function isSnaEdgeList(input: GraphInput | SnaEdgeList): input is SnaEdgeList {
  return typeof input === "object" && input !== null && !Array.isArray(input) && "edges" in input && "order" in input;
}

function normalizeCoordinates(coords: readonly (readonly number[])[]): Coordinate2D[] {
  return coords.map((coord) => ({ x: finiteOrZero(coord[0]), y: finiteOrZero(coord[1]) }));
}

function maybeJitter(coords: number[][], enabled: boolean, dim: 2 | 3, options: RandomOptions): number[][] {
  if (!enabled) return coords;
  const rng = resolveRandomSource(options);
  return coords.map((row) => Array.from({ length: dim }, (_unused, axis) => finiteOrZero(row[axis]) + (rng() - 0.5) * 1e-6));
}

function circleLayout(n: number, dim: 2 | 3): number[][] {
  return Array.from({ length: n }, (_unused, index) => {
    const angle = (2 * Math.PI * index) / Math.max(n, 1);
    return dim === 3 ? [Math.sin(angle), Math.cos(angle), 0] : [Math.sin(angle), Math.cos(angle)];
  });
}

function variableMatrix(input: GraphInput | SnaEdgeList, options: GplotLayoutOptions): number[][] {
  const matrix = toMatrix(input);
  switch (options.layoutPar?.var) {
    case "rowcol":
      return matrix.map((row, index) => [...row, ...matrix.map((inner) => finiteOrZero(inner[index]))]);
    case "col":
      return transposeMatrix(matrix);
    case "row":
      return matrix.map((row) => [...row]);
    case "rcsum":
      return matrix.map((row, i) => row.map((value, j) => finiteOrZero(value) + finiteOrZero(matrix[j]?.[i])));
    case "rcdiff":
      return matrix.map((row, i) => row.map((value, j) => finiteOrZero(matrix[j]?.[i]) - finiteOrZero(value)));
    case "invadj":
      return matrix.map((row, i) => {
        const finite = matrix.flat().filter(Number.isFinite);
        const max = finite.length ? Math.max(...finite) : 1;
        return row.map((value, j) => (i === j ? 0 : Number.isNaN(value) ? matrix.length : max - value));
      });
    case "geodist":
      return geodist(matrix, { mode: "digraph", infReplace: matrix.length }).distances;
    case "symupper":
      return symmetrize(matrix, { rule: "upper" }) as number[][];
    case "symlower":
      return symmetrize(matrix, { rule: "lower" }) as number[][];
    case "symstrong":
      return symmetrize(matrix, { rule: "strong" }) as number[][];
    case "symweak":
      return symmetrize(matrix, { rule: "weak" }) as number[][];
    case "user":
      return (options.layoutPar.mat ?? matrix).map((row) => [...row]);
    case "raw":
    default:
      return matrix;
  }
}

function distanceMatrixFromVariable(matrix: number[][], layoutPar: GplotLayoutPar | undefined): number[][] {
  const dist = layoutPar?.dist ?? "euclidean";
  if (dist !== "none") {
    const n = matrix.length;
    const out = createNumberMatrix(n, n);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) out[i]![j] = rowDistance(matrix[i]!, matrix[j]!, dist);
    return out;
  }
  const exponent = layoutPar?.exp ?? 1;
  return matrix.map((row, i) => row.map((value, j) => (i === j ? 0 : Math.abs(finiteOrZero(value)) ** exponent)));
}

function classicalMds(distances: number[][], dim: 2 | 3): number[][] {
  const n = distances.length;
  if (n === 0) return [];
  const d2 = distances.map((row) => row.map((value) => finiteOrZero(value) ** 2));
  const rowMeans = d2.map((row) => row.reduce((sum, value) => sum + value, 0) / n);
  const colMeans = Array.from({ length: n }, (_unused, col) => d2.reduce((sum, row) => sum + row[col]!, 0) / n);
  const totalMean = rowMeans.reduce((sum, value) => sum + value, 0) / n;
  const centered = createNumberMatrix(n, n);
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) centered[i]![j] = -0.5 * (d2[i]![j]! - rowMeans[i]! - colMeans[j]! + totalMean);
  const eig = jacobiEigen(centered);
  const order = eig.values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value).map((entry) => entry.index);
  return Array.from({ length: n }, (_unused, row) =>
    Array.from({ length: dim }, (_unused, axis) => {
      const eigIndex = order[axis];
      if (eigIndex === undefined) return 0;
      return eig.vectors[row]![eigIndex]! * Math.sqrt(Math.max(eig.values[eigIndex]!, 0));
    }),
  );
}

function eigenCoordinates(matrix: number[][], dim: 2 | 3, evsel: "first" | "size"): number[][] {
  const eig = jacobiEigen(matrix);
  const order =
    evsel === "size"
      ? eig.values.map((value, index) => ({ value: Math.abs(value), index })).sort((a, b) => b.value - a.value).map((entry) => entry.index)
      : eig.values.map((_value, index) => index);
  return coordinatesFromEigenvectors(eig.vectors, order.slice(0, dim), dim);
}

function coordinatesFromEigenvectors(vectors: number[][], indices: readonly number[], dim: 2 | 3): number[][] {
  return vectors.map((row) => Array.from({ length: dim }, (_unused, axis) => row[indices[axis] ?? 0] ?? 0));
}

function jacobiEigen(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const a = symmetrizedMatrix(input);
  const vectors = createNumberMatrix(n, n);
  for (let i = 0; i < n; i += 1) vectors[i]![i] = 1;
  for (let iter = 0; iter < Math.max(1, n * n * 30); iter += 1) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const value = Math.abs(a[i]![j]!);
        if (value > max) {
          max = value;
          p = i;
          q = j;
        }
      }
    }
    if (max < 1e-10) break;
    const app = a[p]![p]!;
    const aqq = a[q]![q]!;
    const apq = a[p]![q]!;
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    for (let i = 0; i < n; i += 1) {
      const aip = a[i]![p]!;
      const aiq = a[i]![q]!;
      a[i]![p] = c * aip - s * aiq;
      a[i]![q] = s * aip + c * aiq;
    }
    for (let j = 0; j < n; j += 1) {
      const apj = a[p]![j]!;
      const aqj = a[q]![j]!;
      a[p]![j] = c * apj - s * aqj;
      a[q]![j] = s * apj + c * aqj;
    }
    for (let i = 0; i < n; i += 1) {
      const vip = vectors[i]![p]!;
      const viq = vectors[i]![q]!;
      vectors[i]![p] = c * vip - s * viq;
      vectors[i]![q] = s * vip + c * viq;
    }
  }
  return { values: a.map((row, index) => row[index] ?? 0), vectors };
}

function symmetrizedMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const out = createNumberMatrix(n, n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) out[i]![j] = (finiteOrZero(matrix[i]?.[j]) + finiteOrZero(matrix[j]?.[i])) / 2;
  }
  return out;
}

function structuralEquivalenceDistance(matrix: number[][]): number[][] {
  const n = matrix.length;
  const out = createNumberMatrix(n, n);
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) out[i]![j] = euclideanRows(matrix[i]!, matrix[j]!);
  return out;
}

function correlationMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const out = createNumberMatrix(n, n);
  const rows = matrix.map((row) => {
    const avg = row.reduce((sum, value) => sum + finiteOrZero(value), 0) / Math.max(row.length, 1);
    return row.map((value) => finiteOrZero(value) - avg);
  });
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const denom = Math.sqrt(dot(rows[i]!, rows[i]!) * dot(rows[j]!, rows[j]!));
      out[i]![j] = denom === 0 ? 0 : dot(rows[i]!, rows[j]!) / denom;
    }
  }
  return out;
}

function resolveLabels(labels: readonly (string | number)[] | undefined, order: number): string[] {
  return Array.from({ length: order }, (_unused, index) => String(labels?.[index] ?? index + 1));
}

function buildLabels(nodes: readonly GplotNode[], labels: readonly string[], options: GplotOptions): GplotLabel[] {
  const labelColor = recycleColors(options.labelCol ?? "black", nodes.length);
  const positions = recycleNumbers(options.labelPos ?? 0, nodes.length);
  const pad = options.labelPad ?? 0.5;
  return nodes
    .filter((node) => node.visible)
    .map((node) => {
      const angle = (positions[node.id] ?? 0) * (Math.PI / 4);
      return {
        vertex: node.id,
        text: labels[node.id]!,
        x: node.x + Math.cos(angle) * node.radius * (1 + pad),
        y: node.y + Math.sin(angle) * node.radius * (1 + pad),
        color: labelColor[node.id]!,
        boxed: options.boxedLabels ?? false,
      };
    });
}

function resolveBounds(coords: readonly Coordinate2D[], visible: readonly boolean[], options: GplotOptions): Bounds2D {
  const shown = coords.filter((_coord, index) => visible[index]);
  const xs = shown.map((coord) => coord.x);
  const ys = shown.map((coord) => coord.y);
  const pad = options.pad ?? 0.2;
  let xMin = options.xlim?.[0] ?? Math.min(...xs, 0) - pad;
  let xMax = options.xlim?.[1] ?? Math.max(...xs, 0) + pad;
  let yMin = options.ylim?.[0] ?? Math.min(...ys, 0) - pad;
  let yMax = options.ylim?.[1] ?? Math.max(...ys, 0) + pad;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const xCenter = (xMax + xMin) / 2;
  const yCenter = (yMax + yMin) / 2;
  if (xRange < yRange) {
    xMin = xCenter - yRange / 2;
    xMax = xCenter + yRange / 2;
  } else {
    yMin = yCenter - xRange / 2;
    yMax = yCenter + xRange / 2;
  }
  return { xMin, xMax, yMin, yMax, width: xMax - xMin, height: yMax - yMin };
}

function renderGplotSvg(nodes: readonly GplotNode[], edges: readonly GplotEdge[], loops: readonly GplotLoop[], labels: readonly GplotLabel[], bounds: Bounds2D, options: GplotOptions): string {
  const width = options.width ?? 640;
  const height = options.height ?? 640;
  const marker = `<defs><marker id="sna-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke"/></marker></defs>`;
  const edgeSvg = [...edges.map((edge) => `<path d="${edge.path}" fill="none" stroke="${escapeXml(edge.color)}" stroke-width="${fmt(edge.width)}"${dash(edge.lty)}${edge.arrowhead ? ` marker-end="url(#sna-arrowhead)"` : ""}/>`), ...loops.map((loop) => `<path d="${loop.path}" fill="none" stroke="${escapeXml(loop.color)}" stroke-width="${fmt(loop.width)}"${loop.arrowhead ? ` marker-end="url(#sna-arrowhead)"` : ""}/>`)].join("");
  const nodeSvg = nodes.filter((node) => node.visible).map((node) => gplotVertex(node.x, node.y, node.radius, node.sides, { col: node.color, border: node.border })).join("");
  const labelSvg = labels.map((label) => `${label.boxed ? `<rect x="${fmt(label.x - label.text.length * 0.04)}" y="${fmt(label.y - 0.08)}" width="${fmt(label.text.length * 0.08)}" height="0.14" fill="${escapeXml(labelBgAt(options, label.vertex))}" stroke="black"/>` : ""}<text x="${fmt(label.x)}" y="${fmt(label.y)}" fill="${escapeXml(label.color)}" font-size="${fmt(0.12 * (Array.isArray(options.labelCex) ? options.labelCex[label.vertex] ?? 1 : options.labelCex ?? 1))}" text-anchor="middle" dominant-baseline="middle">${escapeXml(label.text)}</text>`).join("");
  const body = options.verticesLast ?? true ? `${edgeSvg}${nodeSvg}${labelSvg}` : `${nodeSvg}${labelSvg}${edgeSvg}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${fmt(bounds.xMin)} ${fmt(bounds.yMin)} ${fmt(bounds.width)} ${fmt(bounds.height)}">${marker}${body}</svg>`;
}

function renderSociomatrixSvg(
  cells: readonly SociomatrixCell[],
  labels: readonly [string[], string[]],
  rows: number,
  cols: number,
  width: number,
  height: number,
  margin: number,
  cellWidth: number,
  cellHeight: number,
  options: PlotSociomatrixOptions,
): string {
  const cellSvg = cells.map((cell) => `<rect x="${fmt(cell.x)}" y="${fmt(cell.y)}" width="${fmt(cell.width)}" height="${fmt(cell.height)}" fill="${escapeXml(cell.color)}" stroke="${options.drawlines === false ? "none" : "#222"}"/>`).join("");
  const labelSvg =
    options.drawlab === false
      ? ""
      : `${labels[0].map((label, row) => `<text x="${fmt(margin - 8)}" y="${fmt(margin + row * cellHeight + cellHeight / 2)}" text-anchor="end" dominant-baseline="middle" font-size="12">${escapeXml(label)}</text>`).join("")}${labels[1].map((label, col) => `<text x="${fmt(margin + col * cellWidth + cellWidth / 2)}" y="${fmt(margin - 8)}" text-anchor="middle" dominant-baseline="baseline" font-size="12">${escapeXml(label)}</text>`).join("")}`;
  const diagSvg =
    rows === cols && options.drawlab !== false && options.diaglab !== false && labels[0].every((label, index) => label === labels[1][index])
      ? labels[0].map((label, index) => `<text x="${fmt(margin + index * cellWidth + cellWidth / 2)}" y="${fmt(margin + index * cellHeight + cellHeight / 2)}" text-anchor="middle" dominant-baseline="middle" font-size="10">${escapeXml(label)}</text>`).join("")
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${cellSvg}<rect x="${fmt(margin)}" y="${fmt(margin)}" width="${fmt(cols * cellWidth)}" height="${fmt(rows * cellHeight)}" fill="none" stroke="#111"/>${labelSvg}${diagSvg}</svg>`;
}

function resolveMatrixLabels(input: PlotSociomatrixOptions["labels"], rows: number, cols: number): [string[], string[]] {
  const rowLabels = input?.[0] ?? Array.from({ length: rows }, (_unused, index) => index + 1);
  const colLabels = input?.[1] ?? Array.from({ length: cols }, (_unused, index) => index + 1);
  return [Array.from({ length: rows }, (_unused, index) => String(rowLabels[index] ?? index + 1)), Array.from({ length: cols }, (_unused, index) => String(colLabels[index] ?? index + 1))];
}

function edgeLineTypes(edges: readonly (readonly [number, number, number])[], options: GplotOptions): number[] {
  const base = recycleNumbers(options.edgeLty ?? 1, Math.max(edges.length, 1));
  const neg = options.edgeLtyNeg ?? 2;
  return edges.map((edge, index) => (edge[2] < 0 && neg !== null ? neg : base[index]!));
}

function recycleNumbers(value: number | readonly number[], length: number): number[] {
  const values = Array.isArray(value) ? value : [value];
  return Array.from({ length }, (_unused, index) => finiteOrZero(values[index % values.length]));
}

function recycleColors(value: string | number | readonly (string | number)[], length: number): string[] {
  const values = Array.isArray(value) ? value : [value];
  return Array.from({ length }, (_unused, index) => colorToCss(values[index % values.length] ?? "black"));
}

function twoModeValues<T>(order: number, split: number, rowValue: T, colValue: T): T[] {
  return Array.from({ length: order }, (_unused, index) => (index < split ? rowValue : colValue));
}

function colorToCss(value: string | number): string {
  if (typeof value === "string") return value;
  const palette = ["black", "black", "red", "green", "blue", "cyan", "magenta", "yellow", "gray"];
  return palette[Math.trunc(value)] ?? "black";
}

function labelBgAt(options: GplotOptions, vertex: number): string {
  const value = Array.isArray(options.labelBg) ? options.labelBg[vertex] ?? "white" : options.labelBg ?? "white";
  return colorToCss(value);
}

function grayscale(value: number): string {
  const channel = Math.round(clamp(value, 0, 1) * 255);
  return `rgb(${channel},${channel},${channel})`;
}

function offsetSegment(start: Coordinate2D, end: Coordinate2D, tailOffset: number, headOffset: number): { start: Coordinate2D; end: Coordinate2D } {
  const distance = Math.max(euclidean(start, end), 1e-9);
  const ux = (end.x - start.x) / distance;
  const uy = (end.y - start.y) / distance;
  return {
    start: { x: start.x + ux * tailOffset, y: start.y + uy * tailOffset },
    end: { x: end.x - ux * headOffset, y: end.y - uy * headOffset },
  };
}

function polygonPoints(x: number, y: number, radius: number, sides: number, rot: number): Coordinate2D[] {
  return Array.from({ length: sides }, (_unused, index) => {
    const angle = rot + (2 * Math.PI * index) / sides - Math.PI / 2;
    return { x: x + radius * Math.cos(angle), y: y + radius * Math.sin(angle) };
  });
}

function midpoint(a: Coordinate2D, b: Coordinate2D): Coordinate2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function unitPerp(a: Coordinate2D, b: Coordinate2D): Coordinate2D {
  const distance = Math.max(euclidean(a, b), 1e-9);
  return { x: -(b.y - a.y) / distance, y: (b.x - a.x) / distance };
}

function euclidean(a: Coordinate2D, b: Coordinate2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function euclideanRows(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) sum += (finiteOrZero(a[i]) - finiteOrZero(b[i])) ** 2;
  return Math.sqrt(sum);
}

function rowDistance(a: readonly number[], b: readonly number[], dist: NonNullable<GplotLayoutPar["dist"]>): number {
  let sum = 0;
  let max = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = finiteOrZero(a[i]);
    const bv = finiteOrZero(b[i]);
    const diff = Math.abs(av - bv);
    if (dist === "maximum") max = Math.max(max, diff);
    else if (dist === "canberra") sum += av === 0 && bv === 0 ? 0 : diff / (Math.abs(av) + Math.abs(bv));
    else if (dist === "manhattan") sum += diff;
    else sum += diff * diff;
  }
  return dist === "maximum" ? max : dist === "manhattan" || dist === "canberra" ? sum : Math.sqrt(sum);
}

function transposeMatrix(matrix: readonly (readonly number[])[]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  return Array.from({ length: cols }, (_unused, col) => Array.from({ length: rows }, (_unused, row) => finiteOrZero(matrix[row]?.[col])));
}

function vectorDiff(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_unused, index) => finiteOrZero(a[index]) - finiteOrZero(b[index]));
}

function vectorNorm(value: readonly number[]): number {
  return Math.sqrt(dot(value, value));
}

function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) sum += finiteOrZero(a[i]) * finiteOrZero(b[i]);
  return sum;
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dash(lty: number): string {
  if (lty === 1) return "";
  if (lty === 2) return ` stroke-dasharray="4 3"`;
  if (lty === 3) return ` stroke-dasharray="1 3"`;
  return ` stroke-dasharray="6 2 1 2"`;
}

function fmt(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(6)).toString() : "0";
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
