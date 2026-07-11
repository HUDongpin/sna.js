import { createNumberMatrix } from "../core/matrix";
import { isDenseGraph, isEdgeListInput } from "../core/graph";
import type { GraphInput, MatrixCell, MatrixLike } from "../core/types";
import { asEdgelistSna, asSociomatrixSna, type DataPrepInput, type MatrixStack, type SnaEdgeList } from "./dataprep";

export interface ReadDotOptions {
  readonly returnLabels?: boolean;
}

export interface ReadDotResult {
  readonly matrix: number[][];
  readonly labels: string[];
}

export interface WriteDlOptions {
  readonly vertexLabels?: readonly (string | number)[];
  readonly matrixLabels?: readonly (string | number)[];
}

export interface ReadNosOptions {
  readonly returnAsEdgelist?: boolean;
}

export interface WriteNosOptions {
  readonly rowColors?: readonly (string | number)[];
  readonly colColors?: readonly (string | number)[];
}

export function readDot(dotText: string, options: ReadDotOptions & { returnLabels: true }): ReadDotResult;
export function readDot(dotText: string, options?: ReadDotOptions & { returnLabels?: false }): number[][];
export function readDot(dotText: string, options: ReadDotOptions = {}): number[][] | ReadDotResult {
  const edges = parseDotEdges(dotText);
  const labelToIndex = new Map<string, number>();
  const labels: string[] = [];

  for (const [tail, head] of edges) {
    for (const label of [tail, head]) {
      if (!labelToIndex.has(label)) {
        labelToIndex.set(label, labels.length);
        labels.push(label);
      }
    }
  }

  const matrix = createNumberMatrix(labels.length, labels.length);
  for (const [tail, head] of edges) {
    matrix[labelToIndex.get(tail)!]![labelToIndex.get(head)!] = 1;
  }

  return options.returnLabels ? { matrix, labels } : matrix;
}

export function writeDl(input: DataPrepInput, options: WriteDlOptions = {}): string {
  const stack = toMatrixStack(input);
  assertCommonShape(stack, "DL format requires all graphs to be of identical order.");
  const n = stack[0]?.length ?? 0;
  const m = stack.length;
  if (!stack.every((matrix) => matrix.length === n && matrix.every((row) => row.length === n))) {
    throw new RangeError("DL format requires square graphs of identical order.");
  }

  const vertexLabels = options.vertexLabels ?? Array.from({ length: n }, (_unused, index) => index + 1);
  const matrixLabels = options.matrixLabels ?? Array.from({ length: m }, (_unused, index) => index + 1);
  assertLabelCount(vertexLabels, n, "vertexLabels");
  assertLabelCount(matrixLabels, m, "matrixLabels");

  const lines = [
    `DL n = ${n}, nm = ${m}, format = edgelist1`,
    "labels:",
    vertexLabels.map(formatLabel).join(","),
    "matrix labels:",
    matrixLabels.map(formatLabel).join(","),
    "data:",
  ];

  for (let graph = 0; graph < m; graph += 1) {
    const matrix = stack[graph]!;
    for (let col = 0; col < n; col += 1) {
      for (let row = 0; row < n; row += 1) {
        const value = matrix[row]![col]!;
        if (Number.isNaN(value) || value === 0) continue;
        lines.push(`${row + 1} ${col + 1} ${formatNumber(value)}`);
      }
    }
    if (graph < m - 1) lines.push("!");
  }

  return `${lines.join("\n")}\n`;
}

export function readNos(text: string, options: ReadNosOptions & { returnAsEdgelist: true }): SnaEdgeList[];
export function readNos(text: string, options?: ReadNosOptions & { returnAsEdgelist?: false }): MatrixStack;
export function readNos(text: string, options: ReadNosOptions = {}): MatrixStack | SnaEdgeList[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 3) throw new SyntaxError("NOS input must contain three header lines");
  const graphCount = parsePositiveInteger(firstToken(lines[0]!), "graph count");
  const dimensions = tokens(lines[1]!);
  if (dimensions.length < 2) throw new SyntaxError("NOS dimension line must contain row and column counts");
  const rows = parsePositiveInteger(dimensions[0]!, "row count");
  const cols = parsePositiveInteger(dimensions[1]!, "column count");
  const values = lines
    .slice(3)
    .flatMap(tokens)
    .map((token) => Number(token));

  const expected = graphCount * rows * cols;
  if (values.length < expected) throw new SyntaxError(`NOS input contains ${values.length} values, expected ${expected}`);
  if (values.slice(0, expected).some((value) => Number.isNaN(value))) throw new SyntaxError("NOS data values must be numeric");

  const stack: MatrixStack = [];
  let offset = 0;
  for (let graph = 0; graph < graphCount; graph += 1) {
    const matrix = createNumberMatrix(rows, cols);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        matrix[row]![col] = values[offset++]!;
      }
    }
    stack.push(matrix);
  }

  return options.returnAsEdgelist ? (asEdgelistSna(stack) as SnaEdgeList[]) : stack;
}

export function writeNos(input: DataPrepInput, options: WriteNosOptions = {}): string {
  const stack = toRawMatrixStack(input);
  const { rows, cols } = assertCommonShape(stack, "NOS format requires all graphs to be of identical order.");
  const rowColors = options.rowColors ?? Array.from({ length: rows }, () => 0);
  const colColors = options.colColors ?? Array.from({ length: cols }, () => 0);
  assertLabelCount(rowColors, rows, "rowColors");
  assertLabelCount(colColors, cols, "colColors");

  const lines = [`${stack.length}`, `${rows} ${cols}`, [...rowColors, ...colColors].map(formatLabel).join(" ")];
  for (const matrix of stack) {
    for (let row = 0; row < rows; row += 1) {
      lines.push(matrix[row]!.map(formatNumber).join(" "));
    }
  }
  return `${lines.join("\n")}\n`;
}

function parseDotEdges(dotText: string): Array<readonly [string, string]> {
  let body = dotText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/#.*$/gm, "");
  const open = body.indexOf("{");
  const close = body.lastIndexOf("}");
  if (open >= 0 && close > open) body = body.slice(open + 1, close);

  const edges: Array<readonly [string, string]> = [];
  for (const statement of body.split(/[;\n]+/)) {
    if (!statement.includes("->")) continue;
    const parts = statement.split("->").map(cleanDotNode).filter((part) => part.length > 0);
    for (let index = 0; index < parts.length - 1; index += 1) edges.push([parts[index]!, parts[index + 1]!]);
  }
  return edges;
}

function cleanDotNode(raw: string): string {
  let value = raw.trim();
  const brace = value.lastIndexOf("{");
  if (brace >= 0) value = value.slice(brace + 1).trim();
  const attr = value.indexOf("[");
  if (attr >= 0) value = value.slice(0, attr).trim();
  value = value.replace(/,$/, "").trim();
  if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) return value.slice(1, -1);
  return value;
}

function toMatrixStack(input: DataPrepInput): MatrixStack {
  if (isGraphStackInput(input)) return asSociomatrixSna(input) as MatrixStack;
  return [asSociomatrixSna(input) as number[][]];
}

function toRawMatrixStack(input: DataPrepInput): MatrixStack {
  if (isGraphStackInput(input)) return (input as readonly GraphInput[]).map((graph) => toRawMatrix(graph));
  return [toRawMatrix(input as GraphInput)];
}

function toRawMatrix(input: GraphInput): number[][] {
  if (isDenseGraph(input) || isEdgeListInput(input)) return asSociomatrixSna(input) as number[][];
  return cloneRectangularMatrix(input);
}

function cloneRectangularMatrix(matrix: MatrixLike): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const out = createNumberMatrix(rows, cols);
  for (let row = 0; row < rows; row += 1) {
    const sourceRow = matrix[row];
    if (!sourceRow || sourceRow.length !== cols) throw new TypeError("matrix inputs must be rectangular");
    for (let col = 0; col < cols; col += 1) out[row]![col] = normalizeCell(sourceRow[col]);
  }
  return out;
}

function isGraphStackInput(input: DataPrepInput): input is readonly GraphInput[] {
  if (!Array.isArray(input) || input.length === 0) return false;
  const first = input[0] as unknown;
  if (isDenseGraph(first as GraphInput) || isEdgeListInput(first as GraphInput)) return true;
  return Array.isArray(first) && first.length > 0 && Array.isArray(first[0]);
}

function normalizeCell(value: MatrixCell): number {
  if (value === true) return 1;
  if (value === false || value == null) return 0;
  if (Number.isNaN(value)) return Number.NaN;
  if (!Number.isFinite(value)) return 0;
  return value;
}

function assertCommonShape(stack: MatrixStack, message: string): { readonly rows: number; readonly cols: number } {
  const rows = stack[0]?.length ?? 0;
  const cols = stack[0]?.[0]?.length ?? 0;
  for (const matrix of stack) {
    if (matrix.length !== rows || !matrix.every((row) => row.length === cols)) throw new RangeError(message);
  }
  return { rows, cols };
}

function assertLabelCount(labels: readonly unknown[], expected: number, label: string): void {
  if (labels.length !== expected) throw new RangeError(`${label} length must equal ${expected}`);
}

function formatLabel(value: string | number): string {
  return typeof value === "string" ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"` : formatNumber(value);
}

function formatNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "Inf";
  if (value === Number.NEGATIVE_INFINITY) return "-Inf";
  return Number.isInteger(value) ? String(value) : String(value);
}

function tokens(line: string): string[] {
  return line.trim().length === 0 ? [] : line.trim().split(/\s+/);
}

function firstToken(line: string): string {
  const token = tokens(line)[0];
  if (token === undefined) throw new SyntaxError("missing NOS header value");
  return token;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new SyntaxError(`NOS ${label} must be a non-negative integer`);
  return parsed;
}
