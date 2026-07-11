// Ported from R sna 2.8: R/visualization.R (`gplot3d`, gplot3d.layout.*).
import * as THREE from "three";

import { asEdgelistSna, type SnaEdgeList } from "../algorithms/dataprep";
import { isIsolate } from "../algorithms/isolates";
import { resolveRandomSource, type RandomOptions } from "../core/random";
import type { GraphInput } from "../core/types";
import {
  gplotLayoutAdj,
  gplotLayoutEigen,
  gplotLayoutFruchtermanreingold,
  gplotLayoutGeodist,
  gplotLayoutHall,
  gplotLayoutKamadakawai,
  gplotLayoutMds,
  gplotLayoutPrincoord,
  gplotLayoutRandom,
  gplotLayoutRmds,
  gplotLayoutSegeo,
  gplotLayoutSeham,
  layoutByMode,
  type Coordinate3D,
  type GplotLayoutMode,
  type GplotLayoutOptions,
  type GplotLayoutPar,
  type GplotMode,
} from "./core";

export type Gplot3dLayoutOptions = Omit<GplotLayoutOptions, "dim">;

export interface Gplot3dOptions extends RandomOptions {
  readonly g?: number;
  readonly gmode?: GplotMode;
  readonly diag?: boolean;
  readonly label?: readonly (string | number)[];
  readonly coord?: readonly (readonly number[])[];
  readonly jitter?: boolean;
  readonly thresh?: number;
  readonly threshAbsval?: boolean;
  readonly mode?: Exclude<GplotLayoutMode, "circle" | "circrand" | "spring" | "springrepulse" | "target">;
  readonly displayisolates?: boolean;
  readonly displaylabels?: boolean;
  readonly vertexRadius?: number | readonly number[];
  readonly absoluteRadius?: boolean;
  readonly labelCol?: string | number | readonly (string | number)[];
  readonly edgeCol?: string | number | readonly (string | number)[];
  readonly vertexCol?: string | number | readonly (string | number)[];
  readonly edgeAlpha?: number | readonly number[];
  readonly vertexAlpha?: number | readonly number[];
  readonly edgeLwd?: number | readonly number[];
  readonly usearrows?: boolean;
  readonly suppressAxes?: boolean;
  readonly bgCol?: string | number;
  readonly layoutPar?: GplotLayoutPar;
  readonly container?: HTMLElement;
  readonly renderer?: THREE.WebGLRenderer;
  readonly width?: number;
  readonly height?: number;
}

export interface Gplot3dNode {
  readonly id: number;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly color: string;
  readonly alpha: number;
  readonly visible: boolean;
  readonly object: THREE.Mesh;
}

export interface Gplot3dEdge {
  readonly tail: number;
  readonly head: number;
  readonly value: number;
  readonly color: string;
  readonly alpha: number;
  readonly width: number;
  readonly arrowhead: boolean;
  readonly object: THREE.Object3D;
}

export interface Gplot3dLoop {
  readonly vertex: number;
  readonly value: number;
  readonly color: string;
  readonly alpha: number;
  readonly width: number;
  readonly object: THREE.Object3D;
}

export interface Gplot3dLabel {
  readonly vertex: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: string;
  readonly object: THREE.Sprite;
}

export interface Gplot3dResult {
  readonly nodes: Gplot3dNode[];
  readonly edges: Gplot3dEdge[];
  readonly loops: Gplot3dLoop[];
  readonly labels: Gplot3dLabel[];
  readonly coordinates: Coordinate3D[];
  readonly scene: THREE.Scene;
  readonly group: THREE.Group;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer?: THREE.WebGLRenderer;
}

export interface Gplot3dArrowOptions {
  readonly radius?: number;
  readonly color?: string | number;
  readonly alpha?: number;
  readonly arrowhead?: boolean;
}

export function gplot3d(input: GraphInput | readonly GraphInput[], options: Gplot3dOptions = {}): Gplot3dResult {
  const gmode = options.gmode ?? "digraph";
  const diag = options.diag ?? false;
  const selected = selectGraph3d(input, options.g ?? 0, gmode, diag);
  const rawEdges = selected.edges.filter((edge) => !Number.isNaN(edge[2]));
  const threshold = options.thresh ?? 0;
  const threshAbsval = options.threshAbsval ?? true;
  const edges = rawEdges.filter((edge) => (threshAbsval ? Math.abs(edge[2]) > threshold : edge[2] > threshold));
  const graphForLayout: SnaEdgeList = { ...selected, edges };
  const layoutOptions: GplotLayoutOptions = {
    mode: options.mode ?? "fruchtermanreingold",
    gmode,
    diag,
    dim: 3,
    jitter: options.jitter ?? true,
    ...(options.coord === undefined ? {} : { coord: options.coord }),
    ...(options.layoutPar === undefined ? {} : { layoutPar: options.layoutPar }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(options.rng === undefined ? {} : { rng: options.rng }),
  };
  const coordinates = normalize3d(maybeJitter3d(layoutByMode(graphForLayout, layoutOptions), options.jitter ?? true, options));
  const displayIsolates = options.displayisolates ?? true;
  const visible = Array.from({ length: selected.order }, (_unused, vertex) => displayIsolates || !isIsolate(graphForLayout, vertex, { mode: gmode === "graph" ? "graph" : "digraph", diag }));
  const labels = resolveLabels(options.label, selected);
  const displayLabels = options.displaylabels ?? options.label !== undefined;
  const baseRadius = defaultRadius(coordinates, visible);
  const vertexRadius = options.vertexRadius === undefined ? Array.from({ length: selected.order }, () => baseRadius) : recycleNumbers(options.vertexRadius, selected.order).map((value) => (options.absoluteRadius ? value : value * baseRadius));
  const vertexColor = recycleColors(options.vertexCol ?? (gmode === "twomode" && selected.bipartite !== undefined ? twoModeValues(selected.order, selected.bipartite, "red", "blue") : "red"), selected.order);
  const vertexAlpha = recycleNumbers(options.vertexAlpha ?? 1, selected.order);
  const scene = new THREE.Scene();
  scene.name = "sna-gplot3d";
  scene.background = new THREE.Color(colorToCss(options.bgCol ?? "white"));
  const group = new THREE.Group();
  group.name = "sna-gplot3d-graph";
  scene.add(group);
  if (options.suppressAxes === false) group.add(new THREE.AxesHelper(Math.max(1, coordinateRange(coordinates))));

  const nodes = coordinates.map((coord, vertex) => {
    const radius = Math.max(vertexRadius[vertex] ?? baseRadius, 1e-6);
    const material = new THREE.MeshBasicMaterial({
      color: colorToCss(vertexColor[vertex] ?? "red"),
      transparent: (vertexAlpha[vertex] ?? 1) < 1,
      opacity: clamp(vertexAlpha[vertex] ?? 1, 0, 1),
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
    mesh.name = `sna-node-${vertex}`;
    mesh.position.set(coord.x, coord.y, coord.z);
    mesh.visible = visible[vertex] ?? true;
    mesh.userData = { id: vertex, label: labels[vertex] };
    if (mesh.visible) group.add(mesh);
    return {
      id: vertex,
      label: labels[vertex]!,
      x: coord.x,
      y: coord.y,
      z: coord.z,
      radius,
      color: vertexColor[vertex]!,
      alpha: vertexAlpha[vertex]!,
      visible: visible[vertex]!,
      object: mesh,
    };
  });

  const edgeColors = recycleColors(options.edgeCol ?? "black", Math.max(edges.length, 1));
  const edgeAlpha = recycleNumbers(options.edgeAlpha ?? 1, Math.max(edges.length, 1));
  const edgeWidths = options.edgeLwd === undefined ? edges.map(([tail, head]) => 0.5 * Math.min(nodes[tail]?.radius ?? baseRadius, nodes[head]?.radius ?? baseRadius) + (tail === head ? nodes[tail]?.radius ?? baseRadius : 0)) : recycleNumbers(options.edgeLwd, Math.max(edges.length, 1));
  const useArrows = gmode === "graph" ? false : (options.usearrows ?? true);
  const plottedEdges: Gplot3dEdge[] = [];
  const loops: Gplot3dLoop[] = [];
  for (let index = 0; index < edges.length; index += 1) {
    const [tail, head, value] = edges[index]!;
    if (!visible[tail] || !visible[head]) continue;
    const color = edgeColors[index]!;
    const alpha = edgeAlpha[index]!;
    const width = Math.max(edgeWidths[index]!, 1e-6);
    if (tail === head) {
      const object = gplot3dLoop(coordinates[tail]!, width, { color, alpha });
      group.add(object);
      loops.push({ vertex: tail, value, color, alpha, width, object });
      continue;
    }
    const object = gplot3dArrow(coordinates[tail]!, coordinates[head]!, { radius: width, color, alpha, arrowhead: useArrows });
    group.add(object);
    plottedEdges.push({ tail, head, value, color, alpha, width, arrowhead: useArrows, object });
  }

  const labelObjects = displayLabels ? buildLabelSprites(nodes, labels, options) : [];
  for (const label of labelObjects) group.add(label.object);
  const camera = createCamera(coordinates, visible);
  const renderer = mountRenderer(scene, camera, options);
  const result = { nodes, edges: plottedEdges, loops, labels: labelObjects, coordinates, scene, group, camera };
  return renderer === undefined ? result : { ...result, renderer };
}

export function gplot3dArrow(a: Coordinate3D, b: Coordinate3D, options: Gplot3dArrowOptions = {}): THREE.Group {
  const start = new THREE.Vector3(a.x, a.y, a.z);
  const end = new THREE.Vector3(b.x, b.y, b.z);
  const group = new THREE.Group();
  const radius = Math.max(options.radius ?? 0.01, 1e-6);
  const alpha = clamp(options.alpha ?? 1, 0, 1);
  const material = new THREE.LineBasicMaterial({
    color: colorToCss(options.color ?? "black"),
    transparent: alpha < 1,
    opacity: alpha,
    linewidth: Math.max(1, radius),
  });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), material);
  group.add(line);
  if (options.arrowhead !== false) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length > 1e-9) {
      direction.normalize();
      const coneHeight = Math.min(length * 0.2, radius * 6);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.5, coneHeight, 16), new THREE.MeshBasicMaterial({ color: colorToCss(options.color ?? "black"), transparent: alpha < 1, opacity: alpha }));
      cone.position.copy(end.clone().sub(direction.clone().multiplyScalar(coneHeight / 2)));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      group.add(cone);
    }
  }
  return group;
}

export function gplot3dLoop(a: Coordinate3D, radius = 0.05, options: Omit<Gplot3dArrowOptions, "radius" | "arrowhead"> = {}): THREE.Line {
  const points: THREE.Vector3[] = [];
  const steps = 48;
  const r = Math.max(radius, 1e-6);
  for (let i = 0; i <= steps; i += 1) {
    const angle = (2 * Math.PI * i) / steps;
    points.push(new THREE.Vector3(a.x + Math.cos(angle) * r * 1.5, a.y + Math.sin(angle) * r, a.z + Math.sin(angle) * r * 0.25));
  }
  const alpha = clamp(options.alpha ?? 1, 0, 1);
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: colorToCss(options.color ?? "black"), transparent: alpha < 1, opacity: alpha, linewidth: Math.max(1, r) }),
  );
}

export function gplot3dLayoutAdj(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutAdj(input, with3d(options));
}

export function gplot3dLayoutEigen(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutEigen(input, with3d(options));
}

export function gplot3dLayoutFruchtermanreingold(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutFruchtermanreingold(input, with3d(options));
}

export function gplot3dLayoutGeodist(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutGeodist(input, with3d(options));
}

export function gplot3dLayoutHall(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutHall(input, with3d(options));
}

export function gplot3dLayoutKamadakawai(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutKamadakawai(input, with3d(options));
}

export function gplot3dLayoutMds(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutMds(input, with3d(options));
}

export function gplot3dLayoutPrincoord(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutPrincoord(input, with3d(options));
}

export function gplot3dLayoutRandom(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutRandom(input, with3d(options));
}

export function gplot3dLayoutRmds(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutRmds(input, with3d(options));
}

export function gplot3dLayoutSegeo(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutSegeo(input, with3d(options));
}

export function gplot3dLayoutSeham(input: GraphInput | SnaEdgeList, options: Gplot3dLayoutOptions = {}): number[][] {
  return gplotLayoutSeham(input, with3d(options));
}

export const snaVisualizationThreeR = {
  gplot3d,
  "gplot3d.arrow": gplot3dArrow,
  "gplot3d.layout.adj": gplot3dLayoutAdj,
  "gplot3d.layout.eigen": gplot3dLayoutEigen,
  "gplot3d.layout.fruchtermanreingold": gplot3dLayoutFruchtermanreingold,
  "gplot3d.layout.geodist": gplot3dLayoutGeodist,
  "gplot3d.layout.hall": gplot3dLayoutHall,
  "gplot3d.layout.kamadakawai": gplot3dLayoutKamadakawai,
  "gplot3d.layout.mds": gplot3dLayoutMds,
  "gplot3d.layout.princoord": gplot3dLayoutPrincoord,
  "gplot3d.layout.random": gplot3dLayoutRandom,
  "gplot3d.layout.rmds": gplot3dLayoutRmds,
  "gplot3d.layout.segeo": gplot3dLayoutSegeo,
  "gplot3d.layout.seham": gplot3dLayoutSeham,
  "gplot3d.loop": gplot3dLoop,
} as const;

export const visualizationThreeR = snaVisualizationThreeR;

function with3d(options: Gplot3dLayoutOptions): GplotLayoutOptions {
  return { ...options, dim: 3 };
}

function selectGraph3d(input: GraphInput | readonly GraphInput[], g: number, gmode: GplotMode, diag: boolean): SnaEdgeList {
  const edgelist = asEdgelistSna(input as never, { asDigraph: gmode !== "graph", forceBipartite: gmode === "twomode", suppressDiag: !diag }) as SnaEdgeList | SnaEdgeList[];
  if (Array.isArray(edgelist)) {
    if (!Number.isInteger(g) || g < 0 || g >= edgelist.length) throw new RangeError("g is outside graph stack");
    return edgelist[g]!;
  }
  return edgelist;
}

function normalize3d(coords: readonly (readonly number[])[]): Coordinate3D[] {
  return coords.map((coord) => ({ x: finiteOrZero(coord[0]), y: finiteOrZero(coord[1]), z: finiteOrZero(coord[2]) }));
}

function maybeJitter3d(coords: number[][], enabled: boolean, options: RandomOptions): number[][] {
  if (!enabled) return coords;
  const rng = resolveRandomSource(options);
  return coords.map((row) => [finiteOrZero(row[0]) + (rng() - 0.5) * 1e-6, finiteOrZero(row[1]) + (rng() - 0.5) * 1e-6, finiteOrZero(row[2]) + (rng() - 0.5) * 1e-6]);
}

function resolveLabels(labels: readonly (string | number)[] | undefined, graph: SnaEdgeList): string[] {
  if (labels !== undefined) return Array.from({ length: graph.order }, (_unused, index) => String(labels[index] ?? index + 1));
  if (graph.vertexNames !== undefined) return Array.from({ length: graph.order }, (_unused, index) => String(graph.vertexNames?.[index] ?? index + 1));
  if (graph.bipartite !== undefined) return Array.from({ length: graph.order }, (_unused, index) => (index < graph.bipartite! ? `R${index + 1}` : `C${index + 1}`));
  return Array.from({ length: graph.order }, (_unused, index) => String(index + 1));
}

function buildLabelSprites(nodes: readonly Gplot3dNode[], labels: readonly string[], options: Gplot3dOptions): Gplot3dLabel[] {
  const colors = recycleColors(options.labelCol ?? "gray50", nodes.length);
  return nodes
    .filter((node) => node.visible && labels[node.id] !== "")
    .map((node) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: colorToCss(colors[node.id] ?? "gray50") }));
      sprite.name = `sna-label-${node.id}`;
      sprite.position.set(node.x - node.radius, node.y, node.z);
      sprite.scale.set(node.radius * 2, node.radius, 1);
      sprite.userData = { vertex: node.id, text: labels[node.id] };
      return { vertex: node.id, text: labels[node.id]!, x: sprite.position.x, y: sprite.position.y, z: sprite.position.z, color: colors[node.id]!, object: sprite };
    });
}

function defaultRadius(coords: readonly Coordinate3D[], visible: readonly boolean[]): number {
  const shown = coords.filter((_coord, index) => visible[index]);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < shown.length; i += 1) {
    for (let j = i + 1; j < shown.length; j += 1) {
      min = Math.min(min, shownDistance(shown[i]!, shown[j]!));
    }
  }
  return Number.isFinite(min) && min > 0 ? min / 5 : 0.1;
}

function coordinateRange(coords: readonly Coordinate3D[]): number {
  if (coords.length === 0) return 1;
  const xs = coords.map((coord) => coord.x);
  const ys = coords.map((coord) => coord.y);
  const zs = coords.map((coord) => coord.z);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs), 1);
}

function createCamera(coords: readonly Coordinate3D[], visible: readonly boolean[]): THREE.PerspectiveCamera {
  const shown = coords.filter((_coord, index) => visible[index]);
  const center = shown.length === 0 ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(mean(shown.map((coord) => coord.x)), mean(shown.map((coord) => coord.y)), mean(shown.map((coord) => coord.z)));
  const range = coordinateRange(shown);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, Math.max(1000, range * 20));
  camera.position.set(center.x, center.y, center.z + range * 3);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return camera;
}

function mountRenderer(scene: THREE.Scene, camera: THREE.Camera, options: Gplot3dOptions): THREE.WebGLRenderer | undefined {
  if (options.container === undefined) return undefined;
  const renderer = options.renderer ?? new THREE.WebGLRenderer({ antialias: true });
  const width = (options.width ?? options.container.clientWidth) || 640;
  const height = (options.height ?? options.container.clientHeight) || 480;
  renderer.setSize(width, height);
  renderer.render(scene, camera);
  if (!options.container.contains(renderer.domElement)) options.container.appendChild(renderer.domElement);
  return renderer;
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
  if (typeof value === "number") {
    const palette = ["black", "black", "red", "green", "blue", "cyan", "magenta", "yellow", "gray"];
    return palette[Math.trunc(value)] ?? "black";
  }
  const gray = /^gr[ae]y(\d{1,3})$/i.exec(value);
  if (gray) {
    const channel = Math.round((clamp(Number(gray[1]), 0, 100) / 100) * 255);
    return `rgb(${channel},${channel},${channel})`;
  }
  return value;
}

function shownDistance(a: Coordinate3D, b: Coordinate3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
