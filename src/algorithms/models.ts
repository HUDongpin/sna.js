// Ported from R sna 2.8: R/models.R (`netlm`, `netlogit`, `lnam`, `bbnam*`, `bn`, `pstar`, `brokerage`, `consensus`, `nacf`, `netcancor`, `npostpred`, `eval.edgeperturbation`).
import { createNumberMatrix } from "../core/matrix";
import type { GraphInput, GraphMode } from "../core/types";
import { assertProbability, resolveRandomSource, type RandomOptions, type RandomSource } from "../core/random";
import { canonicalCorrelation, jacobiEigenSymmetric } from "../core/linearAlgebra";
import { betweenness } from "./betweenness";
import { closeness } from "./closeness";
import { neighborhood, type NeighborhoodType } from "./connectivity";
import { asSociomatrixSna, gvectorize } from "./dataprep";
import { degree } from "./degree";
import { gden } from "./density";
import { centralgraph, gcor } from "./graphComparison";
import { connectedness, dyadCensus, efficiency, grecip, gtrans, hierarchy, lubness, mutuality } from "./graphStatistics";
import { bnTriadLogProbability } from "./bnLikelihood";
import { logMean } from "./operators";
import { rmperm } from "./permutation";
import { rgraph, rguman } from "./randomGraph";
import { structureStatistics } from "./structural";
import { triadCensus } from "./triads";

export type NetworkRegressionNull = "qap" | "qapspp" | "qapy" | "qapx" | "qapallx" | "cugtie" | "cugden" | "cuguman" | "classical";
export type NetlmTestStatistic = "t-value" | "beta";
export type NetlogitTestStatistic = "z-value" | "beta";
export type ConsensusMethod =
  | "central.graph"
  | "single.reweight"
  | "iterative.reweight"
  | "PCA.reweight"
  | "romney.batchelder"
  | "LAS.intersection"
  | "LAS.union"
  | "OR.row"
  | "OR.col";
export type NacfType = "correlation" | "covariance" | "moran" | "geary";
export type NetcancorNull = "qap" | "cug" | "cugden" | "cugtie";

export type BrokerageClass = string | number | boolean | null | undefined;

export interface BrokerageResult {
  readonly type: "brokerage";
  readonly rawNli: number[][];
  readonly expNli: number[][];
  readonly sdNli: number[][];
  readonly zNli: number[][];
  readonly rawGli: number[];
  readonly expGli: number[];
  readonly sdGli: number[];
  readonly zGli: number[];
  readonly expGrp: number[][];
  readonly sdGrp: number[][];
  readonly cl: BrokerageClass[];
  readonly clid: BrokerageClass[];
  readonly n: number[];
  readonly N: number;
  readonly roleNames: readonly ["w_I", "w_O", "b_IO", "b_OI", "b_O", "t"];
}

export interface ConsensusOptions {
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly method?: ConsensusMethod;
  readonly tol?: number;
  readonly maxiter?: number;
  readonly verbose?: boolean;
  readonly noBias?: boolean;
}

export interface ConsensusMetadata {
  readonly competency?: number[];
  readonly bias?: number[];
  readonly iterations?: number;
}

export type ConsensusResult = number[][] & { metadata?: ConsensusMetadata };

export interface NacfOptions {
  readonly lagMax?: number | null;
  readonly type?: NacfType;
  readonly neighborhoodType?: NeighborhoodType;
  readonly partialNeighborhood?: boolean;
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly thresh?: number;
  readonly demean?: boolean;
}

export interface NetcancorOptions extends RandomOptions {
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly nullhyp?: NetcancorNull;
  readonly reps?: number;
  readonly tol?: number;
}

export interface NetcancorResult {
  readonly type: "netcancor";
  readonly cor: number[];
  readonly xcoef: number[][];
  readonly ycoef: number[][];
  readonly cdist: number[][];
  readonly xdist: number[][][];
  readonly ydist: number[][][];
  readonly cpgreq: number[];
  readonly cpleeq: number[];
  readonly xpgreq: number[][];
  readonly xpleeq: number[][];
  readonly ypgreq: number[][];
  readonly ypleeq: number[][];
  readonly cnames: string[];
  readonly xnames: string[];
  readonly ynames: string[];
  readonly xcenter: number[];
  readonly ycenter: number[];
  readonly nullhyp: NetcancorNull;
  readonly reps: number;
}

export interface NetlmOptions extends RandomOptions {
  readonly intercept?: boolean;
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly nullhyp?: NetworkRegressionNull;
  readonly testStatistic?: NetlmTestStatistic;
  readonly tol?: number;
  readonly reps?: number;
}

export interface NetlogitOptions extends RandomOptions {
  readonly intercept?: boolean;
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly nullhyp?: NetworkRegressionNull;
  readonly testStatistic?: NetlogitTestStatistic;
  readonly tol?: number;
  readonly reps?: number;
  readonly maxit?: number;
}

export interface NetworkRegressionResult {
  readonly coefficients: number[];
  readonly fittedValues: number[];
  readonly residuals: number[];
  readonly rank: number;
  readonly n: number;
  readonly dfResidual: number;
  readonly standardErrors: number[];
  readonly tstat: number[];
  readonly distribution: number[][] | null;
  readonly pLessEqual: number[];
  readonly pGreaterEqual: number[];
  readonly pGreaterEqualAbs: number[];
  readonly nullhyp: NetworkRegressionNull;
  readonly names: string[];
  readonly intercept: boolean;
}

export interface NetlmResult extends NetworkRegressionResult {
  readonly type: "netlm";
  readonly sigma2: number;
  readonly testStatistic: NetlmTestStatistic;
}

export interface NetlogitResult extends NetworkRegressionResult {
  readonly type: "netlogit";
  readonly se: number[];
  readonly linearPredictors: number[];
  readonly deviance: number;
  readonly nullDeviance: number;
  readonly dfModel: number;
  readonly dfNull: number;
  readonly aic: number;
  readonly bic: number;
  readonly contingencyTable: readonly [readonly [number, number], readonly [number, number]];
  readonly converged: boolean;
  readonly iterations: number;
  readonly testStatistic: NetlogitTestStatistic;
}

export interface PstarOptions {
  readonly effects?: readonly PstarEffect[];
  readonly attr?: readonly number[] | readonly (readonly number[])[];
  readonly memb?: readonly (string | number | boolean | null | undefined)[] | readonly (readonly (string | number | boolean | null | undefined)[])[];
  readonly diag?: boolean;
  readonly mode?: GraphMode;
  readonly maxit?: number;
  readonly tol?: number;
}

export type PstarEffect =
  | "choice"
  | "mutuality"
  | "density"
  | "reciprocity"
  | "stransitivity"
  | "wtransitivity"
  | "stranstri"
  | "wtranstri"
  | "outdegree"
  | "indegree"
  | "betweenness"
  | "closeness"
  | "degcentralization"
  | "betcentralization"
  | "clocentralization"
  | "connectedness"
  | "hierarchy"
  | "lubness"
  | "efficiency";

export interface PstarResult extends Omit<NetlogitResult, "type"> {
  readonly type: "pstar";
  readonly tieData: number[][];
  readonly predictorNames: string[];
}

export type LnamNullModel = "meanstd" | "mean" | "std" | "none";

export interface LnamOptions {
  readonly thetaSeed?: readonly number[];
  readonly nullModel?: LnamNullModel;
  readonly tol?: number;
  readonly maxOuterIterations?: number;
  readonly optimControl?: NelderMeadOptions;
}

export interface LnamResult {
  readonly type: "lnam";
  readonly y: number[];
  readonly x?: number[][];
  readonly W1?: number[][][];
  readonly W2?: number[][][];
  readonly model: string;
  readonly infomat: number[][];
  readonly acvm: number[][];
  readonly nullModel: LnamNullModel;
  readonly lnlikNull: number;
  readonly dfNullResidual: number;
  readonly dfNull: number;
  readonly nullParam: number[] | null;
  readonly lnlikModel: number;
  readonly dfModel: number;
  readonly dfResidual: number;
  readonly dfTotal: number;
  readonly beta?: number[];
  readonly betaSe?: number[];
  readonly rho1?: number[];
  readonly rho1Se?: number[];
  readonly rho2?: number[];
  readonly rho2Se?: number[];
  readonly sigmasq: number;
  readonly sigmasqSe: number;
  readonly sigma: number;
  readonly sigmaSe: number;
  readonly fittedValues: number[];
  readonly residuals: number[];
  readonly disturbances: number[];
}

export interface BbnamFixedOptions extends RandomOptions {
  readonly nprior?: number | readonly (readonly number[])[];
  readonly em?: ErrorProbabilityInput;
  readonly ep?: ErrorProbabilityInput;
  readonly diag?: boolean;
  readonly mode?: GraphMode;
  readonly draws?: number;
  readonly outmode?: "draws" | "posterior";
  readonly anames?: readonly string[];
  readonly onames?: readonly string[];
}

export interface BbnamMcmcOptions extends RandomOptions {
  readonly nprior?: number | readonly (readonly number[])[];
  readonly emprior?: BetaPriorInput;
  readonly epprior?: BetaPriorInput;
  readonly diag?: boolean;
  readonly mode?: GraphMode;
  readonly reps?: number;
  readonly draws?: number;
  readonly burntime?: number;
  readonly anames?: readonly string[];
  readonly onames?: readonly string[];
  readonly computeSqrtrhat?: boolean;
}

export interface BbnamOptions extends BbnamFixedOptions, BbnamMcmcOptions {
  readonly model?: "actor" | "pooled" | "fixed";
}

export type ErrorProbabilityInput = number | readonly number[] | readonly (readonly number[])[] | readonly (readonly (readonly number[])[])[];
export type BetaPriorInput = readonly [number, number] | readonly number[] | readonly (readonly number[])[];

export interface BbnamDrawResult {
  readonly type: "bbnam";
  readonly model: "actor" | "pooled" | "fixed";
  readonly net: number[][][];
  readonly em?: number[] | number[][];
  readonly ep?: number[] | number[][];
  readonly anames: string[];
  readonly onames: string[];
  readonly nactors: number;
  readonly nobservers: number;
  readonly reps?: number;
  readonly draws: number;
  readonly burntime?: number;
  readonly sqrtrhat?: number[];
}

export interface BbnamBfOptions extends RandomOptions {
  readonly nprior?: number | readonly (readonly number[])[];
  readonly emFixed?: number;
  readonly epFixed?: number;
  readonly empriorPooled?: readonly [number, number];
  readonly eppriorPooled?: readonly [number, number];
  readonly empriorActor?: BetaPriorInput;
  readonly eppriorActor?: BetaPriorInput;
  readonly diag?: boolean;
  readonly mode?: GraphMode;
  readonly reps?: number;
}

export interface BbnamBfResult {
  readonly type: "bayes.factor";
  readonly integratedLogLikelihood: number[][];
  readonly integratedLogLikelihoodStd: number[];
  readonly reps: number;
  readonly modelNames: readonly ["Fixed Error Prob", "Pooled Error Prob", "Actor Error Prob"];
}

export type BnMethod = "mple.dyad" | "mple.edge" | "mtle" | "mple.triad";

export interface BnOptions {
  readonly method?: BnMethod;
  readonly paramSeed?: Partial<BnParameters>;
  readonly paramFixed?: Partial<BnParameters>;
  readonly epsilon?: number;
  readonly optimControl?: NelderMeadOptions;
}

export interface BnParameters {
  readonly pi: number;
  readonly sigma: number;
  readonly rho: number;
  readonly d: number;
}

export interface BnResult extends BnParameters {
  readonly type: "bn";
  readonly method: BnMethod;
  readonly gSquare: number;
  readonly epsilon: number;
  readonly triads: Record<string, number>;
  readonly triadsPred: Record<string, number>;
  readonly dyads: Record<"Mut" | "Asym" | "Null", number>;
  readonly dyadsPred: Record<"Mut" | "Asym" | "Null", number>;
  readonly edges: Record<"Present" | "Absent", number>;
  readonly edgesPred: Record<"Present" | "Absent", number>;
  readonly structureStatistics: number[];
  readonly structureStatisticsPred: number[];
}

export interface BnDyadStat {
  readonly parents: number;
  readonly mutual: number;
  readonly asymmetric: number;
  readonly nullDyads: number;
}

interface RegressionData {
  readonly graphs: number[][][];
  readonly y: number[];
  readonly x: number[][];
  readonly names: string[];
  readonly order: number;
  readonly predictorCount: number;
}

interface LinearFit {
  readonly coefficients: number[];
  readonly fittedValues: number[];
  readonly residuals: number[];
  readonly rank: number;
  readonly dfResidual: number;
  readonly sigma2: number;
  readonly covariance: number[][];
  readonly standardErrors: number[];
  readonly tValues: number[];
}

interface LogisticFit {
  readonly coefficients: number[];
  readonly fittedValues: number[];
  readonly residuals: number[];
  readonly linearPredictors: number[];
  readonly covariance: number[][];
  readonly standardErrors: number[];
  readonly zValues: number[];
  readonly rank: number;
  readonly dfResidual: number;
  readonly dfModel: number;
  readonly deviance: number;
  readonly nullDeviance: number;
  readonly dfNull: number;
  readonly aic: number;
  readonly bic: number;
  readonly contingencyTable: readonly [readonly [number, number], readonly [number, number]];
  readonly converged: boolean;
  readonly iterations: number;
}

interface NelderMeadOptions {
  readonly maxIterations?: number;
  readonly tolerance?: number;
  readonly initialStep?: number;
}

const TRIAD_NAMES = ["003", "012", "102", "021D", "021U", "021C", "111D", "111U", "030T", "030C", "201", "120D", "120U", "120C", "210", "300"] as const;
const PSTAR_DEFAULT_EFFECTS: readonly PstarEffect[] = [
  "choice",
  "mutuality",
  "density",
  "reciprocity",
  "stransitivity",
  "wtransitivity",
  "stranstri",
  "wtranstri",
  "outdegree",
  "indegree",
  "betweenness",
  "closeness",
  "degcentralization",
  "betcentralization",
  "clocentralization",
  "connectedness",
  "hierarchy",
  "lubness",
  "efficiency",
];

export function brokerage(input: GraphInput | readonly GraphInput[], cl: readonly BrokerageClass[]): BrokerageResult | BrokerageResult[] {
  const stack = graphArray(input);
  return stack.length === 1 ? brokerageSingle(stack[0]!, cl) : stack.map((graph) => brokerageSingle(graph, cl));
}

export function consensus(dat: GraphInput | readonly GraphInput[], options: ConsensusOptions = {}): ConsensusResult {
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const method = options.method ?? "central.graph";
  const stack = maskConsensusStack(graphArray(dat), mode, diag);
  const m = stack.length;
  const n = stack[0]?.length ?? 0;
  if (!stack.every((matrix) => matrix.length === n && matrix.every((row) => row.length === n))) throw new RangeError("consensus requires graphs of identical order");
  let metadata: ConsensusMetadata | undefined;
  let cong: number[][];

  if (method === "central.graph") {
    cong = centralgraph(stack) as number[][];
  } else if (method === "single.reweight" || method === "PCA.reweight") {
    const corr = gcor(stack) as number[][];
    for (let i = 0; i < corr.length; i += 1) {
      for (let j = 0; j < corr.length; j += 1) if (Number.isNaN(corr[i]![j]!)) corr[i]![j] = 0;
      corr[i]![i] = 1;
    }
    let weights: number[];
    if (method === "single.reweight") {
      weights = corr.map((row) => row.reduce((sum, value) => sum + value, 0));
      const total = weights.reduce((sum, value) => sum + value, 0);
      weights = total === 0 ? weights.map(() => 1 / weights.length) : weights.map((value) => value / total);
    } else {
      weights = jacobiEigenSymmetric(corr).vectors.map((row) => Math.abs(row[0] ?? 0));
      const total = weights.reduce((sum, value) => sum + value, 0);
      weights = total === 0 ? weights.map(() => 1 / weights.length) : weights.map((value) => value / total);
    }
    cong = weightedConsensus(stack, weights);
  } else if (method === "iterative.reweight") {
    const result = iterativeConsensus(stack, options.tol ?? 1e-6, options.maxiter ?? 1000, options.noBias ?? false, false);
    cong = result.graph;
    metadata = result.metadata;
  } else if (method === "romney.batchelder") {
    const result = iterativeConsensus(stack.filter((matrix) => !matrix.every((row) => row.every(Number.isNaN))), options.tol ?? 1e-6, options.maxiter ?? 1000, options.noBias ?? false, true);
    cong = result.graph;
    metadata = result.metadata;
  } else {
    if (m < n) throw new RangeError(`${method} consensus requires one observation graph per actor`);
    cong = createNumberMatrix(n, n);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (method === "LAS.intersection") cong[i]![j] = truthyTie(stack[i]![i]![j]!) && truthyTie(stack[j]![i]![j]!) ? 1 : 0;
        else if (method === "LAS.union") cong[i]![j] = truthyTie(stack[i]![i]![j]!) || truthyTie(stack[j]![i]![j]!) ? 1 : 0;
        else if (method === "OR.row") cong[i]![j] = stack[i]![i]![j]!;
        else if (method === "OR.col") cong[j]![i] = stack[i]![j]![i]!;
      }
    }
  }

  finalizeConsensus(cong, mode, diag);
  return attachConsensusMetadata(cong, metadata);
}

export function nacf(net: GraphInput | readonly GraphInput[], y: readonly number[], options: NacfOptions = {}): number[] | number[][] {
  const stack = graphArray(net);
  const out = stack.map((matrix) => nacfSingle(matrix, y, options));
  return stack.length === 1 ? out[0]! : out;
}

export function netcancor(yInput: GraphInput | readonly GraphInput[], xInput: GraphInput | readonly GraphInput[], options: NetcancorOptions = {}): NetcancorResult {
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const nullhyp = options.nullhyp ?? "cugtie";
  const reps = resolveNonnegativeInteger(options.reps ?? 1000, "reps");
  const tol = options.tol ?? 1e-10;
  const yStack = graphArray(yInput);
  const xStack = graphArray(xInput);
  const order = yStack[0]?.length ?? 0;
  if (![...yStack, ...xStack].every((matrix) => matrix.length === order && matrix.every((row) => row.length === order))) throw new RangeError("netcancor requires graphs of identical order");
  const observed = canonicalCorrelation(netcancorRows(xStack, mode, diag), netcancorRows(yStack, mode, diag), tol);
  const components = observed.correlations.length;
  const rng = resolveRandomSource(options);
  const cdist = createNumberMatrix(reps, components, Number.NaN);
  const xdist = Array.from({ length: reps }, () => createNumberMatrix(xStack.length, components, Number.NaN));
  const ydist = Array.from({ length: reps }, () => createNumberMatrix(yStack.length, components, Number.NaN));

  for (let rep = 0; rep < reps; rep += 1) {
    const yr = yStack.map((graph) => netcancorRandomGraph(graph, nullhyp, mode, diag, rng));
    const xr = xStack.map((graph) => netcancorRandomGraph(graph, nullhyp, mode, diag, rng));
    const fit = canonicalCorrelation(netcancorRows(xr, mode, diag), netcancorRows(yr, mode, diag), tol);
    cdist[rep] = observed.correlations.map((_value, index) => fit.correlations[index] ?? Number.NaN);
    xdist[rep] = resizeCoefficientMatrix(fit.xcoef, xStack.length, components);
    ydist[rep] = resizeCoefficientMatrix(fit.ycoef, yStack.length, components);
  }

  return {
    type: "netcancor",
    cor: observed.correlations,
    xcoef: resizeCoefficientMatrix(observed.xcoef, xStack.length, components),
    ycoef: resizeCoefficientMatrix(observed.ycoef, yStack.length, components),
    cdist,
    xdist,
    ydist,
    cpgreq: tailByColumn(cdist, observed.correlations, "greater"),
    cpleeq: tailByColumn(cdist, observed.correlations, "less"),
    xpgreq: coefficientTailMatrix(xdist, observed.xcoef, "greater"),
    xpleeq: coefficientTailMatrix(xdist, observed.xcoef, "less"),
    ypgreq: coefficientTailMatrix(ydist, observed.ycoef, "greater"),
    ypleeq: coefficientTailMatrix(ydist, observed.ycoef, "less"),
    cnames: Array.from({ length: components }, (_unused, index) => `cor${index + 1}`),
    xnames: Array.from({ length: xStack.length }, (_unused, index) => `x${index + 1}`),
    ynames: Array.from({ length: yStack.length }, (_unused, index) => `y${index + 1}`),
    xcenter: observed.xcenter,
    ycenter: observed.ycenter,
    nullhyp,
    reps,
  };
}

export function netlm(y: GraphInput, x: GraphInput | readonly GraphInput[], options: NetlmOptions = {}): NetlmResult {
  const intercept = options.intercept ?? true;
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const tol = options.tol ?? 1e-7;
  const requestedNull = options.nullhyp ?? "qap";
  const testStatistic = options.testStatistic ?? "t-value";
  const data = regressionData(y, x, intercept, mode, diag);
  const fit = fitLinearModel(data.x, data.y, tol);
  const tstat = testStatistic === "beta" ? fit.coefficients : fit.tValues;
  const nullhyp = requestedNull === "qap" && data.predictorCount === 1 ? "qapy" : requestedNull === "qapspp" && data.predictorCount === 1 ? "qapy" : requestedNull;
  const test = regressionTestDistribution(data, nullhyp, testStatistic, options.reps ?? 1000, mode, diag, tol, options, linearStatistic);

  return {
    type: "netlm",
    coefficients: fit.coefficients,
    fittedValues: fit.fittedValues,
    residuals: fit.residuals,
    rank: fit.rank,
    n: data.y.length,
    dfResidual: fit.dfResidual,
    sigma2: fit.sigma2,
    standardErrors: fit.standardErrors,
    tstat,
    distribution: test.distribution,
    pLessEqual: test.pLessEqual ?? fit.tValues.map((value) => studentTCdf(value, fit.dfResidual)),
    pGreaterEqual: test.pGreaterEqual ?? fit.tValues.map((value) => 1 - studentTCdf(value, fit.dfResidual)),
    pGreaterEqualAbs: test.pGreaterEqualAbs ?? fit.tValues.map((value) => 2 * (1 - studentTCdf(Math.abs(value), fit.dfResidual))),
    nullhyp,
    names: data.names,
    intercept,
    testStatistic,
  };
}

export function netlogit(y: GraphInput, x: GraphInput | readonly GraphInput[], options: NetlogitOptions = {}): NetlogitResult {
  const intercept = options.intercept ?? true;
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const tol = options.tol ?? 1e-7;
  const requestedNull = options.nullhyp ?? "qap";
  const testStatistic = options.testStatistic ?? "z-value";
  const data = regressionData(y, x, intercept, mode, diag);
  const fit = fitLogisticModel(data.x, data.y, { tol, maxit: options.maxit });
  const tstat = testStatistic === "beta" ? fit.coefficients : fit.zValues;
  const nullhyp = requestedNull === "qap" && data.predictorCount === 1 ? "qapy" : requestedNull === "qapspp" && data.predictorCount === 1 ? "qapy" : requestedNull;
  const test = regressionTestDistribution(data, nullhyp, testStatistic, options.reps ?? 1000, mode, diag, tol, options, (graphs, graphMode, graphDiag, fitTol) =>
    logisticStatistic(graphs, graphMode, graphDiag, fitTol, testStatistic, options.maxit),
  );

  return {
    type: "netlogit",
    coefficients: fit.coefficients,
    fittedValues: fit.fittedValues,
    residuals: fit.residuals,
    linearPredictors: fit.linearPredictors,
    rank: fit.rank,
    n: data.y.length,
    dfResidual: fit.dfResidual,
    dfModel: fit.dfModel,
    dfNull: fit.dfNull,
    standardErrors: fit.standardErrors,
    se: fit.standardErrors,
    tstat,
    distribution: test.distribution,
    pLessEqual: test.pLessEqual ?? fit.zValues.map((value) => studentTCdf(value, fit.dfResidual)),
    pGreaterEqual: test.pGreaterEqual ?? fit.zValues.map((value) => 1 - studentTCdf(value, fit.dfResidual)),
    pGreaterEqualAbs: test.pGreaterEqualAbs ?? fit.zValues.map((value) => 2 * (1 - studentTCdf(Math.abs(value), fit.dfResidual))),
    nullhyp,
    names: data.names,
    intercept,
    deviance: fit.deviance,
    nullDeviance: fit.nullDeviance,
    aic: fit.aic,
    bic: fit.bic,
    contingencyTable: fit.contingencyTable,
    converged: fit.converged,
    iterations: fit.iterations,
    testStatistic,
  };
}

export function pstar(dat: GraphInput, options: PstarOptions = {}): PstarResult {
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const effects = options.effects ?? PSTAR_DEFAULT_EFFECTS;
  const matrix = asSingleGraph(dat, "pstar dat");
  const n = matrix.length;
  const prepared = maskPstarMatrix(matrix, mode, diag);
  const attrs = normalizeNumericColumns(options.attr, n, "attr");
  const memberships = normalizeMembershipColumns(options.memb, n, "memb");
  const rows: number[][] = [];
  const responses: number[] = [];

  for (let tail = 0; tail < n; tail += 1) {
    for (let head = 0; head < n; head += 1) {
      const observed = prepared[tail]![head]!;
      if (Number.isNaN(observed)) continue;
      const predictors = pstarPredictors(prepared, tail, head, effects, attrs.columns, memberships.columns, mode, diag);
      if (!predictors.every(Number.isFinite)) continue;
      responses.push(observed > 0 ? 1 : 0);
      rows.push(predictors);
    }
  }

  const predictorNames = pstarPredictorNames(effects, n, attrs.names, memberships.names);
  const fit = fitLogisticModel(rows, responses, { tol: options.tol, maxit: options.maxit });
  return {
    type: "pstar",
    coefficients: fit.coefficients,
    fittedValues: fit.fittedValues,
    residuals: fit.residuals,
    linearPredictors: fit.linearPredictors,
    rank: fit.rank,
    n: responses.length,
    dfResidual: fit.dfResidual,
    dfModel: fit.dfModel,
    dfNull: fit.dfNull,
    standardErrors: fit.standardErrors,
    se: fit.standardErrors,
    tstat: fit.zValues,
    distribution: null,
    pLessEqual: fit.zValues.map(normalCdf),
    pGreaterEqual: fit.zValues.map((value) => 1 - normalCdf(value)),
    pGreaterEqualAbs: fit.zValues.map((value) => 2 * (1 - normalCdf(Math.abs(value)))),
    nullhyp: "classical",
    names: predictorNames,
    intercept: false,
    deviance: fit.deviance,
    nullDeviance: fit.nullDeviance,
    aic: fit.aic,
    bic: fit.bic,
    contingencyTable: fit.contingencyTable,
    converged: fit.converged,
    iterations: fit.iterations,
    testStatistic: "z-value",
    tieData: rows.map((row, index) => [responses[index]!, ...row]),
    predictorNames,
  };
}

export function lnam(
  yInput: readonly number[],
  xInput: readonly number[] | readonly (readonly number[])[] | null = null,
  W1Input: GraphInput | readonly GraphInput[] | null = null,
  W2Input: GraphInput | readonly GraphInput[] | null = null,
  options: LnamOptions = {},
): LnamResult {
  const y = yInput.map(assertFiniteNumber);
  const n = y.length;
  const x = xInput === null ? undefined : normalizeDesignMatrix(xInput, n, "x");
  const W1 = W1Input === null ? undefined : graphArray(W1Input).map((matrix) => checkedSquareMatrix(matrix, n, "W1"));
  const W2 = W2Input === null ? undefined : graphArray(W2Input).map((matrix) => checkedSquareMatrix(matrix, n, "W2"));
  const nx = x?.[0]?.length ?? 0;
  const nw1 = W1?.length ?? 0;
  const nw2 = W2?.length ?? 0;
  if (nx + nw1 + nw2 === 0) throw new Error("At least one of x, W1, W2 must be specified.");

  const model = String((nx > 0 ? 1 : 0) + (nw1 > 0 ? 10 : 0) + (nw2 > 0 ? 100 : 0));
  const parameterCount = nx + nw1 + nw2 + 1;
  let parm = initialLnamParameters(nx, nw1, nw2, options.thetaSeed);
  let oldDev = Number.POSITIVE_INFINITY;
  const tol = options.tol ?? 1e-10;
  const maxOuter = options.maxOuterIterations ?? 200;
  for (let iter = 0; iter < maxOuter; iter += 1) {
    parm = estimateLnam(y, x, W1, W2, parm, false, options.optimControl);
    if (Number.isFinite(parm.dev) && Math.abs(parm.dev - oldDev) <= tol) break;
    oldDev = parm.dev;
  }
  parm = estimateLnam(y, x, W1, W2, parm, true, options.optimControl);

  const vector = [...parm.beta, ...parm.rho1, ...parm.rho2, parm.sigmasq];
  const infomat = finiteDifferenceHessian((par) => lnamNegativeLogLikelihood(y, x, W1, W2, par), vector);
  const acvm = safeInverse(infomat, 1e-10) ?? createNaNMatrix(parameterCount, parameterCount);
  const se = diagonal(acvm).map((value) => (value >= 0 ? Math.sqrt(value) : Number.NaN));
  const nullModel = options.nullModel ?? "meanstd";
  const nullInfo = lnamNull(y, nullModel);
  const W1ag = nw1 > 0 ? aggregateMatrices(W1!, parm.rho1) : undefined;
  const W2ag = nw2 > 0 ? aggregateMatrices(W2!, parm.rho2) : undefined;
  const fittedValues = lnamFittedValues(y, x, W1ag, W2ag, parm.beta, model);
  const residuals = y.map((value, index) => value - fittedValues[index]!);
  const disturbances = lnamDisturbances(y, x, W1ag, W2ag, parm.beta, model);

  return {
    type: "lnam",
    y,
    ...(x ? { x } : {}),
    ...(W1 ? { W1 } : {}),
    ...(W2 ? { W2 } : {}),
    model,
    infomat,
    acvm,
    nullModel,
    lnlikNull: nullInfo.logLikelihood,
    dfNullResidual: nullInfo.dfResidual,
    dfNull: nullInfo.df,
    nullParam: nullInfo.parameters,
    lnlikModel: -parm.dev / 2,
    dfModel: parameterCount,
    dfResidual: n - parameterCount,
    dfTotal: n,
    ...(nx > 0 ? { beta: parm.beta, betaSe: se.slice(0, nx) } : {}),
    ...(nw1 > 0 ? { rho1: parm.rho1, rho1Se: se.slice(nx, nx + nw1) } : {}),
    ...(nw2 > 0 ? { rho2: parm.rho2, rho2Se: se.slice(nx + nw1, nx + nw1 + nw2) } : {}),
    sigmasq: parm.sigmasq,
    sigmasqSe: se[parameterCount - 1] ?? Number.NaN,
    sigma: Math.sqrt(parm.sigmasq),
    sigmaSe: (se[parameterCount - 1] ?? Number.NaN) ** 2 / (4 * parm.sigmasq),
    fittedValues,
    residuals,
    disturbances,
  };
}

export function coefLnam(object: LnamResult): number[] {
  return [...(object.beta ?? []), ...(object.rho1 ?? []), ...(object.rho2 ?? [])];
}

export function seLnam(object: LnamResult): number[] {
  return [...(object.betaSe ?? []), ...(object.rho1Se ?? []), ...(object.rho2Se ?? [])];
}

export function bbnam(dat: GraphInput | readonly GraphInput[], options: BbnamOptions = {}): BbnamDrawResult | number[][] {
  const model = options.model ?? "actor";
  if (model === "fixed") return bbnamFixed(dat, options);
  if (model === "pooled") return bbnamPooled(dat, options);
  return bbnamActor(dat, options);
}

export function bbnamFixed(dat: GraphInput | readonly GraphInput[], options: BbnamFixedOptions = {}): BbnamDrawResult | number[][] {
  const stack = graphArray(dat);
  const m = stack.length;
  const n = checkedObservationStack(stack);
  const nprior = expandProbabilityMatrix(options.nprior ?? 0.5, n, "nprior");
  const em = expandErrorProbability(options.em ?? 0.25, m, n, "em");
  const ep = expandErrorProbability(options.ep ?? 0.25, m, n, "ep");
  const posterior = bbnamPosterior(stack, nprior, em, ep);
  if ((options.outmode ?? "draws") === "posterior") return posterior;

  const draws = resolveNonnegativeInteger(options.draws ?? 1500, "draws");
  const rng = resolveRandomSource(options);
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  return {
    type: "bbnam",
    model: "fixed",
    net: Array.from({ length: draws }, () => drawGraphFromProbability(posterior, mode, diag, rng)),
    anames: resolveNames(options.anames, n, "a"),
    onames: resolveNames(options.onames, m, "o"),
    nactors: n,
    nobservers: m,
    draws,
  };
}

export function bbnamPooled(dat: GraphInput | readonly GraphInput[], options: BbnamMcmcOptions = {}): BbnamDrawResult {
  const stack = maskBbnamStack(graphArray(dat), options.mode ?? "digraph", options.diag ?? false);
  const m = stack.length;
  const n = checkedObservationStack(stack);
  const nprior = expandProbabilityMatrix(options.nprior ?? 0.5, n, "nprior");
  const emprior = normalizeBetaPair(options.emprior ?? [1, 11], "emprior");
  const epprior = normalizeBetaPair(options.epprior ?? [1, 11], "epprior");
  const reps = resolvePositiveInteger(options.reps ?? 5, "reps");
  const draws = resolveNonnegativeInteger(options.draws ?? 1500, "draws");
  const burntime = resolveNonnegativeInteger(options.burntime ?? 500, "burntime");
  const perChain = Math.floor(draws / reps);
  const rng = resolveRandomSource(options);
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const netChains: number[][][][] = [];
  const emChains: number[][] = [];
  const epChains: number[][] = [];

  for (let chain = 0; chain < reps; chain += 1) {
    let current = drawGraphFromProbability(nprior, mode, diag, rng);
    let em = rng() * 0.5;
    let ep = rng() * 0.5;
    const netDraws: number[][][] = [];
    const emDraws: number[] = [];
    const epDraws: number[] = [];
    for (let step = 0; step < burntime + perChain; step += 1) {
      const posterior = bbnamPosterior(stack, nprior, scalarError(m, n, em), scalarError(m, n, ep));
      current = drawGraphFromProbability(posterior, mode, diag, rng);
      const counts = bbnamErrorCounts(stack, current);
      em = betaRandom(emprior[0] + counts.falseNegative, emprior[1] + counts.truePositive, rng);
      ep = betaRandom(epprior[0] + counts.falsePositive, epprior[1] + counts.trueNegative, rng);
      if (step >= burntime) {
        netDraws.push(cloneMatrix(current));
        emDraws.push(em);
        epDraws.push(ep);
      }
    }
    netChains.push(netDraws);
    emChains.push(emDraws);
    epChains.push(epDraws);
  }

  const net = netChains.flat();
  const em = emChains.flat();
  const ep = epChains.flat();
  const result: BbnamDrawResult = {
    type: "bbnam",
    model: "pooled",
    net,
    em,
    ep,
    anames: resolveNames(options.anames, n, "a"),
    onames: resolveNames(options.onames, m, "o"),
    nactors: n,
    nobservers: m,
    reps,
    draws: em.length,
    burntime,
  };
  if ((options.computeSqrtrhat ?? true) && reps > 1) {
    return { ...result, sqrtrhat: [...bbnamNetRhat(netChains, n), potentialScaleReduction(emChains), potentialScaleReduction(epChains)] };
  }
  return result;
}

export function bbnamActor(dat: GraphInput | readonly GraphInput[], options: BbnamMcmcOptions = {}): BbnamDrawResult {
  const stack = maskBbnamStack(graphArray(dat), options.mode ?? "digraph", options.diag ?? false);
  const m = stack.length;
  const n = checkedObservationStack(stack);
  const nprior = expandProbabilityMatrix(options.nprior ?? 0.5, n, "nprior");
  const emprior = normalizeBetaPriorRows(options.emprior ?? [1, 11], m, "emprior");
  const epprior = normalizeBetaPriorRows(options.epprior ?? [1, 11], m, "epprior");
  const reps = resolvePositiveInteger(options.reps ?? 5, "reps");
  const draws = resolveNonnegativeInteger(options.draws ?? 1500, "draws");
  const burntime = resolveNonnegativeInteger(options.burntime ?? 500, "burntime");
  const perChain = Math.floor(draws / reps);
  const rng = resolveRandomSource(options);
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const netChains: number[][][][] = [];
  const emChains: number[][][] = [];
  const epChains: number[][][] = [];

  for (let chain = 0; chain < reps; chain += 1) {
    let current = drawGraphFromProbability(nprior, mode, diag, rng);
    let em = Array.from({ length: m }, () => rng() * 0.5);
    let ep = Array.from({ length: m }, () => rng() * 0.5);
    const netDraws: number[][][] = [];
    const emDraws: number[][] = [];
    const epDraws: number[][] = [];
    for (let step = 0; step < burntime + perChain; step += 1) {
      const posterior = bbnamPosterior(stack, nprior, observerError(m, n, em), observerError(m, n, ep));
      current = drawGraphFromProbability(posterior, mode, diag, rng);
      const counts = Array.from({ length: m }, (_unused, observer) => bbnamErrorCounts([stack[observer]!], current));
      em = counts.map((count, observer) => betaRandom(emprior[observer]![0]! + count.falseNegative, emprior[observer]![1]! + count.truePositive, rng));
      ep = counts.map((count, observer) => betaRandom(epprior[observer]![0]! + count.falsePositive, epprior[observer]![1]! + count.trueNegative, rng));
      if (step >= burntime) {
        netDraws.push(cloneMatrix(current));
        emDraws.push([...em]);
        epDraws.push([...ep]);
      }
    }
    netChains.push(netDraws);
    emChains.push(emDraws);
    epChains.push(epDraws);
  }

  const net = netChains.flat();
  const em = emChains.flat();
  const ep = epChains.flat();
  const result: BbnamDrawResult = {
    type: "bbnam",
    model: "actor",
    net,
    em,
    ep,
    anames: resolveNames(options.anames, n, "a"),
    onames: resolveNames(options.onames, m, "o"),
    nactors: n,
    nobservers: m,
    reps,
    draws: em.length,
    burntime,
  };
  if ((options.computeSqrtrhat ?? true) && reps > 1) {
    return {
      ...result,
      sqrtrhat: [
        ...bbnamNetRhat(netChains, n),
        ...Array.from({ length: m }, (_unused, observer) => potentialScaleReduction(emChains.map((chain) => chain.map((draw) => draw[observer]!)))),
        ...Array.from({ length: m }, (_unused, observer) => potentialScaleReduction(epChains.map((chain) => chain.map((draw) => draw[observer]!)))),
      ],
    };
  }
  return result;
}

export function bbnamBf(dat: GraphInput | readonly GraphInput[], options: BbnamBfOptions = {}): BbnamBfResult {
  const stack = maskBbnamStack(graphArray(dat), options.mode ?? "digraph", options.diag ?? false);
  const m = stack.length;
  const n = checkedObservationStack(stack);
  const nprior = expandProbabilityMatrix(options.nprior ?? 0.5, n, "nprior");
  const empriorPooled = normalizeBetaPair(options.empriorPooled ?? [1, 11], "empriorPooled");
  const eppriorPooled = normalizeBetaPair(options.eppriorPooled ?? [1, 11], "eppriorPooled");
  const empriorActor = normalizeBetaPriorRows(options.empriorActor ?? [1, 11], m, "empriorActor");
  const eppriorActor = normalizeBetaPriorRows(options.eppriorActor ?? [1, 11], m, "eppriorActor");
  const reps = resolvePositiveInteger(options.reps ?? 1000, "reps");
  const rng = resolveRandomSource(options);
  const fixed: number[] = [];
  const pooled: number[] = [];
  const actor: number[] = [];
  for (let rep = 0; rep < reps; rep += 1) {
    const criterion = drawGraphFromProbability(nprior, options.mode ?? "digraph", options.diag ?? false, rng);
    fixed.push(bbnamJntlik(stack, criterion, options.emFixed ?? 0.5, options.epFixed ?? 0.5, true));
    pooled.push(bbnamJntlik(stack, criterion, betaRandom(empriorPooled[0], empriorPooled[1], rng), betaRandom(eppriorPooled[0], eppriorPooled[1], rng), true));
    actor.push(
      bbnamJntlik(
        stack,
        criterion,
        empriorActor.map((pair) => betaRandom(pair[0]!, pair[1]!, rng)),
        eppriorActor.map((pair) => betaRandom(pair[0]!, pair[1]!, rng)),
        true,
      ),
    );
  }
  const values = [logMean(fixed) as number, logMean(pooled) as number, logMean(actor) as number];
  const integratedLogLikelihood = values.map((value, row) => values.map((other, col) => (row === col ? value : value - other)));
  return {
    type: "bayes.factor",
    integratedLogLikelihood,
    integratedLogLikelihoodStd: [stddev(fixed), stddev(pooled), stddev(actor)],
    reps,
    modelNames: ["Fixed Error Prob", "Pooled Error Prob", "Actor Error Prob"],
  };
}

export function bbnamJntlik(dat: GraphInput | readonly GraphInput[] | number[][][], a: GraphInput, em: number | readonly number[], ep: number | readonly number[], log = false): number {
  const stack = Array.isArray(dat) && Array.isArray(dat[0]) && Array.isArray((dat[0] as unknown[])[0]) && Array.isArray(((dat[0] as unknown[])[0] as unknown[])[0])
    ? (dat as number[][][])
    : graphArray(dat as GraphInput | readonly GraphInput[]);
  const criterion = asSingleGraph(a, "a");
  const value = stack.reduce((sum, _slice, index) => sum + bbnamJntlikSlice(index, stack, criterion, em, ep, true), 0);
  return log ? value : Math.exp(value);
}

export function bbnamJntlikSlice(s: number, dat: number[][][], a: number[][], em: number | readonly number[], ep: number | readonly number[], log = false): number {
  const emLocal = typeof em === "number" ? em : em[s] ?? em[0] ?? 0;
  const epLocal = typeof ep === "number" ? ep : ep[s] ?? ep[0] ?? 0;
  let value = 0;
  const slice = dat[s]!;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < a.length; j += 1) {
      const observed = slice[i]![j]!;
      if (Number.isNaN(observed)) continue;
      const tie = a[i]![j]! > 0;
      const probability = tie ? (observed > 0 ? 1 - emLocal : emLocal) : observed > 0 ? epLocal : 1 - epLocal;
      value += Math.log(Math.max(probability, Number.MIN_VALUE));
    }
  }
  return log ? value : Math.exp(value);
}

export function bbnamProbtie(dat: GraphInput | readonly GraphInput[], i: number, j: number, npriorij: number, em: number | readonly number[], ep: number | readonly number[]): number {
  assertProbability(npriorij, "npriorij");
  const stack = graphArray(dat);
  const m = stack.length;
  if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= stack[0]!.length || j >= stack[0]!.length) throw new RangeError("tie indices are outside graph order");
  let num = npriorij;
  let denom = 1 - npriorij;
  for (let observer = 0; observer < m; observer += 1) {
    const observed = stack[observer]![i]![j]!;
    if (Number.isNaN(observed)) continue;
    const emLocal = typeof em === "number" ? em : em[observer] ?? em[0] ?? 0;
    const epLocal = typeof ep === "number" ? ep : ep[observer] ?? ep[0] ?? 0;
    num *= observed > 0 ? 1 - emLocal : emLocal;
    denom *= observed > 0 ? epLocal : 1 - epLocal;
  }
  return num / (num + denom);
}

export function npostpred<T>(b: BbnamDrawResult, fun: (graph: number[][], ...args: unknown[]) => T, ...args: unknown[]): T[] {
  return b.net.map((graph) => fun(graph, ...args));
}

export function potscaleredMcmc(psi: readonly (readonly number[])[]): number {
  return potentialScaleReduction(psi);
}

export function bn(dat: GraphInput, options: BnOptions = {}): BnResult {
  const method = options.method ?? "mple.triad";
  const matrix = bnBinaryMatrix(dat, "dat");
  const epsilon = options.epsilon ?? 1e-5;
  const seed: BnParameters = {
    pi: options.paramSeed?.pi ?? grecip(matrix, { measure: "edgewise" }),
    sigma: options.paramSeed?.sigma ?? gtrans(matrix),
    rho: options.paramSeed?.rho ?? gtrans(matrix),
    d: options.paramSeed?.d ?? gden(matrix),
  };
  const fixed = options.paramFixed ?? {};
  const start = [seed.pi, seed.sigma, seed.rho, seed.d].map((value, index) => logit(clampProbability(fixedValue(index, fixed) ?? value, epsilon)));
  const dyadStats = method === "mple.edge" || method === "mple.dyad" ? bnDyadStats(matrix) : undefined;
  const triadStats = method === "mple.triad" ? bnTriadStats(matrix) : undefined;
  const triadCensusStats = method === "mtle" ? triadCountsVector(matrix) : undefined;
  const objective = (raw: readonly number[]): number => {
    if (method === "mple.edge") return bnNlplEdge(raw, dyadStats!, fixed);
    if (method === "mple.dyad") return bnNlplDyad(raw, dyadStats!, fixed);
    if (method === "mple.triad") return bnNlplTriad(raw, matrix, triadStats!, fixed);
    return bnNltl(raw, triadCensusStats!, fixed);
  };
  const opt = nelderMead(start, objective, options.optimControl);
  const params = bnParamsFromRaw(opt.point, fixed, epsilon);
  const observedTriads = triadCountsRecord(matrix);
  const triadsPredValues = bnPtriad(params.pi, params.sigma, params.rho, params.d);
  const triadsPred = recordFromNames(TRIAD_NAMES, triadsPredValues);
  const observedDyadsRaw = dyadCensus(matrix);
  const dyads = { Mut: observedDyadsRaw.mutual, Asym: observedDyadsRaw.asymmetric, Null: observedDyadsRaw.nullDyads };
  const dyadsPredValues = predictedDyadsFromTriads(triadsPredValues);
  const dyadsPred = { Mut: dyadsPredValues[0]!, Asym: dyadsPredValues[1]!, Null: dyadsPredValues[2]! };
  const edges = { Present: 2 * dyads.Mut + dyads.Asym, Absent: 2 * dyads.Null + dyads.Asym };
  const edgesPred = { Present: (2 * dyadsPred.Mut + dyadsPred.Asym) / 2, Absent: (2 * dyadsPred.Null + dyadsPred.Asym) / 2 };
  return {
    type: "bn",
    method,
    d: params.d,
    pi: params.pi,
    sigma: params.sigma,
    rho: params.rho,
    gSquare: 2 * opt.value,
    epsilon,
    triads: observedTriads,
    triadsPred,
    dyads,
    dyadsPred,
    edges,
    edgesPred,
    structureStatistics: structureStatistics(matrix),
    structureStatisticsPred: predictedStructureStatistics(matrix.length, params),
  };
}

export function coefBn(object: BnResult): BnParameters {
  return { d: object.d, pi: object.pi, sigma: object.sigma, rho: object.rho };
}

export function bnDyadStats(dat: GraphInput): BnDyadStat[] {
  const matrix = bnBinaryMatrix(dat, "dat");
  const n = matrix.length;
  const stats = Array.from({ length: Math.max(0, n - 1) }, (_unused, parents) => ({ parents, mutual: 0, asymmetric: 0, nullDyads: 0 }));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let parents = 0;
      for (let k = 0; k < n; k += 1) if (matrix[k]![i]! > 0 && matrix[k]![j]! > 0) parents += 1;
      const row = stats[Math.min(parents, stats.length - 1)]!;
      if (matrix[i]![j]! > 0 && matrix[j]![i]! > 0) row.mutual += 1;
      else if (matrix[i]![j]! > 0 || matrix[j]![i]! > 0) row.asymmetric += 1;
      else row.nullDyads += 1;
    }
  }
  return stats.filter((row) => row.mutual + row.asymmetric + row.nullDyads > 0);
}

export function bnTriadStats(dat: GraphInput): number[][] {
  const matrix = bnBinaryMatrix(dat, "dat");
  const n = matrix.length;
  const stats = createNumberMatrix(n, n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let parents = 0;
      for (let k = 0; k < n; k += 1) if (matrix[k]![i]! > 0 && matrix[k]![j]! > 0) parents += 1;
      stats[i]![j] = parents;
      stats[j]![i] = parents;
    }
  }
  return stats;
}

export function bnNlplDyad(raw: readonly number[], stats: readonly BnDyadStat[], fixed: Partial<BnParameters> = {}): number {
  const { pi, sigma, rho, d } = bnParamsFromRaw(raw, fixed, 1e-12);
  let lpl = 0;
  for (const row of stats) {
    lpl += bnLpkm(row.parents, pi, sigma, rho, d) * row.mutual;
    lpl += bnLpka(row.parents, pi, sigma, rho, d) * row.asymmetric;
    lpl += bnLpkn(row.parents, pi, sigma, rho, d) * row.nullDyads;
  }
  return -lpl;
}

export function bnNlplEdge(raw: readonly number[], stats: readonly BnDyadStat[], fixed: Partial<BnParameters> = {}): number {
  const { pi, sigma, rho, d } = bnParamsFromRaw(raw, fixed, 1e-12);
  let value = 0;
  for (const row of stats) {
    const k = row.parents;
    const pWithReverse = 1 - (1 - pi) * (1 - rho) ** k * (1 - sigma) ** k * (1 - d);
    const pWithoutReverse = 1 - (1 - sigma) ** k * (1 - d);
    value += 2 * row.mutual * safeLog(pWithReverse);
    value += row.asymmetric * safeLog(pWithoutReverse);
    value += row.asymmetric * safeLog(1 - pWithReverse);
    value += 2 * row.nullDyads * safeLog(1 - pWithoutReverse);
  }
  return -value;
}

export function bnNlplTriad(raw: readonly number[], dat: GraphInput, stats?: readonly (readonly number[])[], fixed: Partial<BnParameters> = {}): number {
  const matrix = bnBinaryMatrix(dat, "dat");
  const triadStats = stats ?? bnTriadStats(matrix);
  const n = matrix.length;
  if (triadStats.length !== n || triadStats.some((row) => row.length !== n)) throw new RangeError("stats must be a square parent-count matrix matching dat");
  const { pi, sigma, rho, d } = bnParamsFromRaw(raw, fixed, 1e-12);
  let lpl = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      for (let k = j + 1; k < n; k += 1) {
        lpl += bnTriadLogProbability(
          matrix[i]![j]!,
          matrix[j]![i]!,
          matrix[j]![k]!,
          matrix[k]![j]!,
          matrix[i]![k]!,
          matrix[k]![i]!,
          triadStats[i]![j]!,
          triadStats[j]![k]!,
          triadStats[i]![k]!,
          pi,
          sigma,
          rho,
          d,
        );
      }
    }
  }
  return -lpl;
}

export function bnNltl(raw: readonly number[], stats: readonly number[], fixed: Partial<BnParameters> = {}): number {
  const { pi, sigma, rho, d } = bnParamsFromRaw(raw, fixed, 1e-12);
  const probs = bnPtriad(pi, sigma, rho, d);
  return -stats.reduce((sum, count, index) => sum + count * safeLog(probs[index]!), 0);
}

export function bnPtriad(pi: number, sigma: number, rho: number, d: number): number[] {
  const M0 = d * (pi + (1 - pi) * d);
  const a0 = d * (1 - d) * (1 - pi);
  const N0 = (1 - d) * (1 - d * (1 - pi));
  const M1 = (sigma + (1 - sigma) * d) * (1 - (1 - pi) * (1 - sigma) * (1 - rho) * (1 - d));
  const a1 = (sigma + (1 - sigma) * d) * (1 - pi) * (1 - sigma) * (1 - rho) * (1 - d);
  const N1 = 1 - (sigma + (1 - sigma) * d) * (1 + (1 - pi) * (1 - sigma) * (1 - rho) * (1 - d));
  const Mp1 = sigma * (1 - (1 - sigma) * (1 - rho));
  const ap1 = sigma * (1 - sigma) * (1 - rho);
  const Np1 = 1 - sigma * (1 - (1 - sigma) * (1 - rho) + 2 * (1 - sigma) * (1 - rho));
  const Sr = 1 - (1 - sigma) * (1 - rho);
  return [
    N0 * N0 * N0,
    6 * a0 * N0 * N0,
    3 * M0 * N0 * N0,
    a0 * a0 * (N1 + 2 * N0 * Np1),
    3 * a0 * a0 * N0,
    6 * a0 * a0 * N0,
    6 * M0 * a0 * N0,
    2 * M0 * a0 * (N1 + 2 * N0 * Np1),
    2 * a0 * a0 * (a1 + 2 * a0 * (1 - Sr) + 2 * N0 * ap1),
    2 * a0 * a0 * a0,
    M0 * M0 * (N1 + 2 * N0 * Np1),
    a0 * a0 * (M1 + 2 * M0 + 2 * N0 * Mp1 + 4 * a0 * Sr),
    M0 * a0 * (1 - Sr) * (2 * a1 + a0 * (1 - Sr) + 4 * N0 * ap1),
    2 * M0 * a0 * (a1 + 2 * a0 * (1 - Sr) + 2 * N0 * ap1),
    M0 * (2 * M0 * a1 + 2 * a0 * M1 * (1 - Sr) + 2 * M0 * a0 * (1 - Sr) + 4 * a0 * N0 * ap1 * Sr + 4 * a0 * N0 * Mp1 * (1 - Sr) + 4 * M0 * N0 * ap1 + 2 * a0 * a1 * Sr + 6 * a0 * a0 * Sr * (1 - Sr)),
    M0 * (M0 * M1 + 4 * a0 * N0 * Mp1 * Sr + 2 * M0 * N0 * Mp1 + 5 * a0 * a0 * Sr * Sr + 2 * a0 * M1 * Sr + 2 * M0 * a0 * Sr),
  ].map((value) => Math.max(0, value));
}

export function evalEdgeperturbation(dat: GraphInput, i: number, j: number, fun: (graph: number[][]) => number): number {
  const matrix = asSingleGraph(dat, "dat");
  if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= matrix.length || j >= matrix.length) throw new RangeError("edge indices are outside graph order");
  const present = cloneMatrix(matrix);
  const absent = cloneMatrix(matrix);
  present[i]![j] = 1;
  absent[i]![j] = 0;
  return fun(present) - fun(absent);
}

function brokerageSingle(matrix: number[][], cl: readonly BrokerageClass[]): BrokerageResult {
  const n = matrix.length;
  if (cl.length !== n) throw new RangeError("class membership vector length must match graph order");
  const clid: BrokerageClass[] = [];
  const classIndex = new Map<BrokerageClass, number>();
  for (const label of cl) {
    if (!classIndex.has(label)) {
      classIndex.set(label, clid.length);
      clid.push(label);
    }
  }
  const classIds = cl.map((label) => classIndex.get(label)!);
  const raw = createNumberMatrix(n, 6);

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (j === i || !truthyTie(matrix[i]![j]!)) continue;
      for (let k = 0; k < n; k += 1) {
        if (k === i || k === j || !truthyTie(matrix[j]![k]!) || truthyTie(matrix[i]![k]!)) continue;
        const ci = classIds[i]!;
        const cj = classIds[j]!;
        const ck = classIds[k]!;
        if (cj === ci) incrementCell(raw, j, cj === ck ? 0 : 2);
        else if (cj === ck) incrementCell(raw, j, 3);
        else if (ci === ck) incrementCell(raw, j, 1);
        else incrementCell(raw, j, 4);
      }
    }
  }
  for (let vertex = 0; vertex < n; vertex += 1) raw[vertex]![5] = raw[vertex]!.slice(0, 5).reduce((sum, value) => sum + value, 0);

  const density = n <= 1 ? 0 : raw.flatMap<number>((_row, tail) => matrix[tail]!.map((value, head) => (tail !== head && truthyTie(value) ? 1 : 0))).reduce((sum, value) => sum + value, 0) / (n * (n - 1));
  const counts = clid.map((_label, group) => classIds.filter((value) => value === group).length);
  const moments = brokerageClassMoments(counts, density);
  const expNli = raw.map((_row, vertex) => [...moments.expected[classIds[vertex]!]!]);
  const sdNli = raw.map((_row, vertex) => moments.variance[classIds[vertex]!]!.map((value) => Math.sqrt(value)));
  const zNli = raw.map((row, vertex) => row.map((value, col) => zScore(value, expNli[vertex]![col]!, sdNli[vertex]![col]!)));
  const rawGli = columnSums(raw);
  const globalMoments = brokerageGlobalMoments(counts, density);
  const expGli = globalMoments.expected;
  const sdGli = globalMoments.variance.map((value) => Math.sqrt(value));
  return {
    type: "brokerage",
    rawNli: raw,
    expNli,
    sdNli,
    zNli,
    rawGli,
    expGli,
    sdGli,
    zGli: rawGli.map((value, index) => zScore(value, expGli[index]!, sdGli[index]!)),
    expGrp: moments.expected,
    sdGrp: moments.variance.map((row) => row.map((value) => Math.sqrt(value))),
    cl: [...cl],
    clid,
    n: counts,
    N: n,
    roleNames: ["w_I", "w_O", "b_IO", "b_OI", "b_O", "t"],
  };
}

function brokerageClassMoments(counts: readonly number[], d: number): { expected: number[][]; variance: number[][] } {
  const groups = counts.length;
  const total = counts.reduce((sum, value) => sum + value, 0);
  const expected = createNumberMatrix(groups, 6);
  const variance = createNumberMatrix(groups, 6);
  for (let i = 0; i < groups; i += 1) {
    const ni = counts[i]!;
    const other = counts.filter((_value, index) => index !== i);
    expected[i]![0] = d ** 2 * (1 - d) * (ni - 1) * (ni - 2);
    variance[i]![0] = expected[i]![0]! * (1 - d ** 2 * (1 - d)) + 2 * (ni - 1) * (ni - 2) * (ni - 3) * d ** 3 * (1 - d) ** 3;
    expected[i]![1] = d ** 2 * (1 - d) * other.reduce((sum, n) => sum + n * (n - 1), 0);
    variance[i]![1] = expected[i]![1]! * (1 - d ** 2 * (1 - d)) + 2 * other.reduce((sum, n) => sum + n * (n - 1) * (n - 2), 0) * d ** 3 * (1 - d) ** 3;
    expected[i]![2] = d ** 2 * (1 - d) * (total - ni) * (ni - 1);
    variance[i]![2] = expected[i]![2]! * (1 - d ** 2 * (1 - d)) + 2 * ((ni - 1) * choose(total - ni, 2) + (total - ni) * choose(ni - 1, 2)) * d ** 3 * (1 - d) ** 3;
    expected[i]![3] = expected[i]![2]!;
    variance[i]![3] = variance[i]![2]!;
    expected[i]![4] = d ** 2 * (1 - d) * (outerSum(other, other, (a, b) => a * b) - other.reduce((sum, n) => sum + n * n, 0));
    variance[i]![4] = expected[i]![4]! * (1 - d ** 2 * (1 - d)) + 4 * other.reduce((sum, n) => sum + n * choose(total - n - ni, 2) * d ** 3 * (1 - d) ** 3, 0);
    expected[i]![5] = d ** 2 * (1 - d) * (total - 1) * (total - 2);
    variance[i]![5] = expected[i]![5]! * (1 - d ** 2 * (1 - d)) + 2 * (total - 1) * (total - 2) * (total - 3) * d ** 3 * (1 - d) ** 3;
  }
  return { expected, variance: variance.map((row) => row.map((value) => Math.max(0, value))) };
}

function incrementCell(matrix: number[][], row: number, col: number): void {
  matrix[row]![col] = matrix[row]![col]! + 1;
}

function brokerageGlobalMoments(counts: readonly number[], d: number): { expected: number[]; variance: number[] } {
  const total = counts.reduce((sum, value) => sum + value, 0);
  const expected = Array.from({ length: 6 }, () => 0);
  const variance = Array.from({ length: 6 }, () => 0);
  expected[0] = d ** 2 * (1 - d) * counts.reduce((sum, n) => sum + n * (n - 1) * (n - 2), 0);
  variance[0] =
    expected[0] * (1 - d ** 2 * (1 - d)) +
    counts.reduce((sum, n) => sum + n * (n - 1) * (n - 2) * ((4 * n - 10) * d ** 3 * (1 - d) ** 3 - 4 * (n - 3) * d ** 4 * (1 - d) ** 2 + (n - 3) * d ** 5 * (1 - d)), 0);
  expected[1] = d ** 2 * (1 - d) * counts.reduce((sum, n) => sum + n * (total - n) * (n - 1), 0);
  variance[1] =
    expected[1] * (1 - d ** 2 * (1 - d)) +
    outerSum(counts, counts, (x, y) => x * y * (x - 1) * ((2 * x + 2 * y - 6) * d ** 3 * (1 - d) ** 3 + (total - x - 1) * d ** 5 * (1 - d))) -
    counts.reduce((sum, n) => sum + n * n * (n - 1) * ((4 * n - 6) * d ** 3 * (1 - d) ** 3 + (total - n - 1) * d ** 5 * (1 - d)), 0);
  expected[2] = expected[1];
  variance[2] =
    expected[2] * (1 - d ** 2 * (1 - d)) +
    counts.reduce((sum, n) => sum + n * (total - n) * (n - 1) * ((total - 3) * d ** 3 * (1 - d) ** 3 + (n - 2) * d ** 5 * (1 - d)), 0);
  expected[3] = expected[2];
  variance[3] = variance[2];
  expected[4] = d ** 2 * (1 - d) * (outerSum(counts, counts, (x, y) => x * y * (total - x - y)) - counts.reduce((sum, n) => sum + n * n * (total - 2 * n), 0));
  variance[4] = expected[4] * (1 - d ** 2 * (1 - d));
  for (let i = 0; i < counts.length; i += 1) {
    for (let j = 0; j < counts.length; j += 1) {
      for (let k = 0; k < counts.length; k += 1) {
        if (i === j || j === k || i === k) continue;
        const ni = counts[i]!;
        const nj = counts[j]!;
        const nk = counts[k]!;
        variance[4] +=
          ni *
          nj *
          nk *
          ((4 * (total - nj) - 2 * (ni + nk + 1)) * d ** 3 * (1 - d) ** 3 -
            (4 * (total - nk) - 2 * (ni + nj + 1)) * d ** 4 * (1 - d) ** 2 +
            (total - (ni + nk + 1)) * d ** 5 * (1 - d));
      }
    }
  }
  expected[5] = d ** 2 * (1 - d) * total * (total - 1) * (total - 2);
  variance[5] = expected[5] * (1 - d ** 2 * (1 - d)) + total * (total - 1) * (total - 2) * ((4 * total - 10) * d ** 3 * (1 - d) ** 3 - 4 * (total - 3) * d ** 4 * (1 - d) ** 2 + (total - 3) * d ** 5 * (1 - d));
  return { expected, variance: variance.map((value) => Math.max(0, value)) };
}

function maskConsensusStack(stack: readonly number[][][], mode: GraphMode, diag: boolean): number[][][] {
  return stack.map((matrix) => {
    const out = cloneMatrix(matrix);
    for (let row = 0; row < out.length; row += 1) {
      for (let col = 0; col < out.length; col += 1) {
        if (!diag && row === col) out[row]![col] = Number.NaN;
        if (mode === "graph" && row < col) out[row]![col] = Number.NaN;
      }
    }
    return out;
  });
}

function weightedConsensus(stack: readonly number[][][], weights: readonly number[]): number[][] {
  const n = stack[0]?.length ?? 0;
  const out = createNumberMatrix(n, n, Number.NaN);
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      let value = 0;
      let weight = 0;
      for (let s = 0; s < stack.length; s += 1) {
        const observed = stack[s]![row]![col]!;
        if (Number.isNaN(observed)) continue;
        value += observed * weights[s]!;
        weight += weights[s]!;
      }
      out[row]![col] = weight === 0 ? Number.NaN : value / weight;
    }
  }
  return out;
}

function iterativeConsensus(stack: readonly number[][][], tol: number, maxiter: number, noBias: boolean, romneyBatchelder: boolean): { graph: number[][]; metadata: ConsensusMetadata } {
  if (stack.length === 0) throw new RangeError("insufficient informant information");
  let cong = centralgraph(stack) as number[][];
  let comp = observerCorrectness(stack, cong).map((value) => Math.max(value, 0.5));
  let bias = noBias ? comp.map(() => 0.5) : observerBias(stack, cong);
  const drate = stack.map((matrix) => finiteMean(matrix.flat()));
  let iterations = 1;
  for (; iterations < maxiter; iterations += 1) {
    const next = likelihoodConsensus(stack, comp, bias);
    const oldComp = comp;
    cong = next;
    if (romneyBatchelder) {
      const s1 = finiteMean(cong.flat().filter((value) => !Number.isNaN(value)));
      const s0 = 1 - s1;
      const correct = observerCorrectness(stack, cong);
      comp = correct.map((value, index) => Math.max((value - s1 * bias[index]! - s0 * (1 - bias[index]!)) / Math.max(1e-12, 1 - s1 * bias[index]! - s0 * (1 - bias[index]!)), 0));
      if (!noBias) bias = drate.map((rate, index) => clamp((rate - s1 * comp[index]!) / Math.max(1e-12, 1 - comp[index]!), 0, 1));
    } else {
      comp = observerCorrectness(stack, cong).map((value) => Math.max(value, 0.5));
      if (!noBias) bias = observerBias(stack, cong);
    }
    if (sum(comp.map((value, index) => Math.abs(value - oldComp[index]!))) <= tol) break;
  }
  return { graph: cong, metadata: { competency: comp, bias, iterations } };
}

function likelihoodConsensus(stack: readonly number[][][], comp: readonly number[], bias: readonly number[]): number[][] {
  const n = stack[0]?.length ?? 0;
  const out = createNumberMatrix(n, n);
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      let ll1 = 0;
      let ll0 = 0;
      for (let s = 0; s < stack.length; s += 1) {
        const observed = stack[s]![row]![col]!;
        if (Number.isNaN(observed)) continue;
        const c = clamp(comp[s]!, 1e-12, 1 - 1e-12);
        const b = clamp(bias[s]!, 1e-12, 1 - 1e-12);
        if (truthyTie(observed)) {
          ll1 += Math.log(c + (1 - c) * b);
          ll0 += Math.log((1 - c) * b);
        } else {
          ll1 += Math.log((1 - c) * (1 - b));
          ll0 += Math.log(c + (1 - c) * (1 - b));
        }
      }
      out[row]![col] = ll1 > ll0 ? 1 : 0;
    }
  }
  return out;
}

function observerCorrectness(stack: readonly number[][][], consensusGraph: readonly (readonly number[])[]): number[] {
  return stack.map((matrix) => {
    let count = 0;
    let correct = 0;
    for (let row = 0; row < matrix.length; row += 1) {
      for (let col = 0; col < matrix.length; col += 1) {
        const observed = matrix[row]![col]!;
        const truth = consensusGraph[row]![col]!;
        if (Number.isNaN(observed) || Number.isNaN(truth)) continue;
        count += 1;
        if (truthyTie(observed) === truthyTie(truth)) correct += 1;
      }
    }
    return count === 0 ? Number.NaN : correct / count;
  });
}

function observerBias(stack: readonly number[][][], consensusGraph: readonly (readonly number[])[]): number[] {
  return stack.map((matrix) => {
    let count = 0;
    let biased = 0;
    for (let row = 0; row < matrix.length; row += 1) {
      for (let col = 0; col < matrix.length; col += 1) {
        const observed = matrix[row]![col]!;
        const truth = consensusGraph[row]![col]!;
        if (Number.isNaN(observed) || Number.isNaN(truth) || truthyTie(observed) === truthyTie(truth)) continue;
        count += 1;
        if (truthyTie(observed)) biased += 1;
      }
    }
    return count === 0 ? 0.5 : biased / count;
  });
}

function finalizeConsensus(matrix: number[][], mode: GraphMode, diag: boolean): void {
  if (mode === "graph") {
    for (let row = 0; row < matrix.length; row += 1) {
      for (let col = row + 1; col < matrix.length; col += 1) matrix[row]![col] = matrix[col]![row]!;
    }
  }
  if (!diag) for (let i = 0; i < matrix.length; i += 1) matrix[i]![i] = 0;
}

function attachConsensusMetadata(matrix: number[][], metadata: ConsensusMetadata | undefined): ConsensusResult {
  if (metadata) Object.defineProperty(matrix, "metadata", { value: metadata, enumerable: false });
  return matrix as ConsensusResult;
}

function nacfSingle(matrix: number[][], yInput: readonly number[], options: NacfOptions): number[] {
  if (yInput.length !== matrix.length) throw new RangeError("Network size must match covariate length in nacf");
  const type = options.type ?? "correlation";
  const lagMax = options.lagMax ?? matrix.length - 1;
  if (!Number.isInteger(lagMax) || lagMax < 0) throw new RangeError("lagMax must be a non-negative integer");
  let y = yInput.map(assertFiniteNumber);
  if ((options.demean ?? true) || type === "moran") y = y.map((value) => value - mean(y));
  const vary = sampleVariance(y);
  const out = Array.from({ length: lagMax + 1 }, () => 0);
  out[0] = type === "covariance" ? dot(y, y) / y.length : type === "geary" ? 0 : 1;
  const neighborhoods = lagMax === 0 ? [] : (neighborhood(matrix, lagMax, {
    mode: options.mode ?? "digraph",
    diag: options.diag ?? false,
    thresh: options.thresh ?? 0,
    neighborhoodType: options.neighborhoodType ?? "in",
    partial: options.partialNeighborhood ?? true,
    returnAll: true,
  }) as number[][][]);
  for (let lag = 1; lag <= lagMax; lag += 1) {
    const rel = neighborhoods[lag - 1]!;
    const edgeCount = rel.flat().reduce((sum, value) => sum + value, 0);
    if (edgeCount <= 0) {
      out[lag] = 0;
      continue;
    }
    if (type === "covariance" || type === "correlation") {
      const cov = quadraticForm(y, rel) / edgeCount;
      out[lag] = type === "covariance" ? cov : cov / vary;
    } else if (type === "moran") {
      out[lag] = (y.length / edgeCount) * pairProductSum(y, rel) / dot(y, y);
    } else {
      out[lag] = ((y.length - 1) / (2 * edgeCount)) * gearySum(y, rel) / dot(y.map((value) => value - mean(y)), y.map((value) => value - mean(y)));
    }
  }
  return out;
}

function netcancorRows(stack: readonly number[][][], mode: GraphMode, diag: boolean): number[][] {
  const vectors = stack.map((graph) => gvectorize(graph, { mode, diag, censorAsNa: true }) as number[]);
  const rows: number[][] = [];
  for (let index = 0; index < (vectors[0]?.length ?? 0); index += 1) {
    const row = vectors.map((vector) => vector[index]!);
    if (!row.some(Number.isNaN)) rows.push(row);
  }
  return rows;
}

function netcancorRandomGraph(graph: number[][], nullhyp: NetcancorNull, mode: GraphMode, diag: boolean, rng: RandomSource): number[][] {
  if (nullhyp === "qap") return rmperm(graph, { rng }) as number[][];
  if (nullhyp === "cug") return rgraph(graph.length, { mode, diag, rng }) as number[][];
  if (nullhyp === "cugden") return rgraph(graph.length, { mode, diag, tprob: gden(graph, { mode, diag }), rng }) as number[][];
  return rgraph(graph.length, { mode, diag, replace: false, tielist: graph, rng }) as number[][];
}

function resizeCoefficientMatrix(matrix: readonly (readonly number[])[], rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_unused, row) => Array.from({ length: cols }, (_unused2, col) => matrix[row]?.[col] ?? Number.NaN));
}

function coefficientTailMatrix(distribution: readonly number[][][], observed: readonly (readonly number[])[], tail: "less" | "greater"): number[][] {
  const rows = observed.length;
  const cols = observed[0]?.length ?? 0;
  return Array.from({ length: rows }, (_unused, row) =>
    Array.from({ length: cols }, (_unused2, col) => {
      const value = observed[row]?.[col] ?? Number.NaN;
      let count = 0;
      for (const draw of distribution) {
        const candidate = draw[row]?.[col] ?? Number.NaN;
        if (tail === "less" ? candidate <= value : candidate >= value) count += 1;
      }
      return distribution.length === 0 ? Number.NaN : count / distribution.length;
    }),
  );
}

function regressionData(yInput: GraphInput, xInput: GraphInput | readonly GraphInput[], intercept: boolean, mode: GraphMode, diag: boolean): RegressionData {
  const y = asSingleGraph(yInput, "y");
  const xStack = graphArray(xInput);
  const order = y.length;
  if (!xStack.every((matrix) => matrix.length === order && matrix.every((row) => row.length === order))) throw new RangeError("Homogeneous graph orders required in network regression.");
  const graphs = [y, ...(intercept ? [constantMatrix(order, 1)] : []), ...xStack];
  const vectors = graphs.map((graph) => gvectorize(graph, { mode, diag, censorAsNa: true }) as number[]);
  const response: number[] = [];
  const predictors: number[][] = [];
  for (let index = 0; index < vectors[0]!.length; index += 1) {
    const yValue = vectors[0]![index]!;
    const row = vectors.slice(1).map((vector) => vector[index]!);
    if (Number.isNaN(yValue) || row.some(Number.isNaN)) continue;
    response.push(yValue);
    predictors.push(row);
  }
  const names = [...(intercept ? ["(intercept)"] : []), ...xStack.map((_matrix, index) => `x${index + 1}`)];
  return { graphs, y: response, x: predictors, names, order, predictorCount: predictors[0]?.length ?? 0 };
}

function linearStatistic(graphs: readonly number[][][], mode: GraphMode, diag: boolean, tol: number, testStatistic: NetlmTestStatistic): number[] {
  const data = regressionDataFromGraphs(graphs, mode, diag);
  const fit = fitLinearModel(data.x, data.y, tol);
  return testStatistic === "beta" ? fit.coefficients : fit.tValues;
}

function logisticStatistic(graphs: readonly number[][][], mode: GraphMode, diag: boolean, tol: number, testStatistic: NetlogitTestStatistic, maxit: number | undefined): number[] {
  const data = regressionDataFromGraphs(graphs, mode, diag);
  const fit = fitLogisticModel(data.x, data.y, { tol, maxit });
  return testStatistic === "beta" ? fit.coefficients : fit.zValues;
}

function regressionDataFromGraphs(graphs: readonly number[][][], mode: GraphMode, diag: boolean): { y: number[]; x: number[][] } {
  const vectors = graphs.map((graph) => gvectorize(graph, { mode, diag, censorAsNa: true }) as number[]);
  const y: number[] = [];
  const x: number[][] = [];
  for (let index = 0; index < vectors[0]!.length; index += 1) {
    const yValue = vectors[0]![index]!;
    const row = vectors.slice(1).map((vector) => vector[index]!);
    if (Number.isNaN(yValue) || row.some(Number.isNaN)) continue;
    y.push(yValue);
    x.push(row);
  }
  return { y, x };
}

function regressionTestDistribution<TStat extends string>(
  data: RegressionData,
  nullhyp: NetworkRegressionNull,
  testStatistic: TStat,
  reps: number,
  mode: GraphMode,
  diag: boolean,
  tol: number,
  randomOptions: RandomOptions,
  statistic: (graphs: readonly number[][][], mode: GraphMode, diag: boolean, tol: number, testStatistic: TStat) => number[],
): { distribution: number[][] | null; pLessEqual?: number[]; pGreaterEqual?: number[]; pGreaterEqualAbs?: number[] } {
  if (nullhyp === "classical") return { distribution: null };
  const rng = resolveRandomSource(randomOptions);
  const count = resolveNonnegativeInteger(reps, "reps");
  const observed = statistic(data.graphs, mode, diag, tol, testStatistic);
  const distribution = Array.from({ length: count }, () => Array.from({ length: observed.length }, () => 0));
  if (count === 0) return { distribution, pLessEqual: observed.map(() => Number.NaN), pGreaterEqual: observed.map(() => Number.NaN), pGreaterEqualAbs: observed.map(() => Number.NaN) };

  if (nullhyp === "qapy") {
    for (let rep = 0; rep < count; rep += 1) {
      const graphs = data.graphs.map(cloneMatrix);
      graphs[0] = rmperm(data.graphs[0]!, { rng }) as number[][];
      distribution[rep] = statistic(graphs, mode, diag, tol, testStatistic);
    }
  } else if (nullhyp === "qapx") {
    for (let predictor = 0; predictor < data.predictorCount; predictor += 1) {
      const graphs = data.graphs.map(cloneMatrix);
      for (let rep = 0; rep < count; rep += 1) {
        graphs[predictor + 1] = rmperm(graphs[predictor + 1]!, { rng }) as number[][];
        distribution[rep]![predictor] = statistic(graphs, mode, diag, tol, testStatistic)[predictor]!;
      }
    }
  } else if (nullhyp === "qapallx") {
    for (let rep = 0; rep < count; rep += 1) {
      const graphs = data.graphs.map(cloneMatrix);
      for (let predictor = 0; predictor < data.predictorCount; predictor += 1) graphs[predictor + 1] = rmperm(data.graphs[predictor + 1]!, { rng }) as number[][];
      distribution[rep] = statistic(graphs, mode, diag, tol, testStatistic);
    }
  } else if (nullhyp === "qap" || nullhyp === "qapspp") {
    fillQapsppDistribution(data, distribution, mode, diag, tol, testStatistic, rng, statistic);
  } else {
    fillCugDistribution(data, distribution, nullhyp, mode, diag, tol, testStatistic, rng, statistic);
  }

  return {
    distribution,
    pLessEqual: tailByColumn(distribution, observed, "less"),
    pGreaterEqual: tailByColumn(distribution, observed, "greater"),
    pGreaterEqualAbs: tailByColumn(distribution, observed, "abs"),
  };
}

function fillQapsppDistribution<TStat extends string>(
  data: RegressionData,
  distribution: number[][],
  mode: GraphMode,
  diag: boolean,
  tol: number,
  testStatistic: TStat,
  rng: RandomSource,
  statistic: (graphs: readonly number[][][], mode: GraphMode, diag: boolean, tol: number, testStatistic: TStat) => number[],
): void {
  const predictorVectors = data.graphs.slice(1).map((graph) => gvectorize(graph, { mode, diag, censorAsNa: true }) as number[]);
  const selected = selectedVectorPositions(data.order, mode, diag);
  for (let predictor = 0; predictor < data.predictorCount; predictor += 1) {
    const response: number[] = [];
    const predictors: number[][] = [];
    for (const vectorIndex of selected) {
      const yValue = predictorVectors[predictor]![vectorIndex]!;
      const row = predictorVectors.filter((_value, index) => index !== predictor).map((vector) => vector[vectorIndex]!);
      if (Number.isNaN(yValue) || row.some(Number.isNaN)) continue;
      response.push(yValue);
      predictors.push(row);
    }
    const residuals = fitLinearModel(predictors, response, tol).residuals;
    const residualGraph = vectorToSelectedMatrix(data.graphs[predictor + 1]!, residuals, mode, diag);
    for (let rep = 0; rep < distribution.length; rep += 1) {
      const graphs = [data.graphs[0]!, ...data.graphs.slice(1).filter((_graph, index) => index !== predictor), rmperm(residualGraph, { rng }) as number[][]];
      distribution[rep]![predictor] = statistic(graphs, mode, diag, tol, testStatistic)[data.predictorCount - 1]!;
    }
  }
}

function fillCugDistribution<TStat extends string>(
  data: RegressionData,
  distribution: number[][],
  nullhyp: "cugtie" | "cugden" | "cuguman",
  mode: GraphMode,
  diag: boolean,
  tol: number,
  testStatistic: TStat,
  rng: RandomSource,
  statistic: (graphs: readonly number[][][], mode: GraphMode, diag: boolean, tol: number, testStatistic: TStat) => number[],
): void {
  for (let predictor = 0; predictor < data.predictorCount; predictor += 1) {
    for (let rep = 0; rep < distribution.length; rep += 1) {
      const graphs = data.graphs.map(cloneMatrix);
      const focal = data.graphs[predictor + 1]!;
      if (nullhyp === "cugtie") graphs[predictor + 1] = rgraph(data.order, { mode, diag, replace: false, tielist: focal, rng }) as number[][];
      else if (nullhyp === "cugden") graphs[predictor + 1] = rgraph(data.order, { mode, diag, tprob: gden(focal, { mode, diag }), rng }) as number[][];
      else {
        const census = dyadCensus(focal);
        graphs[predictor + 1] = rguman(data.order, { mut: census.mutual, asym: census.asymmetric, null: census.nullDyads, method: "exact", rng }) as number[][];
      }
      distribution[rep]![predictor] = statistic(graphs, mode, diag, tol, testStatistic)[predictor]!;
    }
  }
}

function fitLinearModel(x: readonly (readonly number[])[], y: readonly number[], tol = 1e-10): LinearFit {
  const n = y.length;
  const p = x[0]?.length ?? 0;
  const xtx = createNumberMatrix(p, p);
  const xty = Array.from({ length: p }, () => 0);
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < p; col += 1) {
      const xrc = x[row]![col]!;
      xty[col] = xty[col]! + xrc * y[row]!;
      for (let other = 0; other < p; other += 1) xtx[col]![other] = xtx[col]![other]! + xrc * x[row]![other]!;
    }
  }
  const covariance = inverseWithRidge(xtx, tol);
  const coefficients = matVec(covariance, xty);
  const fittedValues = x.map((row) => dot(row, coefficients));
  const residuals = y.map((value, index) => value - fittedValues[index]!);
  const rank = p;
  const dfResidual = n - rank;
  const rss = dot(residuals, residuals);
  const sigma2 = dfResidual > 0 ? rss / dfResidual : Number.NaN;
  const standardErrors = diagonal(covariance).map((value) => (value >= 0 && Number.isFinite(sigma2) ? Math.sqrt(value * sigma2) : Number.NaN));
  const tValues = coefficients.map((coef, index) => coef / standardErrors[index]!);
  return { coefficients, fittedValues, residuals, rank, dfResidual, sigma2, covariance, standardErrors, tValues };
}

function fitLogisticModel(x: readonly (readonly number[])[], y: readonly number[], options: { tol?: number | undefined; maxit?: number | undefined } = {}): LogisticFit {
  const n = y.length;
  const p = x[0]?.length ?? 0;
  const tol = options.tol ?? 1e-8;
  const maxit = options.maxit ?? 50;
  let beta = Array.from({ length: p }, () => 0);
  let covariance = identity(p);
  let converged = false;
  let iterations = 0;

  for (iterations = 0; iterations < maxit; iterations += 1) {
    const xtwx = createNumberMatrix(p, p);
    const score = Array.from({ length: p }, () => 0);
    for (let row = 0; row < n; row += 1) {
      const eta = clamp(dot(x[row]!, beta), -35, 35);
      const mu = logistic(eta);
      const w = Math.max(mu * (1 - mu), 1e-12);
      for (let col = 0; col < p; col += 1) {
        const xrc = x[row]![col]!;
        score[col] = score[col]! + xrc * (y[row]! - mu);
        for (let other = 0; other < p; other += 1) xtwx[col]![other] = xtwx[col]![other]! + xrc * w * x[row]![other]!;
      }
    }
    covariance = inverseWithRidge(xtwx, tol);
    const delta = matVec(covariance, score);
    beta = beta.map((value, index) => value + delta[index]!);
    if (Math.max(...delta.map(Math.abs), 0) <= tol) {
      converged = true;
      iterations += 1;
      break;
    }
  }

  const linearPredictors = x.map((row) => clamp(dot(row, beta), -35, 35));
  const fittedValues = linearPredictors.map(logistic);
  const residuals = y.map((value, index) => value - fittedValues[index]!);
  const deviance = binomialDeviance(y, fittedValues);
  // R's netlogit runs glm.fit(x, y, intercept=FALSE) with the intercept as a
  // column of x, so glm.fit's "null" model is the empty model with fitted
  // probability linkinv(0) = 0.5 (null deviance 2n*ln2), not the
  // intercept-only mean model. Match R exactly.
  const nullDeviance = binomialDeviance(y, y.map(() => 0.5));
  const standardErrors = diagonal(covariance).map((value) => (value >= 0 ? Math.sqrt(value) : Number.NaN));
  const zValues = beta.map((coef, index) => coef / standardErrors[index]!);
  const contingencyTable = contingency(fittedValues, y);
  return {
    coefficients: beta,
    fittedValues,
    residuals,
    linearPredictors,
    covariance,
    standardErrors,
    zValues,
    rank: p,
    dfResidual: n - p,
    dfModel: p,
    deviance,
    nullDeviance,
    // glm.fit(intercept=FALSE) leaves all n degrees of freedom in the null.
    dfNull: n,
    aic: deviance + 2 * p,
    bic: deviance + p * Math.log(n),
    contingencyTable,
    converged,
    iterations,
  };
}

function pstarPredictors(
  dat: number[][],
  tail: number,
  head: number,
  effects: readonly PstarEffect[],
  attrs: readonly number[][],
  memberships: readonly unknown[][],
  mode: GraphMode,
  diag: boolean,
): number[] {
  const out: number[] = [];
  const scalar = (fn: (graph: number[][]) => number): number => evalPerturbation(dat, tail, head, fn) as number;
  const vector = (fn: (graph: number[][]) => number[]): number[] => evalPerturbation(dat, tail, head, fn) as number[];
  if (effects.includes("choice")) out.push(1);
  if (effects.includes("mutuality")) out.push(scalar((graph) => mutuality(graph)));
  if (effects.includes("density")) out.push(scalar((graph) => gden(graph, { mode, diag })));
  if (effects.includes("reciprocity")) out.push(scalar((graph) => grecip(graph)));
  if (effects.includes("stransitivity")) out.push(scalar((graph) => gtrans(graph, { mode, diag, measure: "strong" })));
  if (effects.includes("wtransitivity")) out.push(scalar((graph) => gtrans(graph, { mode, diag, measure: "weak" })));
  if (effects.includes("stranstri")) out.push(scalar((graph) => gtrans(graph, { mode, diag, measure: "strongcensus" })));
  if (effects.includes("wtranstri")) out.push(scalar((graph) => gtrans(graph, { mode, diag, measure: "weakcensus" })));
  if (effects.includes("outdegree")) out.push(...vector((graph) => degree(graph, { mode, diag, cmode: "outdegree" })));
  if (effects.includes("indegree")) out.push(...vector((graph) => degree(graph, { mode, diag, cmode: "indegree" })));
  if (effects.includes("betweenness")) out.push(...vector((graph) => betweenness(graph, { mode, diag })));
  if (effects.includes("closeness")) out.push(...vector((graph) => closeness(graph, { mode, diag })));
  if (effects.includes("degcentralization")) out.push(scalar((graph) => centralization(graph, (g) => degree(g, { mode, diag }), degreeCentralizationMax(graph.length))));
  if (effects.includes("betcentralization")) out.push(scalar((graph) => centralization(graph, (g) => betweenness(g, { mode, diag }), betweenness(graph, { mode, diag, tmaxdev: true }))));
  if (effects.includes("clocentralization")) out.push(scalar((graph) => centralization(graph, (g) => closeness(g, { mode, diag }), closeness(graph, { mode, diag, tmaxdev: true }))));
  if (effects.includes("connectedness")) out.push(scalar((graph) => connectedness(graph)));
  if (effects.includes("hierarchy")) out.push(scalar((graph) => hierarchy(graph)));
  if (effects.includes("lubness")) out.push(scalar(lubness));
  if (effects.includes("efficiency")) out.push(scalar((graph) => efficiency(graph, { diag })));
  for (const column of attrs) out.push(Math.abs(column[tail]! - column[head]!));
  for (const column of memberships) out.push(column[tail] === column[head] ? 1 : 0);
  return out.map((value) => (Number.isFinite(value) ? value : 0));
}

function pstarPredictorNames(effects: readonly PstarEffect[], n: number, attrNames: readonly string[], membershipNames: readonly string[]): string[] {
  const names: string[] = [];
  if (effects.includes("choice")) names.push("Choice");
  if (effects.includes("mutuality")) names.push("Mutuality");
  if (effects.includes("density")) names.push("Density");
  if (effects.includes("reciprocity")) names.push("Reciprocity");
  if (effects.includes("stransitivity")) names.push("STransitivity");
  if (effects.includes("wtransitivity")) names.push("WTransitivity");
  if (effects.includes("stranstri")) names.push("STransTriads");
  if (effects.includes("wtranstri")) names.push("WTransTriads");
  if (effects.includes("outdegree")) for (let i = 0; i < n; i += 1) names.push(`Outdegree.${i + 1}`);
  if (effects.includes("indegree")) for (let i = 0; i < n; i += 1) names.push(`Indegree.${i + 1}`);
  if (effects.includes("betweenness")) for (let i = 0; i < n; i += 1) names.push(`Betweenness.${i + 1}`);
  if (effects.includes("closeness")) for (let i = 0; i < n; i += 1) names.push(`Closeness.${i + 1}`);
  if (effects.includes("degcentralization")) names.push("DegCentralization");
  if (effects.includes("betcentralization")) names.push("BetCentralization");
  if (effects.includes("clocentralization")) names.push("CloCentralization");
  if (effects.includes("connectedness")) names.push("Connectedness");
  if (effects.includes("hierarchy")) names.push("Hierarchy");
  if (effects.includes("lubness")) names.push("LUBness");
  if (effects.includes("efficiency")) names.push("Efficiency");
  return [...names, ...attrNames, ...membershipNames];
}

function evalPerturbation(dat: number[][], i: number, j: number, fun: (graph: number[][]) => number | number[]): number | number[] {
  const present = cloneMatrix(dat);
  const absent = cloneMatrix(dat);
  present[i]![j] = 1;
  absent[i]![j] = 0;
  const left = fun(present);
  const right = fun(absent);
  if (Array.isArray(left) && Array.isArray(right)) return left.map((value, index) => value - right[index]!);
  return (left as number) - (right as number);
}

function centralization(graph: number[][], centrality: (graph: number[][]) => number[], theoreticalMaxDeviation: number): number {
  const values = centrality(graph);
  const max = Math.max(...values);
  const observed = values.reduce((sum, value) => sum + max - value, 0);
  return theoreticalMaxDeviation === 0 ? 0 : observed / theoreticalMaxDeviation;
}

function degreeCentralizationMax(order: number): number {
  return order <= 2 ? 0 : (order - 1) * (order - 2);
}

function initialLnamParameters(nx: number, nw1: number, nw2: number, seed?: readonly number[]): { beta: number[]; rho1: number[]; rho2: number[]; sigmasq: number; dev: number } {
  if (!seed) return { beta: Array.from({ length: nx }, () => 0), rho1: Array.from({ length: nw1 }, () => 0), rho2: Array.from({ length: nw2 }, () => 0), sigmasq: 1, dev: Number.POSITIVE_INFINITY };
  return {
    beta: seed.slice(0, nx),
    rho1: seed.slice(nx, nx + nw1),
    rho2: seed.slice(nx + nw1, nx + nw1 + nw2),
    sigmasq: seed[nx + nw1 + nw2] ?? 1,
    dev: Number.POSITIVE_INFINITY,
  };
}

function estimateLnam(
  y: readonly number[],
  x: number[][] | undefined,
  W1: number[][][] | undefined,
  W2: number[][][] | undefined,
  parm: { beta: number[]; rho1: number[]; rho2: number[]; sigmasq: number; dev: number },
  final: boolean,
  optimControl: NelderMeadOptions | undefined,
): { beta: number[]; rho1: number[]; rho2: number[]; sigmasq: number; dev: number } {
  const W1a = W1 ? subtractFromIdentity(aggregateMatrices(W1, parm.rho1)) : undefined;
  const W2a = W2 ? subtractFromIdentity(aggregateMatrices(W2, parm.rho2)) : undefined;
  const beta = x ? lnamBetaHat(y, x, W1a, W2a) : [];
  const sigmasq = Math.max(dot(lnamDisturbanceCore(y, x, W1a, W2a, beta), lnamDisturbanceCore(y, x, W1a, W2a, beta)) / y.length, 1e-12);
  let rho1 = parm.rho1;
  let rho2 = parm.rho2;
  if (!final && rho1.length + rho2.length > 0) {
    const start = [...rho1, ...rho2];
    const opt = nelderMead(
      start,
      (rho) => {
        const candidate: { beta: number[]; rho1: number[]; rho2: number[]; sigmasq: number; dev: number } = {
          beta,
          rho1: rho.slice(0, rho1.length),
          rho2: rho.slice(rho1.length),
          sigmasq,
          dev: 0,
        };
        return lnamDeviance(y, x, W1, W2, candidate);
      },
      optimControl,
    );
    rho1 = opt.point.slice(0, rho1.length);
    rho2 = opt.point.slice(rho1.length);
  }
  const out = { beta, rho1, rho2, sigmasq, dev: 0 };
  return { ...out, dev: lnamDeviance(y, x, W1, W2, out) };
}

function lnamBetaHat(y: readonly number[], x: number[][], W1a: number[][] | undefined, W2a: number[][] | undefined): number[] {
  const leftY = W1a ? matVec(W1a, y) : [...y];
  if (!W2a) return fitLinearModel(x, leftY).coefficients;
  const weightedX = matMul(W2a, x);
  const weightedY = matVec(W2a, leftY);
  return fitLinearModel(weightedX, weightedY).coefficients;
}

function lnamDisturbanceCore(y: readonly number[], x: number[][] | undefined, W1a: number[][] | undefined, W2a: number[][] | undefined, beta: readonly number[]): number[] {
  const leftY = W1a ? matVec(W1a, y) : [...y];
  const xb = x ? matVec(x, beta) : Array.from({ length: y.length }, () => 0);
  const residual = leftY.map((value, index) => value - xb[index]!);
  return W2a ? matVec(W2a, residual) : residual;
}

function lnamDeviance(
  y: readonly number[],
  x: number[][] | undefined,
  W1: number[][][] | undefined,
  W2: number[][][] | undefined,
  parm: { beta: readonly number[]; rho1: readonly number[]; rho2: readonly number[]; sigmasq: number },
): number {
  const n = y.length;
  const W1a = W1 ? subtractFromIdentity(aggregateMatrices(W1, parm.rho1)) : undefined;
  const W2a = W2 ? subtractFromIdentity(aggregateMatrices(W2, parm.rho2)) : undefined;
  const disturbances = lnamDisturbanceCore(y, x, W1a, W2a, parm.beta);
  const sigmasq = Math.max(parm.sigmasq, 1e-12);
  const logDet = (W1a ? Math.log(Math.abs(determinant(W1a))) : 0) + (W2a ? Math.log(Math.abs(determinant(W2a))) : 0);
  if (!Number.isFinite(logDet)) return Number.POSITIVE_INFINITY;
  return n * (Math.log(2 * Math.PI) + Math.log(sigmasq)) + dot(disturbances, disturbances) / sigmasq - 2 * logDet;
}

function lnamNegativeLogLikelihood(y: readonly number[], x: number[][] | undefined, W1: number[][][] | undefined, W2: number[][][] | undefined, par: readonly number[]): number {
  const nx = x?.[0]?.length ?? 0;
  const nw1 = W1?.length ?? 0;
  const nw2 = W2?.length ?? 0;
  const beta = par.slice(0, nx);
  const rho1 = par.slice(nx, nx + nw1);
  const rho2 = par.slice(nx + nw1, nx + nw1 + nw2);
  const sigmasq = par[nx + nw1 + nw2] ?? 1;
  return lnamDeviance(y, x, W1, W2, { beta, rho1, rho2, sigmasq }) / 2;
}

function lnamFittedValues(y: readonly number[], x: number[][] | undefined, W1ag: number[][] | undefined, W2ag: number[][] | undefined, beta: readonly number[], model: string): number[] {
  const xb = x ? matVec(x, beta) : Array.from({ length: y.length }, () => 0);
  if (model === "11" || model === "111") return solveLinearSystem(subtractFromIdentity(W1ag!), xb);
  if (model === "1" || model === "101") return xb;
  return Array.from({ length: y.length }, () => 0);
}

function lnamDisturbances(y: readonly number[], x: number[][] | undefined, W1ag: number[][] | undefined, W2ag: number[][] | undefined, beta: readonly number[], model: string): number[] {
  const W1a = W1ag ? subtractFromIdentity(W1ag) : undefined;
  const W2a = W2ag ? subtractFromIdentity(W2ag) : undefined;
  switch (model) {
    case "1":
      return lnamDisturbanceCore(y, x, undefined, undefined, beta);
    case "10":
      return matVec(W1a!, y);
    case "100":
      return matVec(W2a!, y);
    case "11":
      return lnamDisturbanceCore(y, x, W1a, undefined, beta);
    case "101":
      return lnamDisturbanceCore(y, x, undefined, W2a, beta);
    case "110":
      return matVec(W2a!, matVec(W1a!, y));
    default:
      return lnamDisturbanceCore(y, x, W1a, W2a, beta);
  }
}

function lnamNull(y: readonly number[], nullModel: LnamNullModel): { logLikelihood: number; dfResidual: number; df: number; parameters: number[] | null } {
  const mean = y.reduce((sum, value) => sum + value, 0) / y.length;
  const sd = sampleSd(y);
  switch (nullModel) {
    case "meanstd":
      return { logLikelihood: y.reduce((sum, value) => sum + logNormalDensity(value - mean, 0, sd), 0), dfResidual: y.length - 2, df: 2, parameters: [mean, sd] };
    case "mean":
      return { logLikelihood: y.reduce((sum, value) => sum + logNormalDensity(value - mean, 0, 1), 0), dfResidual: y.length - 1, df: 1, parameters: [mean] };
    case "std":
      return { logLikelihood: y.reduce((sum, value) => sum + logNormalDensity(value, 0, sd), 0), dfResidual: y.length - 1, df: 1, parameters: [sd] };
    case "none":
      return { logLikelihood: y.reduce((sum, value) => sum + logNormalDensity(value, 0, 1), 0), dfResidual: y.length, df: 0, parameters: null };
  }
}

function bbnamPosterior(dat: readonly number[][][], nprior: readonly (readonly number[])[], em: readonly number[][][], ep: readonly number[][][]): number[][] {
  const m = dat.length;
  const n = nprior.length;
  const out = createNumberMatrix(n, n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let pygt = 1;
      let pygnt = 1;
      for (let observer = 0; observer < m; observer += 1) {
        const observed = dat[observer]![i]![j]!;
        if (Number.isNaN(observed)) continue;
        pygt *= observed > 0 ? 1 - em[observer]![i]![j]! : em[observer]![i]![j]!;
        pygnt *= observed > 0 ? ep[observer]![i]![j]! : 1 - ep[observer]![i]![j]!;
      }
      const prior = nprior[i]![j]!;
      const numerator = prior * pygt;
      const denominator = numerator + (1 - prior) * pygnt;
      out[i]![j] = denominator === 0 ? prior : numerator / denominator;
    }
  }
  return out;
}

function bbnamErrorCounts(dat: readonly number[][][], criterion: readonly (readonly number[])[]): { falseNegative: number; truePositive: number; falsePositive: number; trueNegative: number } {
  let falseNegative = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  for (const slice of dat) {
    for (let i = 0; i < criterion.length; i += 1) {
      for (let j = 0; j < criterion.length; j += 1) {
        const observed = slice[i]![j]!;
        if (Number.isNaN(observed)) continue;
        const tie = criterion[i]![j]! > 0;
        if (tie && observed <= 0) falseNegative += 1;
        else if (tie && observed > 0) truePositive += 1;
        else if (!tie && observed > 0) falsePositive += 1;
        else trueNegative += 1;
      }
    }
  }
  return { falseNegative, truePositive, falsePositive, trueNegative };
}

function expandErrorProbability(value: ErrorProbabilityInput, m: number, n: number, label: string): number[][][] {
  if (typeof value === "number") {
    assertProbability(value, label);
    return scalarError(m, n, value);
  }
  if (!Array.isArray(value) || value.length === 0) throw new RangeError(`${label} must not be empty`);
  if (is3dNumberArray(value)) {
    if (value.length !== m || value.some((matrix) => matrix.length !== n || matrix.some((row) => row.length !== n))) throw new RangeError(`${label} observation array dimensions must match data`);
    return value.map((matrix) => matrix.map((row) => row.map((cell) => checkedProbability(cell, label))));
  }
  if (is2dNumberArray(value)) {
    if (value.length !== n || value.some((row) => row.length !== n)) throw new RangeError(`${label} matrix dimensions must match graph order`);
    const matrix = (value as readonly (readonly number[])[]).map((row) => row.map((cell) => checkedProbability(cell, label)));
    return Array.from({ length: m }, () => cloneMatrix(matrix));
  }
  const vector = value as readonly number[];
  if (vector.length === m) return observerError(m, n, vector.map((cell) => checkedProbability(cell, label)));
  if (vector.length === n * n) {
    const matrix = createNumberMatrix(n, n);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) matrix[i]![j] = checkedProbability(vector[i * n + j]!, label);
    return Array.from({ length: m }, () => cloneMatrix(matrix));
  }
  throw new RangeError(`${label} must be scalar, observer-length, n by n, or observer by n by n`);
}

function scalarError(m: number, n: number, value: number): number[][][] {
  return Array.from({ length: m }, () => Array.from({ length: n }, () => Array.from({ length: n }, () => value)));
}

function observerError(m: number, n: number, values: readonly number[]): number[][][] {
  return Array.from({ length: m }, (_unused, observer) => Array.from({ length: n }, () => Array.from({ length: n }, () => values[observer]!)));
}

function maskBbnamStack(stack: readonly number[][][], mode: GraphMode, diag: boolean): number[][][] {
  return stack.map((matrix) => maskPstarMatrix(matrix, mode, diag));
}

function maskPstarMatrix(matrix: readonly (readonly number[])[], mode: GraphMode, diag: boolean): number[][] {
  const out = matrix.map((row) => [...row]);
  for (let i = 0; i < out.length; i += 1) {
    if (!diag) out[i]![i] = Number.NaN;
    if (mode === "graph") for (let j = i + 1; j < out.length; j += 1) out[i]![j] = Number.NaN;
  }
  return out;
}

function normalizeBetaPair(value: BetaPriorInput, label: string): [number, number] {
  if (!Array.isArray(value) || value.length < 2 || Array.isArray(value[0])) throw new RangeError(`${label} must be an alpha/beta pair`);
  return [assertPositive(value[0] as number, `${label}[0]`), assertPositive(value[1] as number, `${label}[1]`)];
}

function normalizeBetaPriorRows(value: BetaPriorInput, rows: number, label: string): number[][] {
  if (!Array.isArray(value) || value.length === 0) throw new RangeError(`${label} must not be empty`);
  if (!Array.isArray(value[0])) {
    const pair = normalizeBetaPair(value, label);
    return Array.from({ length: rows }, () => [...pair]);
  }
  const matrix = value as readonly (readonly number[])[];
  if (matrix.length !== rows || matrix.some((row) => row.length !== 2)) throw new RangeError(`${label} must have one alpha/beta pair per observer`);
  return matrix.map((row, index) => [assertPositive(row[0]!, `${label}[${index},0]`), assertPositive(row[1]!, `${label}[${index},1]`)]);
}

function drawGraphFromProbability(probability: readonly (readonly number[])[], mode: GraphMode, diag: boolean, rng: RandomSource): number[][] {
  const n = probability.length;
  const out = createNumberMatrix(n, n);
  if (mode === "graph") {
    for (let i = 0; i < n; i += 1) {
      for (let j = diag ? i : i + 1; j < n; j += 1) {
        if (i === j && !diag) continue;
        const value = rng() < probability[i]![j]! ? 1 : 0;
        out[i]![j] = value;
        out[j]![i] = value;
      }
    }
    return out;
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (!diag && i === j) continue;
      out[i]![j] = rng() < probability[i]![j]! ? 1 : 0;
    }
  }
  return out;
}

function checkedObservationStack(stack: readonly number[][][]): number {
  if (stack.length === 0) throw new RangeError("dat must contain at least one observation graph");
  const n = stack[0]!.length;
  if (!stack.every((matrix) => matrix.length === n && matrix.every((row) => row.length === n))) throw new RangeError("all observation graphs must have the same square order");
  return n;
}

function potentialScaleReduction(chains: readonly (readonly number[])[]): number {
  const J = chains.length;
  const n = chains[0]?.length ?? 0;
  if (J <= 1 || n <= 1 || !chains.every((chain) => chain.length === n)) return Number.NaN;
  const means = chains.map(mean);
  const grand = mean(means);
  const B = (n / (J - 1)) * means.reduce((sum, value) => sum + (value - grand) ** 2, 0);
  const W = mean(chains.map(sampleVariance));
  if (W === 0) return Number.NaN;
  return Math.sqrt(((n - 1) / n * W + B / n) / W);
}

function bbnamNetRhat(chains: readonly number[][][][], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) out.push(potentialScaleReduction(chains.map((chain) => chain.map((draw) => draw[i]![j]!))));
  }
  return out;
}

function betaRandom(alpha: number, beta: number, rng: RandomSource): number {
  const x = gammaRandom(alpha, rng);
  const y = gammaRandom(beta, rng);
  return x / (x + y);
}

function gammaRandom(shape: number, rng: RandomSource): number {
  if (shape <= 0) throw new RangeError("gamma shape must be positive");
  if (shape < 1) return gammaRandom(shape + 1, rng) * rng() ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x = 0;
    let v = 0;
    do {
      x = normalRandom(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v ** 3;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normalRandom(rng: RandomSource): number {
  const u1 = Math.max(rng(), Number.MIN_VALUE);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function bnParamsFromRaw(raw: readonly number[], fixed: Partial<BnParameters>, epsilon: number): BnParameters {
  return {
    pi: fixed.pi ?? clampProbability(logistic(raw[0] ?? 0), epsilon),
    sigma: fixed.sigma ?? clampProbability(logistic(raw[1] ?? 0), epsilon),
    rho: fixed.rho ?? clampProbability(logistic(raw[2] ?? 0), epsilon),
    d: fixed.d ?? clampProbability(logistic(raw[3] ?? 0), epsilon),
  };
}

function fixedValue(index: number, fixed: Partial<BnParameters>): number | undefined {
  return [fixed.pi, fixed.sigma, fixed.rho, fixed.d][index];
}

function bnLpkm(k: number, pi: number, sigma: number, rho: number, d: number): number {
  const lnbsib = k * safeLog(1 - sigma);
  const lnbpar = safeLog(1 - pi);
  const lnbdblr = k * safeLog(1 - rho);
  const lne = safeLog(1 - d);
  return safeLog(1 - Math.exp(lnbsib + lne)) + safeLog(1 - Math.exp(lnbpar + lnbsib + lnbdblr + lne));
}

function bnLpka(k: number, pi: number, sigma: number, rho: number, d: number): number {
  const lnbsib = k * safeLog(1 - sigma);
  const lnbpar = safeLog(1 - pi);
  const lnbdblr = k * safeLog(1 - rho);
  const lne = safeLog(1 - d);
  return safeLog(1 - Math.exp(lnbsib + lne)) + lnbpar + lnbsib + lnbdblr + lne;
}

function bnLpkn(k: number, pi: number, sigma: number, rho: number, d: number): number {
  const lnbsib = k * safeLog(1 - sigma);
  const lnbpar = safeLog(1 - pi);
  const lnbdblr = k * safeLog(1 - rho);
  const lne = safeLog(1 - d);
  const p1 = 1 - Math.exp(lnbsib + lne);
  const p2 = 1 + Math.exp(lnbpar + lnbsib + lnbdblr + lne);
  return safeLog(1 - p1 * p2);
}

function triadCountsRecord(matrix: number[][]): Record<string, number> {
  const census = triadCensus(matrix, { mode: "digraph" }) as Record<string, number>;
  return recordFromNames(TRIAD_NAMES, TRIAD_NAMES.map((name) => census[name] ?? 0));
}

function triadCountsVector(matrix: number[][]): number[] {
  const record = triadCountsRecord(matrix);
  return TRIAD_NAMES.map((name) => record[name] ?? 0);
}

function predictedDyadsFromTriads(triads: readonly number[]): [number, number, number] {
  const mutWeights = [0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 2, 1, 1, 1, 2, 3];
  const asymWeights = [0, 1, 0, 2, 2, 2, 1, 1, 3, 3, 0, 2, 2, 2, 1, 0];
  const nullWeights = [3, 2, 2, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0];
  return [
    triads.reduce((sum, value, index) => sum + value * mutWeights[index]!, 0) / 3,
    triads.reduce((sum, value, index) => sum + value * asymWeights[index]!, 0) / 3,
    triads.reduce((sum, value, index) => sum + value * nullWeights[index]!, 0) / 3,
  ];
}

function predictedStructureStatistics(n: number, params: BnParameters): number[] {
  if (n <= 0) return [];
  const a = params.d * (n - 1);
  const out = [1 / n];
  if (n > 1) out.push((1 - 1 / n) * (1 - Math.exp(-a / n)));
  for (let i = 2; i < n; i += 1) {
    const used = out.slice(0, i).reduce((sum, value) => sum + value, 0);
    out.push((1 - used) * (1 - Math.exp(-(a - params.pi - params.sigma * (a - 1)) * out[i - 1]!)));
  }
  let cumulative = 0;
  return out.map((value) => {
    cumulative += value;
    return cumulative;
  });
}

function nelderMead(start: readonly number[], objective: (point: readonly number[]) => number, options: NelderMeadOptions = {}): { point: number[]; value: number } {
  const n = start.length;
  if (n === 0) return { point: [], value: objective([]) };
  const maxIterations = options.maxIterations ?? 1000;
  const tolerance = options.tolerance ?? 1e-8;
  const step = options.initialStep ?? 0.2;
  let simplex = [start.map(Number), ...start.map((value, index) => start.map((inner, j) => (j === index ? value + step : inner)))];
  let values = simplex.map((point) => finiteObjective(objective, point));
  for (let iter = 0; iter < maxIterations; iter += 1) {
    const order = values.map((value, index) => ({ value, point: simplex[index]! })).sort((a, b) => a.value - b.value);
    simplex = order.map((entry) => entry.point);
    values = order.map((entry) => entry.value);
    if (Math.max(...values.map((value) => Math.abs(value - values[0]!))) <= tolerance) break;
    const centroid = Array.from({ length: n }, (_unused, dim) => simplex.slice(0, n).reduce((sum, point) => sum + point[dim]!, 0) / n);
    const worst = simplex[n]!;
    const reflected = centroid.map((value, dim) => value + (value - worst[dim]!));
    const reflectedValue = finiteObjective(objective, reflected);
    if (reflectedValue < values[0]!) {
      const expanded = centroid.map((value, dim) => value + 2 * (reflected[dim]! - value));
      const expandedValue = finiteObjective(objective, expanded);
      simplex[n] = expandedValue < reflectedValue ? expanded : reflected;
      values[n] = Math.min(expandedValue, reflectedValue);
    } else if (reflectedValue < values[n - 1]!) {
      simplex[n] = reflected;
      values[n] = reflectedValue;
    } else {
      const contracted = centroid.map((value, dim) => value + 0.5 * (worst[dim]! - value));
      const contractedValue = finiteObjective(objective, contracted);
      if (contractedValue < values[n]!) {
        simplex[n] = contracted;
        values[n] = contractedValue;
      } else {
        simplex = simplex.map((point, index) => (index === 0 ? point : point.map((value, dim) => simplex[0]![dim]! + 0.5 * (value - simplex[0]![dim]!))));
        values = simplex.map((point) => finiteObjective(objective, point));
      }
    }
  }
  const best = values.reduce((bestIndex, value, index) => (value < values[bestIndex]! ? index : bestIndex), 0);
  return { point: simplex[best]!, value: values[best]! };
}

function finiteObjective(objective: (point: readonly number[]) => number, point: readonly number[]): number {
  const value = objective(point);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function graphArray(input: GraphInput | readonly GraphInput[]): number[][][] {
  const converted = asSociomatrixSna(input);
  if (is3dNumberArray(converted)) return converted.map(cloneMatrix);
  return [checkedSquareMatrix(converted as number[][], undefined, "graph")];
}

function asSingleGraph(input: GraphInput, label: string): number[][] {
  const converted = asSociomatrixSna(input);
  if (is3dNumberArray(converted)) {
    if (converted.length !== 1) throw new RangeError(`${label} must be a single graph`);
    return checkedSquareMatrix(converted[0]!, undefined, label);
  }
  return checkedSquareMatrix(converted as number[][], undefined, label);
}

function bnBinaryMatrix(input: GraphInput, label: string): number[][] {
  return asSingleGraph(input, label).map((row, rowIndex) => row.map((value, colIndex) => (rowIndex !== colIndex && value > 0 ? 1 : 0)));
}

function checkedSquareMatrix(matrix: number[][], order: number | undefined, label: string): number[][] {
  const n = matrix.length;
  if ((order !== undefined && n !== order) || matrix.some((row) => row.length !== n)) throw new RangeError(`${label} must be a square matrix${order === undefined ? "" : " matching response length"}`);
  return matrix.map((row) => row.map((value) => (Number.isNaN(value) ? Number.NaN : Number.isFinite(value) ? value : 0)));
}

function normalizeDesignMatrix(input: readonly number[] | readonly (readonly number[])[], n: number, label: string): number[][] {
  if (input.length !== n) throw new RangeError(`Number of observations in ${label} must match length of y.`);
  if (input.length === 0) return [];
  const first = input[0] as unknown;
  if (Array.isArray(first)) {
    const matrix = input as readonly (readonly number[])[];
    const cols = matrix[0]?.length ?? 0;
    if (!matrix.every((row) => row.length === cols)) throw new RangeError(`${label} must be rectangular`);
    return matrix.map((row) => row.map(assertFiniteNumber));
  }
  return (input as readonly number[]).map((value) => [assertFiniteNumber(value)]);
}

function normalizeNumericColumns(input: PstarOptions["attr"], n: number, label: string): { columns: number[][]; names: string[] } {
  if (!input) return { columns: [], names: [] };
  const matrix = normalizeColumns(input as readonly number[] | readonly (readonly number[])[], n, label, assertFiniteNumber);
  return { columns: matrix, names: matrix.map((_column, index) => `Attribute.${index + 1}`) };
}

function normalizeMembershipColumns(input: PstarOptions["memb"], n: number, label: string): { columns: unknown[][]; names: string[] } {
  if (!input) return { columns: [], names: [] };
  const matrix = normalizeColumns(input as readonly unknown[] | readonly (readonly unknown[])[], n, label, (value) => value);
  return { columns: matrix, names: matrix.map((_column, index) => `Membership.${index + 1}`) };
}

function normalizeColumns<T>(input: readonly T[] | readonly (readonly T[])[], n: number, label: string, normalize: (value: T) => T): T[][] {
  if (input.length !== n) throw new RangeError(`${label} must have one row per vertex`);
  const first = input[0] as unknown;
  if (Array.isArray(first)) {
    const rows = input as readonly (readonly T[])[];
    const cols = rows[0]?.length ?? 0;
    if (!rows.every((row) => row.length === cols)) throw new RangeError(`${label} must be rectangular`);
    return Array.from({ length: cols }, (_unused, col) => rows.map((row) => normalize(row[col]!)));
  }
  return [[...(input as readonly T[]).map(normalize)]];
}

function selectedVectorPositions(order: number, mode: GraphMode, diag: boolean): number[] {
  const out: number[] = [];
  for (let col = 0; col < order; col += 1) {
    for (let row = 0; row < order; row += 1) {
      const include = mode === "graph" ? row > col || (diag && row === col) : diag || row !== col;
      if (include) out.push(col * order + row);
    }
  }
  return out;
}

function vectorToSelectedMatrix(base: number[][], values: readonly number[], mode: GraphMode, diag: boolean): number[][] {
  const out = cloneMatrix(base);
  let index = 0;
  for (let col = 0; col < out.length; col += 1) {
    for (let row = 0; row < out.length; row += 1) {
      const include = mode === "graph" ? row > col || (diag && row === col) : diag || row !== col;
      if (include) {
        out[row]![col] = values[index] ?? 0;
        index += 1;
      }
    }
  }
  if (mode === "graph") {
    for (let row = 0; row < out.length; row += 1) for (let col = row + 1; col < out.length; col += 1) out[row]![col] = out[col]![row]!;
  }
  return out;
}

function tailByColumn(distribution: readonly (readonly number[])[], observed: readonly number[], tail: "less" | "greater" | "abs"): number[] {
  return observed.map((value, col) => {
    let count = 0;
    for (const row of distribution) {
      const candidate = row[col]!;
      if (tail === "less" ? candidate <= value : tail === "greater" ? candidate >= value : Math.abs(candidate) >= Math.abs(value)) count += 1;
    }
    return distribution.length === 0 ? Number.NaN : count / distribution.length;
  });
}

function binomialDeviance(y: readonly number[], mu: readonly number[]): number {
  let value = 0;
  for (let i = 0; i < y.length; i += 1) {
    const yi = y[i]!;
    const mui = clamp(mu[i]!, 1e-12, 1 - 1e-12);
    value += yi === 1 ? -2 * Math.log(mui) : yi === 0 ? -2 * Math.log(1 - mui) : 2 * (yi * Math.log(yi / mui) + (1 - yi) * Math.log((1 - yi) / (1 - mui)));
  }
  return value;
}

function contingency(fitted: readonly number[], y: readonly number[]): readonly [readonly [number, number], readonly [number, number]] {
  const table: [[number, number], [number, number]] = [
    [0, 0],
    [0, 0],
  ];
  for (let i = 0; i < fitted.length; i += 1) {
    const pred = fitted[i]! >= 0.5 ? 1 : 0;
    const actual = y[i]! >= 0.5 ? 1 : 0;
    table[pred]![actual] += 1;
  }
  return table;
}

function expandProbabilityMatrix(value: number | readonly (readonly number[])[], order: number, label: string): number[][] {
  if (typeof value === "number") {
    assertProbability(value, label);
    return Array.from({ length: order }, () => Array.from({ length: order }, () => value));
  }
  if (value.length !== order || value.some((row) => row.length !== order)) throw new RangeError(`${label} matrix dimensions must match graph order`);
  return value.map((row) => row.map((cell) => checkedProbability(cell, label)));
}

function is2dNumberArray(value: unknown): value is readonly (readonly number[])[] {
  return Array.isArray(value) && value.length > 0 && Array.isArray(value[0]) && !Array.isArray((value[0] as unknown[])[0]);
}

function is3dNumberArray(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.length > 0 && Array.isArray(value[0]) && Array.isArray((value[0] as unknown[])[0]);
}

function constantMatrix(order: number, value: number): number[][] {
  return Array.from({ length: order }, () => Array.from({ length: order }, () => value));
}

function cloneMatrix<T extends readonly (readonly number[])[]>(matrix: T): number[][] {
  return matrix.map((row) => [...row]);
}

function identity(order: number): number[][] {
  const out = createNumberMatrix(order, order);
  for (let i = 0; i < order; i += 1) out[i]![i] = 1;
  return out;
}

function inverseWithRidge(matrix: readonly (readonly number[])[], tol: number): number[][] {
  let ridge = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const adjusted = matrix.map((row, i) => row.map((value, j) => value + (i === j ? ridge : 0)));
    const inv = safeInverse(adjusted, tol);
    if (inv) return inv;
    ridge = ridge === 0 ? tol || 1e-10 : ridge * 10;
  }
  return createNaNMatrix(matrix.length, matrix.length);
}

function safeInverse(matrix: readonly (readonly number[])[], tol: number): number[][] | null {
  const n = matrix.length;
  const aug = matrix.map((row, i) => [...row, ...identity(n)[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(aug[row]![col]!) > Math.abs(aug[pivot]![col]!)) pivot = row;
    if (Math.abs(aug[pivot]![col]!) <= tol) return null;
    [aug[col], aug[pivot]] = [aug[pivot]!, aug[col]!];
    const pivotRow = aug[col]!;
    const scale = pivotRow[col]!;
    for (let j = 0; j < 2 * n; j += 1) pivotRow[j] = pivotRow[j]! / scale;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = aug[row]![col]!;
      const targetRow = aug[row]!;
      for (let j = 0; j < 2 * n; j += 1) targetRow[j] = targetRow[j]! - factor * pivotRow[j]!;
    }
  }
  return aug.map((row) => row.slice(n));
}

function solveLinearSystem(matrix: readonly (readonly number[])[], rhs: readonly number[]): number[] {
  const inv = inverseWithRidge(matrix, 1e-10);
  return matVec(inv, rhs);
}

function determinant(matrix: readonly (readonly number[])[]): number {
  const n = matrix.length;
  const a = matrix.map((row) => [...row]);
  let det = 1;
  let sign = 1;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    if (Math.abs(a[pivot]![col]!) < 1e-12) return 0;
    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot]!, a[col]!];
      sign *= -1;
    }
    const pivotValue = a[col]![col]!;
    det *= pivotValue;
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row]![col]! / pivotValue;
      const targetRow = a[row]!;
      const pivotRow = a[col]!;
      for (let j = col; j < n; j += 1) targetRow[j] = targetRow[j]! - factor * pivotRow[j]!;
    }
  }
  return det * sign;
}

function matVec(matrix: readonly (readonly number[])[], vector: readonly number[]): number[] {
  return matrix.map((row) => dot(row, vector));
}

function matMul(left: readonly (readonly number[])[], right: readonly (readonly number[])[]): number[][] {
  const rows = left.length;
  const cols = right[0]?.length ?? 0;
  const inner = right.length;
  const out = createNumberMatrix(rows, cols);
  for (let i = 0; i < rows; i += 1) {
    for (let k = 0; k < inner; k += 1) {
      const lik = left[i]![k]!;
      for (let j = 0; j < cols; j += 1) out[i]![j] = out[i]![j]! + lik * right[k]![j]!;
    }
  }
  return out;
}

function aggregateMatrices(matrices: readonly number[][][], weights: readonly number[]): number[][] {
  const n = matrices[0]?.length ?? 0;
  const out = createNumberMatrix(n, n);
  for (let k = 0; k < matrices.length; k += 1) {
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) out[i]![j] = out[i]![j]! + (weights[k] ?? 0) * matrices[k]![i]![j]!;
  }
  return out;
}

function subtractFromIdentity(matrix: readonly (readonly number[])[]): number[][] {
  const out = matrix.map((row, i) => row.map((value, j) => (i === j ? 1 : 0) - value));
  return out;
}

function finiteDifferenceHessian(fn: (x: readonly number[]) => number, point: readonly number[]): number[][] {
  const n = point.length;
  const hessian = createNumberMatrix(n, n);
  const steps = point.map((value) => Math.max(1e-4, Math.abs(value) * 1e-4));
  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      const hi = steps[i]!;
      const hj = steps[j]!;
      const fpp = fn(point.map((value, index) => value + (index === i ? hi : 0) + (index === j ? hj : 0)));
      const fpm = fn(point.map((value, index) => value + (index === i ? hi : 0) - (index === j ? hj : 0)));
      const fmp = fn(point.map((value, index) => value - (index === i ? hi : 0) + (index === j ? hj : 0)));
      const fmm = fn(point.map((value, index) => value - (index === i ? hi : 0) - (index === j ? hj : 0)));
      const value = (fpp - fpm - fmp + fmm) / (4 * hi * hj);
      hessian[i]![j] = value;
      hessian[j]![i] = value;
    }
  }
  return hessian;
}

function createNaNMatrix(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => Number.NaN));
}

function diagonal(matrix: readonly (readonly number[])[]): number[] {
  return matrix.map((row, index) => row[index] ?? Number.NaN);
}

function dot(left: readonly number[], right: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) sum += left[i]! * right[i]!;
  return sum;
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finiteMean(values: readonly number[]): number {
  const finite = values.filter((value) => !Number.isNaN(value));
  return finite.length === 0 ? Number.NaN : mean(finite);
}

function truthyTie(value: number): boolean {
  return !Number.isNaN(value) && value !== 0;
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let out = 1;
  for (let i = 1; i <= k; i += 1) out = (out * (n - k + i)) / i;
  return out;
}

function outerSum(left: readonly number[], right: readonly number[], fn: (left: number, right: number) => number): number {
  let out = 0;
  for (const a of left) for (const b of right) out += fn(a, b);
  return out;
}

function columnSums(matrix: readonly (readonly number[])[]): number[] {
  const cols = matrix[0]?.length ?? 0;
  return Array.from({ length: cols }, (_unused, col) => matrix.reduce((acc, row) => acc + row[col]!, 0));
}

function zScore(value: number, expected: number, sd: number): number {
  return sd === 0 ? Number.NaN : (value - expected) / sd;
}

function quadraticForm(vector: readonly number[], matrix: readonly (readonly number[])[]): number {
  let out = 0;
  for (let i = 0; i < vector.length; i += 1) for (let j = 0; j < vector.length; j += 1) out += vector[i]! * matrix[i]![j]! * vector[j]!;
  return out;
}

function pairProductSum(vector: readonly number[], matrix: readonly (readonly number[])[]): number {
  let out = 0;
  for (let i = 0; i < vector.length; i += 1) for (let j = 0; j < vector.length; j += 1) out += vector[i]! * vector[j]! * matrix[i]![j]!;
  return out;
}

function gearySum(vector: readonly number[], matrix: readonly (readonly number[])[]): number {
  let out = 0;
  for (let i = 0; i < vector.length; i += 1) for (let j = 0; j < vector.length; j += 1) out += matrix[i]![j]! * (vector[i]! - vector[j]!) ** 2;
  return out;
}

function sampleVariance(values: readonly number[]): number {
  if (values.length < 2) return Number.NaN;
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
}

function sampleSd(values: readonly number[]): number {
  return Math.sqrt(sampleVariance(values));
}

function stddev(values: readonly number[]): number {
  return Math.sqrt(sampleVariance(values));
}

function logNormalDensity(value: number, meanValue: number, sd: number): number {
  return -0.5 * Math.log(2 * Math.PI) - Math.log(sd) - ((value - meanValue) ** 2) / (2 * sd * sd);
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return Number.NaN;
  const x = df / (df + t * t);
  const ib = regularizedBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - ib / 2 : ib / 2;
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(x, a, b)) / a;
  return 1 - (bt * betaContinuedFraction(1 - x, b, a)) / b;
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const maxIterations = 100;
  const eps = 3e-7;
  const fpmin = 1e-30;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  qab += 0;
  qap += 0;
  qam += 0;
  return h;
}

function logGamma(z: number): number {
  const coeff = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = 0.9999999999998099;
  const zp = z - 1;
  for (let i = 0; i < coeff.length; i += 1) x += coeff[i]! / (zp + i + 1);
  const t = zp + coeff.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zp + 0.5) * Math.log(t) - t + Math.log(x);
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax));
  return sign * y;
}

function logistic(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function logit(value: number): number {
  return Math.log(value / (1 - value));
}

function safeLog(value: number): number {
  return Math.log(Math.max(value, Number.MIN_VALUE));
}

function clampProbability(value: number, epsilon = 1e-12): number {
  return clamp(Number.isFinite(value) ? value : 0.5, epsilon, 1 - epsilon);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function checkedProbability(value: number, label: string): number {
  assertProbability(value, label);
  return value;
}

function assertFiniteNumber(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("numeric inputs must be finite");
  return value;
}

function assertPositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive`);
  return value;
}

function resolvePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer`);
  return value;
}

function resolveNonnegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer`);
  return value;
}

function resolveNames(values: readonly string[] | undefined, count: number, prefix: string): string[] {
  if (values !== undefined) {
    if (values.length !== count) throw new RangeError(`${prefix}names length must match data`);
    return [...values];
  }
  return Array.from({ length: count }, (_unused, index) => `${prefix}${index + 1}`);
}

function recordFromNames<T extends readonly string[]>(names: T, values: readonly number[]): Record<T[number], number> {
  const out = {} as Record<T[number], number>;
  for (let i = 0; i < names.length; i += 1) out[names[i]! as T[number]] = values[i] ?? 0;
  return out;
}
