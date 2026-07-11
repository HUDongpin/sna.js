import { createNumberMatrix } from "./matrix";

export function solveLinearSystem(matrix: readonly (readonly number[])[], rhs: readonly number[], tol = 1e-12): number[] {
  const n = matrix.length;
  if (rhs.length !== n) throw new RangeError("linear system dimensions do not match");
  const a = matrix.map((row) => {
    if (row.length !== n) throw new RangeError("linear system matrix must be square");
    return [...row];
  });
  const b = [...rhs];

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    let pivotAbs = Math.abs(a[col]![col]!);
    for (let row = col + 1; row < n; row += 1) {
      const candidate = Math.abs(a[row]![col]!);
      if (candidate > pivotAbs) {
        pivot = row;
        pivotAbs = candidate;
      }
    }
    if (!Number.isFinite(pivotAbs) || pivotAbs <= tol) throw new RangeError("matrix is singular to working tolerance");

    if (pivot !== col) {
      const row = a[col]!;
      a[col] = a[pivot]!;
      a[pivot] = row;
      const value = b[col]!;
      b[col] = b[pivot]!;
      b[pivot] = value;
    }

    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row]![col]! / a[col]![col]!;
      if (factor === 0) continue;
      a[row]![col] = 0;
      for (let inner = col + 1; inner < n; inner += 1) a[row]![inner] = a[row]![inner]! - factor * a[col]![inner]!;
      b[row] = b[row]! - factor * b[col]!;
    }
  }

  const out = Array.from({ length: n }, () => 0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row]!;
    for (let col = row + 1; col < n; col += 1) sum -= a[row]![col]! * out[col]!;
    out[row] = sum / a[row]![row]!;
  }
  return out;
}

export function invertMatrix(matrix: readonly (readonly number[])[], tol = 1e-12): number[][] {
  const n = matrix.length;
  const out = createNumberMatrix(n, n);
  for (let col = 0; col < n; col += 1) {
    const rhs = Array.from({ length: n }, (_unused, row) => (row === col ? 1 : 0));
    const solution = solveLinearSystem(matrix, rhs, tol);
    for (let row = 0; row < n; row += 1) out[row]![col] = solution[row]!;
  }
  return out;
}

export interface SymmetricEigenResult {
  readonly values: number[];
  readonly vectors: number[][];
}

export interface CanonicalCorrelationResult {
  readonly correlations: number[];
  readonly xcoef: number[][];
  readonly ycoef: number[][];
  readonly xcenter: number[];
  readonly ycenter: number[];
}

export function transposeMatrix(matrix: readonly (readonly number[])[]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const out = createNumberMatrix(cols, rows);
  for (let row = 0; row < rows; row += 1) {
    if (matrix[row]!.length !== cols) throw new RangeError("matrix rows must have identical length");
    for (let col = 0; col < cols; col += 1) out[col]![row] = matrix[row]![col]!;
  }
  return out;
}

export function multiplyMatrices(left: readonly (readonly number[])[], right: readonly (readonly number[])[]): number[][] {
  const rows = left.length;
  const inner = left[0]?.length ?? 0;
  const cols = right[0]?.length ?? 0;
  if (right.length !== inner) throw new RangeError("matrix dimensions do not conform");
  const out = createNumberMatrix(rows, cols);
  for (let row = 0; row < rows; row += 1) {
    if (left[row]!.length !== inner) throw new RangeError("left matrix rows must have identical length");
    for (let k = 0; k < inner; k += 1) {
      const value = left[row]![k]!;
      if (value === 0) continue;
      if (right[k]!.length !== cols) throw new RangeError("right matrix rows must have identical length");
      for (let col = 0; col < cols; col += 1) out[row]![col] = out[row]![col]! + value * right[k]![col]!;
    }
  }
  return out;
}

export function centerColumns(matrix: readonly (readonly number[])[]): { centered: number[][]; centers: number[] } {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const centers = Array.from({ length: cols }, () => 0);
  const counts = Array.from({ length: cols }, () => 0);
  for (let row = 0; row < rows; row += 1) {
    if (matrix[row]!.length !== cols) throw new RangeError("matrix rows must have identical length");
    for (let col = 0; col < cols; col += 1) {
      const value = matrix[row]![col]!;
      if (Number.isNaN(value)) continue;
      centers[col] = centers[col]! + value;
      counts[col] = counts[col]! + 1;
    }
  }
  for (let col = 0; col < cols; col += 1) centers[col] = counts[col] === 0 ? Number.NaN : centers[col]! / counts[col]!;
  const centered = matrix.map((row) => row.map((value, col) => (Number.isNaN(value) || Number.isNaN(centers[col]!) ? Number.NaN : value - centers[col]!)));
  return { centered, centers };
}

export function covarianceMatrix(matrix: readonly (readonly number[])[]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const { centered } = centerColumns(matrix);
  const out = createNumberMatrix(cols, cols, Number.NaN);
  for (let a = 0; a < cols; a += 1) {
    for (let b = a; b < cols; b += 1) {
      let sum = 0;
      let count = 0;
      for (let row = 0; row < rows; row += 1) {
        const av = centered[row]![a]!;
        const bv = centered[row]![b]!;
        if (Number.isNaN(av) || Number.isNaN(bv)) continue;
        sum += av * bv;
        count += 1;
      }
      const value = count > 1 ? sum / (count - 1) : Number.NaN;
      out[a]![b] = value;
      out[b]![a] = value;
    }
  }
  return out;
}

export function jacobiEigenSymmetric(matrix: readonly (readonly number[])[], tol = 1e-12, maxIterations = 100): SymmetricEigenResult {
  const n = matrix.length;
  const a = matrix.map((row) => {
    if (row.length !== n) throw new RangeError("eigen decomposition requires a square matrix");
    return row.map((value) => (Number.isFinite(value) ? value : 0));
  });
  const vectors = identityMatrix(n);
  const maxSweeps = Math.max(maxIterations, n * n * 10);

  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let row = 0; row < n; row += 1) {
      for (let col = row + 1; col < n; col += 1) {
        const value = Math.abs(a[row]![col]!);
        if (value > max) {
          max = value;
          p = row;
          q = col;
        }
      }
    }
    if (max <= tol || n < 2) break;

    const app = a[p]![p]!;
    const aqq = a[q]![q]!;
    const apq = a[p]![q]!;
    const tau = (aqq - app) / (2 * apq);
    const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    for (let k = 0; k < n; k += 1) {
      if (k !== p && k !== q) {
        const akp = a[k]![p]!;
        const akq = a[k]![q]!;
        a[k]![p] = c * akp - s * akq;
        a[p]![k] = a[k]![p]!;
        a[k]![q] = s * akp + c * akq;
        a[q]![k] = a[k]![q]!;
      }
      const vkp = vectors[k]![p]!;
      const vkq = vectors[k]![q]!;
      vectors[k]![p] = c * vkp - s * vkq;
      vectors[k]![q] = s * vkp + c * vkq;
    }
    a[p]![p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q]![q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p]![q] = 0;
    a[q]![p] = 0;
  }

  const order = Array.from({ length: n }, (_unused, index) => index).sort((aIndex, bIndex) => a[bIndex]![bIndex]! - a[aIndex]![aIndex]!);
  return {
    values: order.map((index) => a[index]![index]!),
    vectors: vectors.map((row) => order.map((index) => row[index]!)),
  };
}

export function canonicalCorrelation(xInput: readonly (readonly number[])[], yInput: readonly (readonly number[])[], tol = 1e-10): CanonicalCorrelationResult {
  const xClean: number[][] = [];
  const yClean: number[][] = [];
  if (xInput.length !== yInput.length) throw new RangeError("canonical correlation inputs must have identical row counts");
  const xCols = xInput[0]?.length ?? 0;
  const yCols = yInput[0]?.length ?? 0;
  for (let row = 0; row < xInput.length; row += 1) {
    if (xInput[row]!.length !== xCols || yInput[row]!.length !== yCols) throw new RangeError("canonical correlation rows must have identical length");
    if (xInput[row]!.some((value) => !Number.isFinite(value)) || yInput[row]!.some((value) => !Number.isFinite(value))) continue;
    xClean.push([...xInput[row]!]);
    yClean.push([...yInput[row]!]);
  }
  const xCentered = centerColumns(xClean);
  const yCentered = centerColumns(yClean);
  const n = xClean.length;
  if (n < 2 || xCols === 0 || yCols === 0) {
    return {
      correlations: [],
      xcoef: createNumberMatrix(xCols, 0),
      ycoef: createNumberMatrix(yCols, 0),
      xcenter: xCentered.centers,
      ycenter: yCentered.centers,
    };
  }

  const scale = 1 / (n - 1);
  const sxx = ridge(crossProduct(xCentered.centered, xCentered.centered, scale), tol);
  const syy = ridge(crossProduct(yCentered.centered, yCentered.centered, scale), tol);
  const sxy = crossProduct(xCentered.centered, yCentered.centered, scale);
  const invSxx = invertMatrix(sxx, tol);
  const invSyy = invertMatrix(syy, tol);
  const m = multiplyMatrices(multiplyMatrices(multiplyMatrices(invSxx, sxy), invSyy), transposeMatrix(sxy));
  const sym = symmetrizeMatrix(m);
  const eig = jacobiEigenSymmetric(sym, tol);
  const keep = Math.min(xCols, yCols);
  const correlations = eig.values.slice(0, keep).map((value) => Math.sqrt(Math.max(0, value)));
  const xcoef = eig.vectors.map((row) => row.slice(0, keep));
  const ycoef = createNumberMatrix(yCols, keep);
  for (let component = 0; component < keep; component += 1) {
    const corr = correlations[component]!;
    const left = xcoef.map((row) => row[component]!);
    const raw = multiplyMatrixVector(multiplyMatrices(invSyy, transposeMatrix(sxy)), left);
    const denom = corr <= tol ? 1 : corr;
    for (let row = 0; row < yCols; row += 1) ycoef[row]![component] = raw[row]! / denom;
  }
  return { correlations, xcoef, ycoef, xcenter: xCentered.centers, ycenter: yCentered.centers };
}

function identityMatrix(n: number): number[][] {
  const out = createNumberMatrix(n, n);
  for (let i = 0; i < n; i += 1) out[i]![i] = 1;
  return out;
}

function crossProduct(left: readonly (readonly number[])[], right: readonly (readonly number[])[], scale = 1): number[][] {
  if (left.length !== right.length) throw new RangeError("cross product matrices must have identical row counts");
  const rows = left.length;
  const leftCols = left[0]?.length ?? 0;
  const rightCols = right[0]?.length ?? 0;
  const out = createNumberMatrix(leftCols, rightCols);
  for (let row = 0; row < rows; row += 1) {
    for (let a = 0; a < leftCols; a += 1) {
      const av = left[row]![a]!;
      for (let b = 0; b < rightCols; b += 1) out[a]![b] = out[a]![b]! + av * right[row]![b]! * scale;
    }
  }
  return out;
}

function ridge(matrix: number[][], tol: number): number[][] {
  const out = matrix.map((row) => [...row]);
  for (let i = 0; i < out.length; i += 1) out[i]![i] = (Number.isFinite(out[i]![i]!) ? out[i]![i]! : 0) + tol;
  return out;
}

function symmetrizeMatrix(matrix: number[][]): number[][] {
  const out = matrix.map((row) => [...row]);
  for (let row = 0; row < out.length; row += 1) {
    for (let col = row + 1; col < out.length; col += 1) {
      const value = (out[row]![col]! + out[col]![row]!) / 2;
      out[row]![col] = value;
      out[col]![row] = value;
    }
  }
  return out;
}

function multiplyMatrixVector(matrix: readonly (readonly number[])[], vector: readonly number[]): number[] {
  return matrix.map((row) => {
    if (row.length !== vector.length) throw new RangeError("matrix-vector dimensions do not conform");
    return row.reduce((sum, value, index) => sum + value * vector[index]!, 0);
  });
}
