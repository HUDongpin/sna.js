import type { GraphTestResult, CugtestResult, CugTestResult } from "../algorithms/graphTests";
import { createNumberMatrix } from "../core/matrix";
import { jacobiEigenSymmetric } from "../core/linearAlgebra";
import { resolveRandomSource, type RandomOptions } from "../core/random";
import { logSum } from "../algorithms/operators";
import {
  coefBn,
  coefLnam,
  seLnam,
  type BrokerageResult,
  type BbnamBfResult,
  type BbnamDrawResult,
  type BnParameters,
  type BnResult,
  type LnamResult,
  type NetcancorResult,
  type NetlmResult,
  type NetlogitResult,
  type NetworkRegressionResult,
  type PstarResult,
} from "../algorithms/models";
import type { BlockCell, BlockmodelResult, EquivClustResult, HclustResult } from "../algorithms/roles";
import { gplot, plotSociomatrix, type GplotResult, type PlotSociomatrixResult } from "../visualization/core";

export interface SummaryQuantiles {
  readonly min: number;
  readonly firstQuartile: number;
  readonly median: number;
  readonly mean: number;
  readonly thirdQuartile: number;
  readonly max: number;
}

export interface DisplayTableRow {
  readonly label: string;
  readonly values: readonly (number | string | boolean | null)[];
}

export interface DisplayTable {
  readonly title?: string;
  readonly columns: readonly string[];
  readonly rows: readonly DisplayTableRow[];
}

export interface PlotPoint {
  readonly x: number;
  readonly y: number;
}

export interface HistogramBin {
  readonly x0: number;
  readonly x1: number;
  readonly count: number;
  readonly density: number;
}

export interface DistributionPlotResult {
  readonly type: "distribution";
  readonly mode: "density" | "histogram";
  readonly title: string;
  readonly xLabel: string;
  readonly observed: number;
  readonly values: readonly number[];
  readonly summary: SummaryQuantiles;
  readonly density?: readonly PlotPoint[];
  readonly bins?: readonly HistogramBin[];
  readonly svg: string;
}

export type GdistMeasureDistanceMethod = "euclidean" | "maximum" | "manhattan" | "canberra" | "binary";
export type GdistPlotstatsRescale = "quantile" | "affine" | "normalize" | "none";
export type GdistDisplayScale = "radius" | "area";
export type GdistDisplayType = "circle" | "ray" | "circleray" | "poly" | "polyray";

export interface GdistPlotdiffOptions extends RandomOptions {
  readonly method?: GdistMeasureDistanceMethod;
  readonly jitter?: boolean;
  readonly xlab?: string;
  readonly ylab?: string;
  readonly lmLine?: boolean;
  readonly width?: number;
  readonly height?: number;
}

export interface GdistPlotdiffResult {
  readonly type: "gdist.plotdiff";
  readonly points: readonly PlotPoint[];
  readonly method: GdistMeasureDistanceMethod;
  readonly xLabel: string;
  readonly yLabel: string;
  readonly regressionLine?: readonly [PlotPoint, PlotPoint];
  readonly svg: string;
}

export interface GdistPlotstatsOptions {
  readonly sizLim?: readonly [number, number];
  readonly rescale?: GdistPlotstatsRescale;
  readonly displayScale?: GdistDisplayScale;
  readonly displayType?: GdistDisplayType;
  readonly cex?: number;
  readonly pch?: number;
  readonly labels?: readonly (string | number)[] | null;
  readonly pos?: number;
  readonly labelsCex?: number;
  readonly legend?: readonly string[] | null;
  readonly legendXy?: readonly [number, number] | null;
  readonly legendCex?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface GdistMeasureGlyph {
  readonly graph: number;
  readonly measure: number;
  readonly radius: number;
  readonly angle: number;
  readonly circle?: { readonly radius: number };
  readonly ray?: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };
  readonly polygon?: readonly PlotPoint[];
}

export interface GdistPlotstatsResult {
  readonly type: "gdist.plotstats";
  readonly coordinates: readonly PlotPoint[];
  readonly scaledMeasures: readonly (readonly number[])[];
  readonly glyphs: readonly GdistMeasureGlyph[];
  readonly displayType: GdistDisplayType;
  readonly displayScale: GdistDisplayScale;
  readonly labels: readonly string[];
  readonly legend?: readonly string[];
  readonly svg: string;
}

export interface ModelPlotPanel {
  readonly id: string;
  readonly title: string;
  readonly kind: "scatter" | "qq" | "comparison" | "line" | "distribution" | "sociomatrix" | "network";
  readonly points?: readonly PlotPoint[];
  readonly lines?: readonly (readonly PlotPoint[])[];
  readonly table?: DisplayTable;
  readonly distribution?: DistributionPlotResult;
  readonly sociomatrix?: PlotSociomatrixResult;
  readonly network?: GplotResult;
  readonly svg?: string;
}

export interface ModelPlotResult {
  readonly type: "model-plot";
  readonly title: string;
  readonly panels: readonly ModelPlotPanel[];
  readonly svg: string;
}

export interface ModelSummaryResult {
  readonly type: string;
  readonly title: string;
  readonly tables: readonly DisplayTable[];
  readonly diagnostics: Readonly<Record<string, number | string | boolean | null>>;
}

export interface GraphTestSummaryResult extends ModelSummaryResult {
  readonly type: "summary.qaptest" | "summary.cugtest";
  readonly testValue: number;
  readonly reps: number;
  readonly pGreaterEqual: number;
  readonly pLessEqual: number;
  readonly distributionSummary: SummaryQuantiles;
}

export interface NetlmSummaryResult extends ModelSummaryResult {
  readonly type: "summary.netlm";
  readonly coefficients: DisplayTable;
  readonly residuals: SummaryQuantiles;
  readonly distributionSummary: DisplayTable | null;
}

export interface NetlogitSummaryResult extends ModelSummaryResult {
  readonly type: "summary.netlogit" | "summary.pstar";
  readonly coefficients: DisplayTable;
  readonly contingency: DisplayTable;
  readonly distributionSummary: DisplayTable | null;
}

export interface LnamSummaryResult extends ModelSummaryResult {
  readonly type: "summary.lnam";
  readonly coefficients: DisplayTable;
  readonly residuals: SummaryQuantiles;
  readonly sigma: DisplayTable;
}

export interface BnSummaryResult extends ModelSummaryResult {
  readonly type: "summary.bn";
  readonly parameters: DisplayTable;
  readonly edgeComparison: DisplayTable;
  readonly dyadComparison: DisplayTable;
  readonly triadComparison: DisplayTable;
}

export interface BbnamSummaryResult extends ModelSummaryResult {
  readonly type: "summary.bbnam" | "summary.bbnam.fixed" | "summary.bbnam.pooled" | "summary.bbnam.actor";
  readonly posteriorNetwork: number[][];
  readonly posteriorNetworkTable: DisplayTable;
  readonly errorSummary?: DisplayTable;
  readonly falseNegativeByObserver?: DisplayTable;
  readonly falsePositiveByObserver?: DisplayTable;
}

export interface BayesFactorSummaryResult extends ModelSummaryResult {
  readonly type: "summary.bayes.factor";
  readonly integratedLogLikelihood: DisplayTable;
  readonly inverseBayesFactors: DisplayTable;
  readonly modelProbabilities: DisplayTable;
}

export interface BlockmodelSummaryResult extends ModelSummaryResult {
  readonly type: "summary.blockmodel";
  readonly object: BlockmodelResult;
  readonly membershipByActor: DisplayTable;
  readonly membershipByBlock: DisplayTable;
  readonly blockModelTables: readonly DisplayTable[];
  readonly blockedDataTables: readonly DisplayTable[];
}

export interface BrokerageSummaryResult extends ModelSummaryResult {
  readonly type: "summary.brokerage";
  readonly global: DisplayTable;
  readonly individualByGroup: readonly DisplayTable[];
}

export interface NetcancorSummaryResult extends ModelSummaryResult {
  readonly type: "summary.netcancor";
  readonly canonicalCorrelations: DisplayTable;
  readonly xcoef: DisplayTable;
  readonly ycoef: DisplayTable;
  readonly xPValues: DisplayTable;
  readonly yPValues: DisplayTable;
}

export interface DendrogramSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface EquivClustPlotResult {
  readonly type: "plot.equiv.clust";
  readonly title: string;
  readonly labels: readonly string[];
  readonly segments: readonly DendrogramSegment[];
  readonly svg: string;
}

export type DistributionPlotMode = "density" | "histogram";

export function quantileSummary(values: readonly number[]): SummaryQuantiles {
  const finite = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (finite.length === 0) {
    return {
      min: Number.NaN,
      firstQuartile: Number.NaN,
      median: Number.NaN,
      mean: Number.NaN,
      thirdQuartile: Number.NaN,
      max: Number.NaN,
    };
  }
  return {
    min: finite[0]!,
    firstQuartile: quantileSorted(finite, 0.25),
    median: quantileSorted(finite, 0.5),
    mean: mean(finite),
    thirdQuartile: quantileSorted(finite, 0.75),
    max: finite[finite.length - 1]!,
  };
}

export function summaryQaptest(object: GraphTestResult): GraphTestSummaryResult {
  return graphTestSummary(object, "summary.qaptest", "QAP Test Results");
}

export function summaryCugtest(object: CugtestResult): GraphTestSummaryResult {
  return graphTestSummary(object, "summary.cugtest", "CUG Test Results");
}

export function printQaptest(object: GraphTestResult): string {
  return printGraphTestHeader(summaryQaptest(object), "f(perm)");
}

export function printCugtest(object: CugtestResult): string {
  return printGraphTestHeader(summaryCugtest(object), "f(rnd)");
}

export function printSummaryQaptest(object: GraphTestSummaryResult | GraphTestResult): string {
  const summary = isGraphTestSummary(object) ? object : summaryQaptest(object);
  return printGraphTestSummary(summary, "f(perm)");
}

export function printSummaryCugtest(object: GraphTestSummaryResult | CugtestResult): string {
  const summary = isGraphTestSummary(object) ? object : summaryCugtest(object);
  return printGraphTestSummary(summary, "f(rnd)");
}

export function plotQaptest(object: GraphTestResult, options: { mode?: DistributionPlotMode; width?: number; height?: number } = {}): DistributionPlotResult {
  return distributionPlot(object.distribution, object.testValue, {
    title: options.mode === "histogram" ? "Histogram of QAP Replications" : "Estimated Density of QAP Replications",
    xLabel: "Test Statistic",
    mode: options.mode ?? "density",
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
  });
}

export function plotCugtest(object: CugtestResult, options: { mode?: DistributionPlotMode; width?: number; height?: number } = {}): DistributionPlotResult {
  return distributionPlot(object.distribution, object.testValue, {
    title: options.mode === "histogram" ? "Histogram of CUG Replications" : "Estimated Density of CUG Replications",
    xLabel: "Test Statistic",
    mode: options.mode ?? "density",
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
  });
}

export function printCugTest(object: CugtestResult | CugTestResult): string {
  if (!isCugTestResult(object)) return printCugtest(object);
  return joinLines([
    "",
    "Univariate Conditional Uniform Graph Test",
    "",
    `Conditioning Method: ${object.cmode}`,
    `Graph Type: ${object.mode}`,
    `Diagonal Used: ${object.diag}`,
    `Replications: ${object.reps}`,
    "",
    `Observed Value: ${formatNumber(object.testValue)}`,
    `Pr(X>=Obs): ${formatNumber(object.pGreaterEqual)}`,
    `Pr(X<=Obs): ${formatNumber(object.pLessEqual)}`,
    "",
  ]);
}

export function plotCugTest(object: CugtestResult | CugTestResult, options: { mode?: DistributionPlotMode; width?: number; height?: number } = {}): DistributionPlotResult {
  if (!isCugTestResult(object)) return plotCugtest(object, options);
  return distributionPlot(object.distribution, object.testValue, {
    title: "Univariate CUG Test",
    xLabel: "CUG Replicates",
    mode: options.mode ?? "histogram",
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
  });
}

export function gdistPlotdiff(d: readonly (readonly number[])[], meas: readonly number[] | readonly (readonly number[])[], options: GdistPlotdiffOptions = {}): GdistPlotdiffResult {
  const distances = assertSquareNumericMatrix(d, "gdistPlotdiff distances");
  const measures = measureMatrix(meas, distances.length);
  const method = options.method ?? "manhattan";
  const graphDistances = lowerTriangleValues(distances);
  const measureDistances = pairwiseMeasureDistances(measures, method);
  const rng = resolveRandomSource(options);
  const xValues = options.jitter ?? true ? jitterValues(graphDistances, rng) : graphDistances;
  const yValues = options.jitter ?? true ? jitterValues(measureDistances, rng) : measureDistances;
  const points = xValues.map((x, index) => ({ x, y: yValues[index] ?? Number.NaN })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const regressionLine = options.lmLine ? regressionSegment(points) : undefined;
  const result: GdistPlotdiffResult = {
    type: "gdist.plotdiff",
    points,
    method,
    xLabel: options.xlab ?? "Inter-Graph Distance",
    yLabel: options.ylab ?? "Measure Distance",
    ...(regressionLine ? { regressionLine } : {}),
    svg: gdistPlotdiffSvg(points, regressionLine, options.xlab ?? "Inter-Graph Distance", options.ylab ?? "Measure Distance", options.width ?? 640, options.height ?? 420),
  };
  return result;
}

export function gdistPlotstats(d: readonly (readonly number[])[], meas: readonly number[] | readonly (readonly number[])[], options: GdistPlotstatsOptions = {}): GdistPlotstatsResult {
  const distances = assertSquareNumericMatrix(d, "gdistPlotstats distances");
  const measures = measureMatrix(meas, distances.length);
  const coordinates = classicalMds(distances, 2).map((row) => ({ x: row[0] ?? 0, y: row[1] ?? 0 }));
  const rescale = options.rescale ?? "quantile";
  const scaled = rescaleMeasures(measures, rescale);
  const displayScale = options.displayScale ?? "radius";
  const displayType = options.displayType ?? "circleray";
  const sizLim = options.sizLim ?? [0, 0.15];
  const plotRange = coordinateRange(coordinates);
  const sized = scaled.map((row) =>
    row.map((value) => {
      const scaledValue = displayScale === "area" ? Math.sqrt(Math.max(0, value)) : value;
      return (scaledValue * sizLim[1]! + sizLim[0]!) * plotRange;
    }),
  );
  const glyphs = gdistGlyphs(coordinates, sized, displayType);
  const labels = options.labels ? options.labels.map(String) : [];
  const legend = options.legend ? [...options.legend] : undefined;
  return {
    type: "gdist.plotstats",
    coordinates,
    scaledMeasures: scaled,
    glyphs,
    displayType,
    displayScale,
    labels,
    ...(legend ? { legend } : {}),
    svg: gdistPlotstatsSvg({
      coordinates,
      glyphs,
      labels,
      legend,
      displayType,
      cex: options.cex ?? 0.5,
      width: options.width ?? 640,
      height: options.height ?? 520,
    }),
  };
}

export function summaryBlockmodel(object: BlockmodelResult): BlockmodelSummaryResult {
  const membershipByActor = blockMembershipTable(object);
  const membershipByBlock = blockMembershipByBlockTable(object);
  const blockModelTables = blockModelDisplayTables(object);
  const blockedDataTables = blockedDataDisplayTables(object);
  return {
    type: "summary.blockmodel",
    title: "Network Blockmodel",
    object,
    membershipByActor,
    membershipByBlock,
    blockModelTables,
    blockedDataTables,
    tables: [membershipByActor, membershipByBlock, ...blockModelTables, ...blockedDataTables],
    diagnostics: {
      equivalenceFunction: object.equivFun,
      equivalenceMetric: object.equivMetric,
      clusteringMethod: object.clusterMethod,
      blockmodelContent: object.blockContent,
      blocks: object.rlabels.length,
      graphs: object.glabels.length,
    },
  };
}

export function printBlockmodel(object: BlockmodelResult): string {
  const summary = summaryBlockmodel(object);
  return joinLines([
    "",
    "Network Blockmodel:",
    "",
    "Block membership:",
    "",
    formatTable(summary.membershipByActor),
    "",
    "Reduced form blockmodel:",
    "",
    ...summary.blockModelTables.flatMap((table) => [formatTable(table), ""]),
  ]);
}

export function printSummaryBlockmodel(object: BlockmodelSummaryResult | BlockmodelResult): string {
  const summary = isBlockmodelSummary(object) ? object : summaryBlockmodel(object);
  return joinLines([
    "",
    "Network Blockmodel:",
    "",
    "General information:",
    formatDiagnostics(summary.diagnostics),
    "",
    "Block membership by actor:",
    "",
    formatTable(summary.membershipByActor),
    "",
    "Block membership by block:",
    "",
    formatTable(summary.membershipByBlock),
    "",
    "Reduced form blockmodel:",
    "",
    ...summary.blockModelTables.flatMap((table) => [formatTable(table), ""]),
    "Blocked data:",
    "",
    ...summary.blockedDataTables.flatMap((table) => [formatTable(table), ""]),
  ]);
}

export function printEquivClust(object: EquivClustResult): string {
  return joinLines([
    "Position Clustering:",
    "",
    `\tEquivalence function: ${object.equivFun}`,
    `\tEquivalence metric: ${object.metric}`,
    `\tCluster method: ${object.clusterMethod}`,
    `\tGraph order: ${object.cluster.order.length}`,
    "",
  ]);
}

export function plotBlockmodel(object: BlockmodelResult, options: { width?: number; height?: number } = {}): ModelPlotResult {
  const blockedStack = isMatrixStack(object.blockedData) ? object.blockedData : [object.blockedData];
  const panels: ModelPlotPanel[] = blockedStack.map((matrix, index) => {
    const base = plotSociomatrix(matrix, {
      labels: [object.plabels, object.plabels],
      drawlines: false,
      width: options.width ?? 500,
      height: options.height ?? 500,
    });
    const sociomatrix = { ...base, svg: withBlockBoundaries(base, object.blockMembership) };
    return {
      id: `blocked-data-${index}`,
      title: `Relation - ${object.glabels[index] ?? index + 1}`,
      kind: "sociomatrix",
      sociomatrix,
      svg: sociomatrix.svg,
    };
  });
  return {
    type: "model-plot",
    title: "Network Blockmodel",
    panels,
    svg: panels.length === 1 ? panels[0]!.svg ?? "" : multiPanelSvg(panels, options.width ?? 900, options.height ?? 700),
  };
}

export function plotEquivClust(object: EquivClustResult, options: { labels?: readonly (string | number)[]; width?: number; height?: number } = {}): EquivClustPlotResult {
  const labels = options.labels ? options.labels.map(String) : [...object.plabels];
  const result = dendrogramSvg(object.cluster, labels, options.width ?? 640, options.height ?? 420);
  return {
    type: "plot.equiv.clust",
    title: "Position Clustering",
    labels,
    segments: result.segments,
    svg: result.svg,
  };
}

export function summaryBrokerage(object: BrokerageResult): BrokerageSummaryResult {
  const global: DisplayTable = {
    title: "Global Brokerage Properties",
    columns: ["t", "E(t)", "Sd(t)", "z", "Pr(>|z|)"],
    rows: object.roleNames.map((role, index) => ({
      label: role,
      values: [object.rawGli[index]!, object.expGli[index]!, object.sdGli[index]!, object.zGli[index]!, 2 * (1 - normalCdf(Math.abs(object.zGli[index]!)))],
    })),
  };
  const individualByGroup = object.clid.map((group) => {
    const rows = object.cl.flatMap((label, vertex) =>
      label === group
        ? [
            {
              label: String(vertex),
              values: [...object.rawNli[vertex]!, ...object.zNli[vertex]!],
            },
          ]
        : [],
    );
    return {
      title: `Group ID: ${String(group)}`,
      columns: [...object.roleNames, ...object.roleNames.map((role) => `z.${role}`)],
      rows,
    };
  });
  return {
    type: "summary.brokerage",
    title: "Gould-Fernandez Brokerage Analysis",
    global,
    individualByGroup,
    tables: [global, ...individualByGroup],
    diagnostics: {
      actors: object.N,
      groups: object.clid.length,
    },
  };
}

export function printSummaryBrokerage(object: BrokerageSummaryResult | BrokerageResult): string {
  const summary = isBrokerageSummary(object) ? object : summaryBrokerage(object);
  return joinLines([
    summary.title,
    "",
    formatTable(summary.global),
    "",
    "Individual Properties (by Group)",
    "",
    ...summary.individualByGroup.flatMap((table) => [formatTable(table), ""]),
  ]);
}

export function summaryNetcancor(object: NetcancorResult): NetcancorSummaryResult {
  const canonicalCorrelations: DisplayTable = {
    title: "Canonical Correlations",
    columns: object.cnames,
    rows: [
      { label: "Correlation", values: object.cor },
      { label: "Coef. of Det.", values: object.cor.map((value) => value * value) },
      { label: "Pr(>=cor)", values: object.cpgreq },
      { label: "Pr(<=cor)", values: object.cpleeq },
    ],
  };
  const xcoef = matrixTable("X Coefficients", object.xcoef, object.xnames, object.cnames);
  const ycoef = matrixTable("Y Coefficients", object.ycoef, object.ynames, object.cnames);
  const xPValues = matrixTable("Pr(>=xcoef)", object.xpgreq, object.xnames, object.cnames);
  const yPValues = matrixTable("Pr(>=ycoef)", object.ypgreq, object.ynames, object.cnames);
  return {
    type: "summary.netcancor",
    title: "Canonical Network Correlation",
    canonicalCorrelations,
    xcoef,
    ycoef,
    xPValues,
    yPValues,
    tables: [canonicalCorrelations, xcoef, xPValues, ycoef, yPValues],
    diagnostics: {
      nullHypothesis: object.nullhyp,
      replications: object.reps,
      xVariables: object.xnames.length,
      yVariables: object.ynames.length,
    },
  };
}

export function printNetcancor(object: NetcancorResult): string {
  const summary = summaryNetcancor(object);
  return joinLines([
    "",
    summary.title,
    "",
    formatTable({
      title: "Canonical Correlations",
      columns: object.cnames,
      rows: [
        { label: "", values: object.cor },
        { label: "Pr(>=cor)", values: object.cpgreq },
        { label: "Pr(<=cor)", values: object.cpleeq },
      ],
    }),
    "",
    formatTable(summary.xcoef),
    "",
    formatTable(summary.ycoef),
    "",
  ]);
}

export function printSummaryNetcancor(object: NetcancorSummaryResult | NetcancorResult): string {
  const summary = isNetcancorSummary(object) ? object : summaryNetcancor(object);
  return joinLines([
    "",
    summary.title,
    "",
    formatTable(summary.canonicalCorrelations),
    "",
    formatTable(summary.xcoef),
    "",
    formatTable(summary.xPValues),
    "",
    formatTable(summary.ycoef),
    "",
    formatTable(summary.yPValues),
    "",
    "Diagnostics:",
    formatDiagnostics(summary.diagnostics),
    "",
  ]);
}

export function summaryNetlm(object: NetlmResult): NetlmSummaryResult {
  const coefficients = networkRegressionCoefficientTable(object, "netlm");
  const goodness = netlmGoodness(object);
  const residuals = quantileSummary(object.residuals);
  const distributionSummary = distributionMatrixSummary(object.distribution, object.names, "Coefficient Distribution Summary");
  return {
    type: "summary.netlm",
    title: "OLS Network Model",
    coefficients,
    residuals,
    distributionSummary,
    tables: [
      quantileTable("Residuals", residuals),
      coefficients,
      goodnessTable(goodness),
      ...(distributionSummary ? [distributionSummary] : []),
    ],
    diagnostics: {
      nullHypothesis: object.nullhyp,
      replications: object.distribution?.length ?? null,
      sigma: goodness.sigma ?? Number.NaN,
      rSquared: goodness.rSquared ?? Number.NaN,
      adjustedRSquared: goodness.adjustedRSquared ?? Number.NaN,
      fStatistic: goodness.fStatistic ?? Number.NaN,
      fPValue: goodness.fPValue ?? Number.NaN,
    },
  };
}

export function printNetlm(object: NetlmResult): string {
  return printNetlmLike(summaryNetlm(object), false);
}

export function printSummaryNetlm(object: NetlmSummaryResult | NetlmResult): string {
  return printNetlmLike(isNetlmSummary(object) ? object : summaryNetlm(object), true);
}

export function summaryNetlogit(object: NetlogitResult): NetlogitSummaryResult {
  return netlogitSummary(object, "summary.netlogit", "Network Logit Model");
}

export function printNetlogit(object: NetlogitResult): string {
  return printNetlogitLike(summaryNetlogit(object), false);
}

export function printSummaryNetlogit(object: NetlogitSummaryResult | NetlogitResult): string {
  return printNetlogitLike(isNetlogitSummary(object) ? object : summaryNetlogit(object), true);
}

export function summaryPstar(object: PstarResult): NetlogitSummaryResult {
  return netlogitSummary({ ...object, names: object.predictorNames }, "summary.pstar", "p* Logistic Network Model");
}

export function printPstar(object: PstarResult | NetlogitSummaryResult): string {
  return printNetlogitLike(isNetlogitSummary(object) ? object : summaryPstar(object), true);
}

export function summaryLnam(object: LnamResult): LnamSummaryResult {
  const coefficientRows = lnamCoefficientRows(object);
  const coefficients: DisplayTable = {
    title: "Coefficients",
    columns: ["Estimate", "Std. Error", "Z value", "Pr(>|z|)"],
    rows: coefficientRows,
  };
  const residuals = quantileSummary(object.residuals);
  const sigma: DisplayTable = {
    title: "Sigma",
    columns: ["Estimate", "Std. Error"],
    rows: [{ label: "Sigma", values: [object.sigma, object.sigmaSe] }],
  };
  const goodness = lnamGoodness(object);
  return {
    type: "summary.lnam",
    title: "Linear Network Autocorrelation Model",
    coefficients,
    residuals,
    sigma,
    tables: [quantileTable("Residuals", residuals), coefficients, sigma, goodnessTable(goodness)],
    diagnostics: {
      model: object.model,
      nullModel: object.nullModel,
      residualStandardError: goodness.residualStandardError ?? Number.NaN,
      rSquared: goodness.rSquared ?? Number.NaN,
      adjustedRSquared: goodness.adjustedRSquared ?? Number.NaN,
      logLikelihood: object.lnlikModel,
      aic: goodness.aic ?? Number.NaN,
      bic: goodness.bic ?? Number.NaN,
      nullLogLikelihood: object.lnlikNull,
      nullAic: goodness.nullAic ?? Number.NaN,
      nullBic: goodness.nullBic ?? Number.NaN,
      aicDifference: goodness.aicDifference ?? Number.NaN,
      heuristicLogBayesFactor: goodness.heuristicLogBayesFactor ?? Number.NaN,
    },
  };
}

export function printLnam(object: LnamResult): string {
  const coef = coefLnam(object);
  return joinLines([
    "",
    "Linear Network Autocorrelation Model",
    "",
    "Coefficients:",
    coef.map((value, index) => `${lnamCoefficientNames(object)[index]}  ${formatNumber(value)}`).join("\n"),
    "",
  ]);
}

export function printSummaryLnam(object: LnamSummaryResult | LnamResult): string {
  const summary = isLnamSummary(object) ? object : summaryLnam(object);
  return joinLines([
    "",
    summary.title,
    "",
    formatTable(summary.tables[0]!),
    "",
    formatTable(summary.coefficients),
    "",
    formatTable(summary.sigma),
    "",
    "Goodness-of-Fit:",
    formatDiagnostics(summary.diagnostics),
    "",
  ]);
}

export function plotLnam(object: LnamResult, options: { width?: number; height?: number } = {}): ModelPlotResult {
  const residualSd = stddev(object.residuals);
  const ci = 1.959964;
  const fittedObserved: ModelPlotPanel = {
    id: "fitted-observed",
    title: "Fitted vs. Observed Values",
    kind: "scatter",
    points: object.y.map((value, index) => ({ x: value, y: object.fittedValues[index]! })),
    lines: [
      twoPointLine(object.y, object.fittedValues, 1, 0),
      twoPointLine(object.y, object.fittedValues, 1, -ci * residualSd),
      twoPointLine(object.y, object.fittedValues, 1, ci * residualSd),
    ],
  };
  const disturbancePanel: ModelPlotPanel = {
    id: "disturbance-fitted",
    title: "Fitted Values vs. Estimated Disturbances",
    kind: "scatter",
    points: object.fittedValues.map((value, index) => ({ x: value, y: object.disturbances[index]! })),
    lines: [
      horizontalLine(object.fittedValues, 0),
      horizontalLine(object.fittedValues, -ci * object.sigma),
      horizontalLine(object.fittedValues, ci * object.sigma),
    ],
  };
  const qqPanel: ModelPlotPanel = {
    id: "qq-residual",
    title: "Normal Q-Q Residual Plot",
    kind: "qq",
    points: qqPoints(object.residuals),
  };
  const panels: ModelPlotPanel[] = [fittedObserved, disturbancePanel, qqPanel];
  const influence = lnamInfluenceGraph(object);
  if (influence) {
    panels.push({
      id: "influence",
      title: "Net Influence Plot",
      kind: "network",
      network: influence,
      svg: influence.svg,
    });
  }
  return {
    type: "model-plot",
    title: "Linear Network Autocorrelation Model Diagnostics",
    panels,
    svg: multiPanelSvg(panels, options.width ?? 900, options.height ?? 700),
  };
}

export function summaryBn(object: BnResult): BnSummaryResult {
  const parameters: DisplayTable = {
    title: "Parameters",
    columns: ["Estimate"],
    rows: parameterRows(coefBn(object)),
  };
  const edgeComparison = comparisonTable("Edge census comparison", object.edges, object.edgesPred);
  const dyadComparison = comparisonTable("Dyad census comparison", object.dyads, object.dyadsPred);
  const triadComparison = comparisonTable("Triad census comparison", object.triads, object.triadsPred);
  return {
    type: "summary.bn",
    title: "Biased Net Model",
    parameters,
    edgeComparison,
    dyadComparison,
    triadComparison,
    tables: [parameters, edgeComparison, dyadComparison, triadComparison],
    diagnostics: {
      method: object.method,
      gSquare: object.gSquare,
      edgeChiSquare: chiSquareForComparison(object.edges, object.edgesPred),
      dyadChiSquare: chiSquareForComparison(object.dyads, object.dyadsPred),
      triadChiSquare: chiSquareForComparison(object.triads, object.triadsPred),
    },
  };
}

export function printBn(object: BnResult): string {
  const summary = summaryBn(object);
  return joinLines(["", summary.title, "", formatTable(summary.parameters), ""]);
}

export function printSummaryBn(object: BnSummaryResult | BnResult): string {
  const summary = isBnSummary(object) ? object : summaryBn(object);
  return joinLines([
    "",
    summary.title,
    "",
    formatTable(summary.parameters),
    "",
    "Diagnostics:",
    formatDiagnostics(summary.diagnostics),
    "",
    formatTable(summary.edgeComparison),
    "",
    formatTable(summary.dyadComparison),
    "",
    formatTable(summary.triadComparison),
    "",
  ]);
}

export function plotBn(object: BnResult, options: { width?: number; height?: number } = {}): ModelPlotResult {
  const panels: ModelPlotPanel[] = [
    comparisonPanel("dyad-census", "Predicted Dyad Census", object.dyads, object.dyadsPred),
    comparisonPanel("triad-census", "Predicted Triad Census", object.triads, object.triadsPred),
    {
      id: "structure-statistics",
      title: "Predicted Structure Statistics",
      kind: "line",
      lines: [
        object.structureStatistics.map((value, index) => ({ x: index, y: value })),
        object.structureStatisticsPred.map((value, index) => ({ x: index, y: value })),
      ],
    },
  ];
  return {
    type: "model-plot",
    title: "Biased Net Model Diagnostics",
    panels,
    svg: multiPanelSvg(panels, options.width ?? 900, options.height ?? 700),
  };
}

export function summaryBbnam(object: BbnamDrawResult): BbnamSummaryResult {
  if (object.model === "fixed") return summaryBbnamFixed(object);
  if (object.model === "pooled") return summaryBbnamPooled(object);
  return summaryBbnamActor(object);
}

export function summaryBbnamFixed(object: BbnamDrawResult): BbnamSummaryResult {
  const posteriorNetwork = posteriorMeanNetwork(object.net);
  const posteriorNetworkTable = matrixTable("Marginal Posterior Network Distribution", posteriorNetwork, object.anames, object.anames);
  return {
    type: "summary.bbnam.fixed",
    title: "Butts' Hierarchical Bayes Model for Network Estimation/Informant Accuracy",
    posteriorNetwork,
    posteriorNetworkTable,
    tables: [posteriorNetworkTable],
    diagnostics: {
      model: "Fixed Error Probability Model",
      draws: object.draws,
      nactors: object.nactors,
      nobservers: object.nobservers,
    },
  };
}

export function summaryBbnamPooled(object: BbnamDrawResult): BbnamSummaryResult {
  const base = summaryBbnamFixed(object);
  const errorSummary = bbnamGlobalErrorTable(object, "Marginal Posterior Error Distribution");
  return {
    ...base,
    type: "summary.bbnam.pooled",
    ...(errorSummary ? { errorSummary } : {}),
    tables: [base.posteriorNetworkTable, ...(errorSummary ? [errorSummary] : [])],
    diagnostics: {
      ...base.diagnostics,
      model: "Pooled Error Probability Model",
      reps: object.reps ?? null,
      burntime: object.burntime ?? null,
      drawsPerChain: object.reps ? object.draws / object.reps : null,
      sqrtrhatMax: finiteMax(object.sqrtrhat),
      sqrtrhatMedian: finiteMedian(object.sqrtrhat),
    },
  };
}

export function summaryBbnamActor(object: BbnamDrawResult): BbnamSummaryResult {
  const base = summaryBbnamFixed(object);
  const errorSummary = bbnamGlobalErrorTable(object, "Marginal Posterior Global Error Distribution");
  const falseNegativeByObserver = bbnamObserverErrorTable(object, "em", "Probability of False Negatives (e^-)");
  const falsePositiveByObserver = bbnamObserverErrorTable(object, "ep", "Probability of False Positives (e^+)");
  return {
    ...base,
    type: "summary.bbnam.actor",
    ...(errorSummary ? { errorSummary } : {}),
    ...(falseNegativeByObserver ? { falseNegativeByObserver } : {}),
    ...(falsePositiveByObserver ? { falsePositiveByObserver } : {}),
    tables: [
      base.posteriorNetworkTable,
      ...(errorSummary ? [errorSummary] : []),
      ...(falseNegativeByObserver ? [falseNegativeByObserver] : []),
      ...(falsePositiveByObserver ? [falsePositiveByObserver] : []),
    ],
    diagnostics: {
      ...base.diagnostics,
      model: "Multiple Error Probability Model",
      reps: object.reps ?? null,
      burntime: object.burntime ?? null,
      drawsPerChain: object.reps ? object.draws / object.reps : null,
      sqrtrhatMax: finiteMax(object.sqrtrhat),
      sqrtrhatMedian: finiteMedian(object.sqrtrhat),
    },
  };
}

export function printBbnam(object: BbnamDrawResult): string {
  return printSummaryBbnam(summaryBbnam(object));
}

export function printBbnamFixed(object: BbnamDrawResult): string {
  return printSummaryBbnam(summaryBbnamFixed(object));
}

export function printBbnamPooled(object: BbnamDrawResult): string {
  return printSummaryBbnam(summaryBbnamPooled(object));
}

export function printBbnamActor(object: BbnamDrawResult): string {
  return printSummaryBbnam(summaryBbnamActor(object));
}

export function printSummaryBbnam(object: BbnamSummaryResult | BbnamDrawResult): string {
  const summary = isBbnamSummary(object) ? object : summaryBbnam(object);
  return joinLines([
    "",
    summary.title,
    "",
    String(summary.diagnostics.model ?? "BBNAM"),
    "",
    formatTable(summary.posteriorNetworkTable),
    "",
    ...(summary.errorSummary ? [formatTable(summary.errorSummary), ""] : []),
    ...(summary.falseNegativeByObserver ? [formatTable(summary.falseNegativeByObserver), ""] : []),
    ...(summary.falsePositiveByObserver ? [formatTable(summary.falsePositiveByObserver), ""] : []),
    "Diagnostics:",
    formatDiagnostics(summary.diagnostics),
    "",
  ]);
}

export const printSummaryBbnamFixed = printSummaryBbnam;
export const printSummaryBbnamPooled = printSummaryBbnam;
export const printSummaryBbnamActor = printSummaryBbnam;

export function plotBbnam(object: BbnamDrawResult, options: { mode?: DistributionPlotMode; width?: number; height?: number; intlines?: boolean } = {}): ModelPlotResult {
  if (object.model === "fixed") return plotBbnamFixed(object, options);
  if (object.model === "pooled") return plotBbnamPooled(object, options);
  return plotBbnamActor(object, options);
}

export function plotBbnamFixed(object: BbnamDrawResult, options: { width?: number; height?: number } = {}): ModelPlotResult {
  const posteriorNetwork = posteriorMeanNetwork(object.net);
  const sociomatrix = plotSociomatrix(posteriorNetwork, { labels: [object.anames, object.anames], width: options.width ?? 500, height: options.height ?? 500 });
  const panels: ModelPlotPanel[] = [
    {
      id: "posterior-network",
      title: "Marginal Posterior Tie Probability Distribution",
      kind: "sociomatrix",
      sociomatrix,
      svg: sociomatrix.svg,
    },
  ];
  return { type: "model-plot", title: "BBNAM Posterior", panels, svg: sociomatrix.svg };
}

export function plotBbnamPooled(object: BbnamDrawResult, options: { mode?: DistributionPlotMode; width?: number; height?: number } = {}): ModelPlotResult {
  const base = plotBbnamFixed(object, options);
  const panels = [...bbnamErrorDistributionPanels(object, options.mode ?? "density"), ...base.panels];
  return { type: "model-plot", title: "Pooled Error Probability Model", panels, svg: multiPanelSvg(panels, options.width ?? 900, options.height ?? 700) };
}

export function plotBbnamActor(object: BbnamDrawResult, options: { mode?: DistributionPlotMode; width?: number; height?: number } = {}): ModelPlotResult {
  const base = plotBbnamFixed(object, options);
  const panels = [...bbnamErrorDistributionPanels(object, options.mode ?? "density"), ...bbnamObserverDistributionPanels(object, options.mode ?? "density"), ...base.panels];
  return { type: "model-plot", title: "Multiple Error Probability Model", panels, svg: multiPanelSvg(panels, options.width ?? 900, options.height ?? 900) };
}

export function summaryBayesFactor(object: BbnamBfResult): BayesFactorSummaryResult {
  const labels = [...object.modelNames];
  const inverse = object.integratedLogLikelihood.map((row) => row.map((value) => -value));
  const diag = object.integratedLogLikelihood.map((row, index) => row[index]!);
  const denom = logSum(diag) as number;
  for (let index = 0; index < inverse.length; index += 1) inverse[index]![index] = diag[index]! - denom;
  const probabilities = diag.map((value) => Math.exp(value - denom));
  const integratedLogLikelihood = matrixTable("Log Bayes Factors by Model", object.integratedLogLikelihood, labels, labels);
  const inverseBayesFactors = matrixTable("Log Inverse Bayes Factors", inverse, labels, labels);
  const modelProbabilities: DisplayTable = {
    title: "Estimated model probabilities (within-set)",
    columns: ["Probability"],
    rows: labels.map((label, index) => ({ label, values: [probabilities[index]!] })),
  };
  const stdTable: DisplayTable = {
    title: "Log std deviations of integrated likelihood estimates",
    columns: ["Std. Dev."],
    rows: labels.map((label, index) => ({ label, values: [object.integratedLogLikelihoodStd[index]!] })),
  };
  return {
    type: "summary.bayes.factor",
    title: "Bayes Factor Summary",
    integratedLogLikelihood,
    inverseBayesFactors,
    modelProbabilities,
    tables: [integratedLogLikelihood, inverseBayesFactors, modelProbabilities, stdTable],
    diagnostics: {
      reps: object.reps,
    },
  };
}

export function printBayesFactor(object: BbnamBfResult): string {
  return joinLines(["Log Bayes Factors by Model:", "", "(Diagonals indicate raw integrated log likelihood estimates.)", "", formatTable(matrixTable(undefined, object.integratedLogLikelihood, object.modelNames, object.modelNames)), ""]);
}

export function printSummaryBayesFactor(object: BayesFactorSummaryResult | BbnamBfResult): string {
  const summary = isBayesFactorSummary(object) ? object : summaryBayesFactor(object);
  return joinLines([
    "Log Bayes Factors by Model:",
    "",
    "(Diagonals indicate raw integrated log likelihood estimates.)",
    "",
    formatTable(summary.integratedLogLikelihood),
    "",
    formatTable(summary.inverseBayesFactors),
    "",
    formatTable(summary.modelProbabilities),
    "",
    "Diagnostics:",
    formatDiagnostics(summary.diagnostics),
    "",
  ]);
}

function graphTestSummary(object: GraphTestResult, type: "summary.qaptest" | "summary.cugtest", title: string): GraphTestSummaryResult {
  const distributionSummary = quantileSummary(object.distribution);
  return {
    type,
    title,
    testValue: object.testValue,
    reps: object.reps,
    pGreaterEqual: object.pGreaterEqual,
    pLessEqual: object.pLessEqual,
    distributionSummary,
    tables: [
      {
        title: "Estimated p-values",
        columns: ["Value"],
        rows: [
          { label: "Pr(>=Obs)", values: [object.pGreaterEqual] },
          { label: "Pr(<=Obs)", values: [object.pLessEqual] },
        ],
      },
      quantileTable("Distribution Summary", distributionSummary),
    ],
    diagnostics: {
      testValue: object.testValue,
      replications: object.reps,
    },
  };
}

function isCugTestResult(object: CugtestResult | CugTestResult): object is CugTestResult {
  return (object as CugTestResult).type === "cug.test";
}

function assertSquareNumericMatrix(matrix: readonly (readonly number[])[], label: string): number[][] {
  const n = matrix.length;
  const out = matrix.map((row) => {
    if (row.length !== n) throw new RangeError(`${label} must be a square matrix`);
    return row.map((value) => (Number.isFinite(value) ? value : Number.NaN));
  });
  return out;
}

function measureMatrix(meas: readonly number[] | readonly (readonly number[])[], rows: number): number[][] {
  if (meas.length !== rows) throw new RangeError("measure rows must correspond to distance matrix rows");
  const first = meas[0] as unknown;
  if (Array.isArray(first)) return (meas as readonly (readonly number[])[]).map((row) => row.map((value) => (Number.isFinite(value) ? value : Number.NaN)));
  return (meas as readonly number[]).map((value) => [Number.isFinite(value) ? value : Number.NaN]);
}

function lowerTriangleValues(matrix: readonly (readonly number[])[]): number[] {
  const out: number[] = [];
  for (let row = 1; row < matrix.length; row += 1) {
    for (let col = 0; col < row; col += 1) out.push(matrix[row]![col]!);
  }
  return out;
}

function pairwiseMeasureDistances(measures: readonly (readonly number[])[], method: GdistMeasureDistanceMethod): number[] {
  const out: number[] = [];
  for (let row = 1; row < measures.length; row += 1) {
    for (let col = 0; col < row; col += 1) out.push(measureDistance(measures[row]!, measures[col]!, method));
  }
  return out;
}

function measureDistance(left: readonly number[], right: readonly number[], method: GdistMeasureDistanceMethod): number {
  const length = Math.min(left.length, right.length);
  let sumValue = 0;
  let maxValue = 0;
  let binaryNumerator = 0;
  let binaryDenominator = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const diff = Math.abs(a - b);
    if (method === "maximum") maxValue = Math.max(maxValue, diff);
    else if (method === "euclidean") sumValue += diff * diff;
    else if (method === "canberra") {
      const denom = Math.abs(a) + Math.abs(b);
      if (denom !== 0) sumValue += diff / denom;
    } else if (method === "binary") {
      const pa = a !== 0;
      const pb = b !== 0;
      if (pa || pb) binaryDenominator += 1;
      if (pa !== pb) binaryNumerator += 1;
    } else sumValue += diff;
  }
  if (method === "maximum") return maxValue;
  if (method === "euclidean") return Math.sqrt(sumValue);
  if (method === "binary") return binaryDenominator === 0 ? 0 : binaryNumerator / binaryDenominator;
  return sumValue;
}

function jitterValues(values: readonly number[], rng: () => number): number[] {
  if (values.length === 0) return [];
  const finite = values.filter(Number.isFinite);
  const spread = finite.length === 0 ? 1 : Math.max(...finite) - Math.min(...finite);
  const amount = (spread || Math.max(...finite.map((value) => Math.abs(value)), 1)) * 0.01;
  return values.map((value) => (Number.isFinite(value) ? value + (rng() - 0.5) * amount : value));
}

function regressionSegment(points: readonly PlotPoint[]): readonly [PlotPoint, PlotPoint] | undefined {
  if (points.length < 2) return undefined;
  const xMean = mean(points.map((point) => point.x));
  const yMean = mean(points.map((point) => point.y));
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.x - xMean) * (point.y - yMean);
    denominator += (point.x - xMean) ** 2;
  }
  if (denominator === 0) return undefined;
  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  const xMin = Math.min(...points.map((point) => point.x));
  const xMax = Math.max(...points.map((point) => point.x));
  return [
    { x: xMin, y: intercept + slope * xMin },
    { x: xMax, y: intercept + slope * xMax },
  ];
}

function gdistPlotdiffSvg(points: readonly PlotPoint[], regressionLine: readonly [PlotPoint, PlotPoint] | undefined, xLabel: string, yLabel: string, width: number, height: number): string {
  const margin = { left: 64, right: 24, top: 32, bottom: 52 };
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const linePoints = regressionLine ? [...regressionLine] : [];
  const xVals = [...points, ...linePoints].map((point) => point.x);
  const yVals = [...points, ...linePoints].map((point) => point.y);
  const xScale = scaleLinear(Math.min(...xVals, 0), Math.max(...xVals, 1), margin.left, margin.left + plotWidth);
  const yScale = scaleLinear(Math.min(...yVals, 0), Math.max(...yVals, 1), margin.top + plotHeight, margin.top);
  const pointSvg = points.map((point) => `<circle cx="${xScale(point.x).toFixed(2)}" cy="${yScale(point.y).toFixed(2)}" r="3" fill="#2b6cb0" opacity="0.82"/>`).join("");
  const lineSvg = regressionLine
    ? `<line x1="${xScale(regressionLine[0].x).toFixed(2)}" y1="${yScale(regressionLine[0].y).toFixed(2)}" x2="${xScale(regressionLine[1].x).toFixed(2)}" y2="${yScale(regressionLine[1].y).toFixed(2)}" stroke="#d62728" stroke-width="2"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="gdist plotdiff"><rect width="100%" height="100%" fill="white"/><line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#222"/><line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#222"/>${pointSvg}${lineSvg}<text x="${width / 2}" y="${height - 14}" text-anchor="middle" font-family="sans-serif" font-size="12">${escapeXml(xLabel)}</text><text x="16" y="${margin.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 16 ${margin.top + plotHeight / 2})" font-family="sans-serif" font-size="12">${escapeXml(yLabel)}</text></svg>`;
}

function classicalMds(distances: readonly (readonly number[])[], dimensions: 2): number[][] {
  const n = distances.length;
  if (n === 0) return [];
  const d2 = distances.map((row) => row.map((value) => (Number.isFinite(value) ? value : 0) ** 2));
  const rowMeans = d2.map((row) => mean(row));
  const colMeans = Array.from({ length: n }, (_unused, col) => mean(d2.map((row) => row[col]!)));
  const totalMean = mean(rowMeans);
  const centered = createNumberMatrix(n, n);
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) centered[row]![col] = -0.5 * (d2[row]![col]! - rowMeans[row]! - colMeans[col]! + totalMean);
  }
  const eig = jacobiEigenSymmetric(centered);
  return Array.from({ length: n }, (_unused, row) =>
    Array.from({ length: dimensions }, (_unused2, axis) => eig.vectors[row]![axis]! * Math.sqrt(Math.max(eig.values[axis] ?? 0, 0))),
  );
}

function rescaleMeasures(measures: readonly (readonly number[])[], mode: GdistPlotstatsRescale): number[][] {
  if (mode === "none") return measures.map((row) => [...row]);
  const rows = measures.length;
  const cols = measures[0]?.length ?? 0;
  const out = createNumberMatrix(rows, cols);
  for (let col = 0; col < cols; col += 1) {
    const values = measures.map((row) => row[col] ?? Number.NaN);
    const finite = values.filter(Number.isFinite);
    const minValue = finite.length === 0 ? 0 : Math.min(...finite);
    const maxValue = finite.length === 0 ? 1 : Math.max(...finite);
    const ranks = rankValues(values);
    for (let row = 0; row < rows; row += 1) {
      const value = values[row]!;
      if (!Number.isFinite(value)) {
        out[row]![col] = 0;
      } else if (mode === "quantile") {
        out[row]![col] = rows <= 1 ? 0 : (ranks[row]! - 1) / (rows - 1);
      } else if (mode === "affine") {
        out[row]![col] = maxValue === minValue ? 0 : (value - minValue) / (maxValue - minValue);
      } else {
        out[row]![col] = maxValue === 0 ? 0 : value / maxValue;
      }
    }
  }
  return out;
}

function rankValues(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const ranks = Array.from({ length: values.length }, () => 1);
  order.forEach((entry, position) => {
    ranks[entry.index] = position + 1;
  });
  return ranks;
}

function coordinateRange(points: readonly PlotPoint[]): number {
  const values = points.flatMap((point) => [point.x, point.y]).filter(Number.isFinite);
  if (values.length === 0) return 1;
  return Math.max(Math.max(...values) - Math.min(...values), 1);
}

function gdistGlyphs(coordinates: readonly PlotPoint[], radii: readonly (readonly number[])[], displayType: GdistDisplayType): GdistMeasureGlyph[] {
  const measureCount = radii[0]?.length ?? 0;
  const glyphs: GdistMeasureGlyph[] = [];
  for (let graph = 0; graph < coordinates.length; graph += 1) {
    const center = coordinates[graph]!;
    for (let measure = 0; measure < measureCount; measure += 1) {
      const radius = radii[graph]?.[measure] ?? 0;
      const angle = (2 * Math.PI * measure) / Math.max(1, measureCount);
      const ray = { x1: center.x, y1: center.y, x2: center.x + Math.sin(angle) * radius, y2: center.y + Math.cos(angle) * radius };
      const polygon = Array.from({ length: Math.max(3, measureCount) }, (_unused, side) => {
        const sideAngle = (2 * Math.PI * side) / Math.max(3, measureCount);
        return { x: center.x + Math.sin(sideAngle) * radius, y: center.y + Math.cos(sideAngle) * radius };
      });
      glyphs.push({
        graph,
        measure,
        radius,
        angle,
        ...(displayType === "circle" || displayType === "circleray" ? { circle: { radius } } : {}),
        ...(displayType === "ray" || displayType === "circleray" || displayType === "polyray" ? { ray } : {}),
        ...(displayType === "poly" || displayType === "polyray" ? { polygon } : {}),
      });
    }
  }
  return glyphs;
}

function gdistPlotstatsSvg(options: {
  readonly coordinates: readonly PlotPoint[];
  readonly glyphs: readonly GdistMeasureGlyph[];
  readonly labels: readonly string[];
  readonly legend: readonly string[] | undefined;
  readonly displayType: GdistDisplayType;
  readonly cex: number;
  readonly width: number;
  readonly height: number;
}): string {
  const margin = { left: 48, right: 32, top: 32, bottom: 48 };
  const plotWidth = Math.max(1, options.width - margin.left - margin.right);
  const plotHeight = Math.max(1, options.height - margin.top - margin.bottom);
  const allPoints = [
    ...options.coordinates,
    ...options.glyphs.flatMap((glyph) => [glyph.ray ? { x: glyph.ray.x2, y: glyph.ray.y2 } : undefined, ...(glyph.polygon ?? [])]).filter((point): point is PlotPoint => !!point),
  ];
  const xScale = scaleLinear(Math.min(...allPoints.map((point) => point.x), -1), Math.max(...allPoints.map((point) => point.x), 1), margin.left, margin.left + plotWidth);
  const yScale = scaleLinear(Math.min(...allPoints.map((point) => point.y), -1), Math.max(...allPoints.map((point) => point.y), 1), margin.top + plotHeight, margin.top);
  const colors = ["#2b6cb0", "#d62728", "#2ca02c", "#9467bd", "#ff7f0e", "#17becf", "#4d4d4d"];
  const glyphSvg = options.glyphs
    .map((glyph) => {
      const color = colors[glyph.measure % colors.length]!;
      const center = options.coordinates[glyph.graph]!;
      const circle = glyph.circle
        ? `<circle cx="${xScale(center.x).toFixed(2)}" cy="${yScale(center.y).toFixed(2)}" r="${Math.abs(xScale(center.x + glyph.circle.radius) - xScale(center.x)).toFixed(2)}" fill="none" stroke="${color}" stroke-width="1.2"/>`
        : "";
      const ray = glyph.ray
        ? `<line x1="${xScale(glyph.ray.x1).toFixed(2)}" y1="${yScale(glyph.ray.y1).toFixed(2)}" x2="${xScale(glyph.ray.x2).toFixed(2)}" y2="${yScale(glyph.ray.y2).toFixed(2)}" stroke="${color}" stroke-width="1.4"/>`
        : "";
      const polygon = glyph.polygon
        ? `<path d="${glyph.polygon.map((point, index) => `${index === 0 ? "M" : "L"}${xScale(point.x).toFixed(2)},${yScale(point.y).toFixed(2)}`).join(" ")} Z" fill="none" stroke="${color}" stroke-width="1.1"/>`
        : "";
      return `${circle}${ray}${polygon}`;
    })
    .join("");
  const pointSvg = options.coordinates.map((point) => `<circle cx="${xScale(point.x).toFixed(2)}" cy="${yScale(point.y).toFixed(2)}" r="${Math.max(1.5, 4 * options.cex).toFixed(2)}" fill="#111"/>`).join("");
  const labelSvg = options.labels
    .map((label, index) => {
      const point = options.coordinates[index];
      if (!point) return "";
      return `<text x="${(xScale(point.x) + 6).toFixed(2)}" y="${(yScale(point.y) - 6).toFixed(2)}" font-family="sans-serif" font-size="11">${escapeXml(label)}</text>`;
    })
    .join("");
  const legendSvg = (options.legend ?? [])
    .map((label, index) => `<g transform="translate(${options.width - margin.right - 120},${margin.top + index * 18})"><rect width="10" height="10" fill="${colors[index % colors.length]!}"/><text x="16" y="9" font-family="sans-serif" font-size="11">${escapeXml(label)}</text></g>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" role="img" aria-label="gdist plotstats"><rect width="100%" height="100%" fill="white"/><line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#222"/><line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#222"/><text x="${options.width / 2}" y="${options.height - 14}" text-anchor="middle" font-family="sans-serif" font-size="12">lambda1</text><text x="16" y="${margin.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 16 ${margin.top + plotHeight / 2})" font-family="sans-serif" font-size="12">lambda2</text>${glyphSvg}${pointSvg}${labelSvg}${legendSvg}</svg>`;
}

function distributionPlot(
  values: readonly number[],
  observed: number,
  options: { title: string; xLabel: string; mode: DistributionPlotMode; width?: number; height?: number },
): DistributionPlotResult {
  const finite = values.filter(Number.isFinite);
  const summary = quantileSummary(finite);
  const width = options.width ?? 640;
  const height = options.height ?? 360;
  const requestedMode = options.mode;
  const density = requestedMode === "density" ? kernelDensity(finite) : undefined;
  const mode = density && density.length > 1 ? "density" : "histogram";
  const bins = mode === "histogram" ? histogram(finite) : undefined;
  return {
    type: "distribution",
    mode,
    title: options.title,
    xLabel: options.xLabel,
    observed,
    values: finite,
    summary,
    ...(density && mode === "density" ? { density } : {}),
    ...(bins ? { bins } : {}),
    svg: distributionSvg({
      title: options.title,
      xLabel: options.xLabel,
      observed,
      ...(mode === "density" && density ? { density } : {}),
      ...(bins ? { bins } : {}),
      width,
      height,
    }),
  };
}

function printGraphTestHeader(summary: GraphTestSummaryResult, randomLabel: string): string {
  return joinLines([
    "",
    summary.title,
    "",
    "Estimated p-values:",
    `\tp(${randomLabel} >= f(d)): ${formatNumber(summary.pGreaterEqual)}`,
    `\tp(${randomLabel} <= f(d)): ${formatNumber(summary.pLessEqual)}`,
    "",
  ]);
}

function printGraphTestSummary(summary: GraphTestSummaryResult, randomLabel: string): string {
  return joinLines([
    printGraphTestHeader(summary, randomLabel).trimEnd(),
    "",
    "Test Diagnostics:",
    `\tTest Value (f(d)): ${formatNumber(summary.testValue)}`,
    `\tReplications: ${summary.reps}`,
    "\tDistribution Summary:",
    `\t\tMin:\t${formatNumber(summary.distributionSummary.min)}`,
    `\t\t1stQ:\t${formatNumber(summary.distributionSummary.firstQuartile)}`,
    `\t\tMed:\t${formatNumber(summary.distributionSummary.median)}`,
    `\t\tMean:\t${formatNumber(summary.distributionSummary.mean)}`,
    `\t\t3rdQ:\t${formatNumber(summary.distributionSummary.thirdQuartile)}`,
    `\t\tMax:\t${formatNumber(summary.distributionSummary.max)}`,
    "",
  ]);
}

function networkRegressionCoefficientTable(object: NetworkRegressionResult, kind: "netlm" | "netlogit"): DisplayTable {
  const columns = kind === "netlogit" ? ["Estimate", "Std. Error", "Z value", "Exp(b)", "Pr(<=b)", "Pr(>=b)", "Pr(>=|b|)"] : ["Estimate", "Std. Error", "T value", "Pr(<=b)", "Pr(>=b)", "Pr(>=|b|)"];
  return {
    title: "Coefficients",
    columns,
    rows: object.coefficients.map((coef, index) => ({
      label: object.names[index] ?? `x${index}`,
      values:
        kind === "netlogit"
          ? [
              coef,
              object.standardErrors[index] ?? Number.NaN,
              object.tstat[index] ?? Number.NaN,
              Math.exp(coef),
              object.pLessEqual[index] ?? Number.NaN,
              object.pGreaterEqual[index] ?? Number.NaN,
              object.pGreaterEqualAbs[index] ?? Number.NaN,
            ]
          : [
              coef,
              object.standardErrors[index] ?? Number.NaN,
              object.tstat[index] ?? Number.NaN,
              object.pLessEqual[index] ?? Number.NaN,
              object.pGreaterEqual[index] ?? Number.NaN,
              object.pGreaterEqualAbs[index] ?? Number.NaN,
            ],
    })),
  };
}

function netlmGoodness(object: NetlmResult): Record<string, number> {
  const mss = object.intercept ? sum(object.fittedValues.map((value) => (value - mean(object.fittedValues)) ** 2)) : sum(object.fittedValues.map((value) => value ** 2));
  const rss = sum(object.residuals.map((value) => value ** 2));
  const dfInt = object.intercept ? 1 : 0;
  const modelDf = object.rank - dfInt;
  const rdf = object.dfResidual;
  const resvar = rdf > 0 ? rss / rdf : Number.NaN;
  const fStatistic = modelDf > 0 && Number.isFinite(resvar) && resvar > 0 ? (mss / modelDf) / resvar : Number.NaN;
  const rSquared = mss + rss === 0 ? Number.NaN : mss / (mss + rss);
  const adjustedRSquared = rdf > 0 && Number.isFinite(rSquared) ? 1 - (1 - rSquared) * ((object.n - dfInt) / rdf) : Number.NaN;
  return {
    residualStandardError: Math.sqrt(resvar),
    sigma: Math.sqrt(resvar),
    residualDf: rdf,
    fStatistic,
    fNumeratorDf: modelDf,
    fDenominatorDf: rdf,
    fPValue: Number.isFinite(fStatistic) ? 1 - fCdf(fStatistic, modelDf, rdf) : Number.NaN,
    rSquared,
    adjustedRSquared,
  };
}

function netlogitSummary(object: NetlogitResult | PstarResult, type: "summary.netlogit" | "summary.pstar", title: string): NetlogitSummaryResult {
  const coefficients = networkRegressionCoefficientTable(object, "netlogit");
  const contingency = contingencyTable(object.contingencyTable);
  const distributionSummary = distributionMatrixSummary(object.distribution, object.names, "Distribution Summary");
  const improvement = object.nullDeviance - object.deviance;
  const improvementDf = object.dfNull - object.dfResidual;
  return {
    type,
    title,
    coefficients,
    contingency,
    distributionSummary,
    tables: [coefficients, gofTableNetlogit(object), contingency, ...(distributionSummary ? [distributionSummary] : [])],
    diagnostics: {
      nullHypothesis: object.nullhyp,
      replications: object.distribution?.length ?? null,
      nullDeviance: object.nullDeviance,
      residualDeviance: object.deviance,
      dfNull: object.dfNull,
      dfResidual: object.dfResidual,
      chiSquare: improvement,
      chiSquareDf: improvementDf,
      chiSquarePValue: improvementDf > 0 ? 1 - chiSquareCdf(improvement, improvementDf) : Number.NaN,
      aic: object.aic,
      bic: object.bic,
      pseudoRSquaredImprovementDf: improvement / (improvement + object.dfNull),
      pseudoRSquaredDeviance: 1 - object.deviance / object.nullDeviance,
      converged: object.converged,
      iterations: object.iterations,
    },
  };
}

function printNetlmLike(summary: NetlmSummaryResult, includeDiagnostics: boolean): string {
  return joinLines([
    "",
    summary.title,
    "",
    ...(includeDiagnostics ? ["Residuals:", formatTable(quantileTable(undefined, summary.residuals)), ""] : []),
    formatTable(summary.coefficients),
    "",
    "Goodness of Fit:",
    formatDiagnostics(summary.diagnostics),
    ...(includeDiagnostics && summary.distributionSummary ? ["", formatTable(summary.distributionSummary)] : []),
    "",
  ]);
}

function printNetlogitLike(summary: NetlogitSummaryResult, includeDiagnostics: boolean): string {
  return joinLines([
    "",
    summary.title,
    "",
    formatTable(summary.coefficients),
    "",
    "Goodness of Fit Statistics:",
    formatDiagnostics(summary.diagnostics),
    ...(includeDiagnostics ? ["", formatTable(summary.contingency)] : []),
    ...(includeDiagnostics && summary.distributionSummary ? ["", formatTable(summary.distributionSummary)] : []),
    "",
  ]);
}

function gofTableNetlogit(object: NetlogitResult | PstarResult): DisplayTable {
  return {
    title: "Goodness of Fit Statistics",
    columns: ["Value"],
    rows: [
      { label: "Null deviance", values: [object.nullDeviance] },
      { label: "Residual deviance", values: [object.deviance] },
      { label: "AIC", values: [object.aic] },
      { label: "BIC", values: [object.bic] },
    ],
  };
}

function contingencyTable(table: NetlogitResult["contingencyTable"]): DisplayTable {
  const total = table.flat().reduce((a, b) => a + b, 0);
  return {
    title: "Contingency Table (predicted rows x actual columns)",
    columns: ["Actual 0", "Actual 1", "Row Total"],
    rows: [
      { label: "Predicted 0", values: [table[0][0], table[0][1], table[0][0] + table[0][1]] },
      { label: "Predicted 1", values: [table[1][0], table[1][1], table[1][0] + table[1][1]] },
      { label: "Total", values: [table[0][0] + table[1][0], table[0][1] + table[1][1], total] },
    ],
  };
}

function distributionMatrixSummary(distribution: readonly (readonly number[])[] | null, names: readonly string[], title: string): DisplayTable | null {
  if (!distribution || distribution.length === 0) return null;
  const columns = names.length > 0 ? names : Array.from({ length: distribution[0]?.length ?? 0 }, (_unused, index) => `x${index}`);
  const rows = ["Min", "1stQ", "Median", "Mean", "3rdQ", "Max"].map((label, rowIndex) => ({
    label,
    values: columns.map((_name, col) => {
      const summary = quantileSummary(distribution.map((row) => row[col] ?? Number.NaN));
      return [summary.min, summary.firstQuartile, summary.median, summary.mean, summary.thirdQuartile, summary.max][rowIndex]!;
    }),
  }));
  return { title, columns, rows };
}

function lnamCoefficientRows(object: LnamResult): DisplayTableRow[] {
  const coef = coefLnam(object);
  const se = seLnam(object);
  const names = lnamCoefficientNames(object);
  return coef.map((value, index) => {
    const stdError = se[index] ?? Number.NaN;
    const z = value / stdError;
    return { label: names[index] ?? `param${index + 1}`, values: [value, stdError, z, 2 * (1 - normalCdf(Math.abs(z)))] };
  });
}

function lnamCoefficientNames(object: LnamResult): string[] {
  return [
    ...(object.beta ?? []).map((_value, index) => `beta${index + 1}`),
    ...(object.rho1 ?? []).map((_value, index) => `rho1.${index + 1}`),
    ...(object.rho2 ?? []).map((_value, index) => `rho2.${index + 1}`),
  ];
}

function lnamGoodness(object: LnamResult): Record<string, number> {
  const rss = sum(object.residuals.map((value) => value ** 2));
  const mss = sum(object.fittedValues.map((value) => (value - mean(object.fittedValues)) ** 2));
  const rdfNoSigma = object.dfResidual + 1;
  const rSquared = mss + rss === 0 ? Number.NaN : mss / (mss + rss);
  return {
    residualStandardError: Math.sqrt(rss / rdfNoSigma),
    residualDfWithoutSigma: rdfNoSigma,
    rSquared,
    adjustedRSquared: 1 - (1 - rSquared) * (object.dfTotal / rdfNoSigma),
    logLikelihood: object.lnlikModel,
    modelDf: object.dfModel,
    aic: -2 * object.lnlikModel + 2 * object.dfModel,
    bic: -2 * object.lnlikModel + Math.log(object.dfTotal) * object.dfModel,
    nullLogLikelihood: object.lnlikNull,
    nullDf: object.dfNull,
    nullAic: -2 * object.lnlikNull + 2 * object.dfNull,
    nullBic: -2 * object.lnlikNull + Math.log(object.dfTotal) * object.dfNull,
    aicDifference: -2 * object.lnlikNull + 2 * object.dfNull + 2 * object.lnlikModel - 2 * object.dfModel,
    heuristicLogBayesFactor: -2 * object.lnlikNull + Math.log(object.dfTotal) * object.dfNull + 2 * object.lnlikModel - Math.log(object.dfTotal) * object.dfModel,
  };
}

function lnamInfluenceGraph(object: LnamResult): GplotResult | null {
  if (!object.W1 && !object.W2) return null;
  const n = object.dfTotal;
  let influence = zeroMatrix(n, n);
  if (object.W1 && object.rho1) influence = addMatrices(influence, inverse(subtractFromIdentity(weightedMatrixSum(object.W1, object.rho1))));
  if (object.W2 && object.rho2) influence = addMatrices(influence, inverse(subtractFromIdentity(weightedMatrixSum(object.W2, object.rho2))));
  const values = influence.flatMap((row, i) => row.filter((_value, j) => i !== j));
  const avg = mean(values);
  const sd = stddev(values);
  const standardized = influence.map((row, i) => row.map((value, j) => (i === j || sd === 0 ? Number.NaN : Math.abs((value - avg) / sd))));
  return gplot(standardized, { thresh: 1.96, edgeLty: 1, edgeCol: "#d95f02", displaylabels: true, label: Array.from({ length: n }, (_unused, index) => index + 1), seed: "lnam-influence" });
}

function parameterRows(params: BnParameters): DisplayTableRow[] {
  return [
    { label: "d", values: [params.d] },
    { label: "pi", values: [params.pi] },
    { label: "sigma", values: [params.sigma] },
    { label: "rho", values: [params.rho] },
  ];
}

function comparisonTable(title: string, observed: Readonly<Record<string, number>>, predictedProb: Readonly<Record<string, number>>): DisplayTable {
  const total = Object.values(observed).reduce((a, b) => a + b, 0);
  return {
    title,
    columns: ["Observed", "Predicted", "Z Value", "Pr(>|z|)"],
    rows: Object.keys(observed).map((key) => {
      const prob = predictedProb[key] ?? Number.NaN;
      const predicted = prob * total;
      const variance = prob * (1 - prob) * total;
      const z = variance > 0 ? ((observed[key] ?? Number.NaN) - predicted) / Math.sqrt(variance) : Number.NaN;
      return { label: key, values: [observed[key] ?? Number.NaN, predicted, z, 2 * (1 - normalCdf(Math.abs(z)))] };
    }),
  };
}

function comparisonPanel(id: string, title: string, observed: Readonly<Record<string, number>>, predictedProb: Readonly<Record<string, number>>): ModelPlotPanel {
  return {
    id,
    title,
    kind: "comparison",
    table: comparisonTable(title, observed, predictedProb),
  };
}

function chiSquareForComparison(observed: Readonly<Record<string, number>>, predictedProb: Readonly<Record<string, number>>): number {
  const total = Object.values(observed).reduce((a, b) => a + b, 0);
  return Object.keys(observed).reduce((acc, key) => {
    const expected = (predictedProb[key] ?? 0) * total;
    return expected > 0 ? acc + ((observed[key] ?? 0) - expected) ** 2 / expected : acc;
  }, 0);
}

function posteriorMeanNetwork(draws: readonly (readonly (readonly number[])[])[]): number[][] {
  if (draws.length === 0) return [];
  const n = draws[0]!.length;
  const out = zeroMatrix(n, n);
  for (const draw of draws) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) out[i]![j]! += draw[i]?.[j] ?? 0;
    }
  }
  return out.map((row) => row.map((value) => value / draws.length));
}

function bbnamGlobalErrorTable(object: BbnamDrawResult, title: string): DisplayTable | undefined {
  const em = flattenNumbers(object.em);
  const ep = flattenNumbers(object.ep);
  if (em.length === 0 && ep.length === 0) return undefined;
  const emSummary = quantileSummary(em);
  const epSummary = quantileSummary(ep);
  return {
    title,
    columns: ["e^-", "e^+"],
    rows: ["Min", "1stQ", "Median", "Mean", "3rdQ", "Max"].map((label, index) => ({
      label,
      values: [summaryValueByIndex(emSummary, index), summaryValueByIndex(epSummary, index)],
    })),
  };
}

function bbnamObserverErrorTable(object: BbnamDrawResult, field: "em" | "ep", title: string): DisplayTable | undefined {
  const values = object[field];
  if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) return undefined;
  const matrix = values as number[][];
  return {
    title,
    columns: ["Min", "1stQ", "Median", "Mean", "3rdQ", "Max"],
    rows: object.onames.map((name, observer) => {
      const summary = quantileSummary(matrix.map((row) => row[observer] ?? Number.NaN));
      return { label: name, values: summaryValues(summary) };
    }),
  };
}

function bbnamErrorDistributionPanels(object: BbnamDrawResult, mode: DistributionPlotMode): ModelPlotPanel[] {
  const panels: ModelPlotPanel[] = [];
  const em = flattenNumbers(object.em);
  const ep = flattenNumbers(object.ep);
  if (em.length > 0) {
    const distribution = distributionPlot(em, quantileSummary(em).median, { title: "Estimated Marginal Posterior Density of e^-", xLabel: "e^-", mode });
    panels.push({ id: "em", title: distribution.title, kind: "distribution", distribution, svg: distribution.svg });
  }
  if (ep.length > 0) {
    const distribution = distributionPlot(ep, quantileSummary(ep).median, { title: "Estimated Marginal Posterior Density of e^+", xLabel: "e^+", mode });
    panels.push({ id: "ep", title: distribution.title, kind: "distribution", distribution, svg: distribution.svg });
  }
  return panels;
}

function bbnamObserverDistributionPanels(object: BbnamDrawResult, mode: DistributionPlotMode): ModelPlotPanel[] {
  const panels: ModelPlotPanel[] = [];
  for (const field of ["em", "ep"] as const) {
    const values = object[field];
    if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) continue;
    const matrix = values as number[][];
    for (let observer = 0; observer < object.nobservers; observer += 1) {
      const sample = matrix.map((row) => row[observer] ?? Number.NaN);
      const distribution = distributionPlot(sample, quantileSummary(sample).median, { title: `${field === "em" ? "e^-" : "e^+"} ${object.onames[observer] ?? observer + 1}`, xLabel: field === "em" ? "e^-" : "e^+", mode });
      panels.push({ id: `${field}-${observer}`, title: distribution.title, kind: "distribution", distribution, svg: distribution.svg });
    }
  }
  return panels;
}

function blockMembershipTable(object: BlockmodelResult): DisplayTable {
  const labels = Array.from({ length: object.orderVector.length }, () => "");
  const membership = Array.from({ length: object.orderVector.length }, () => 0);
  for (let index = 0; index < object.orderVector.length; index += 1) {
    const original = object.orderVector[index]!;
    labels[original] = object.plabels[index] ?? String(original + 1);
    membership[original] = object.blockMembership[index]!;
  }
  return {
    columns: labels,
    rows: [{ label: "", values: membership }],
  };
}

function blockMembershipByBlockTable(object: BlockmodelResult): DisplayTable {
  return {
    columns: ["Actors"],
    rows: object.rlabels.map((label, role) => ({
      label,
      values: [object.plabels.filter((_plabel, index) => object.blockMembership[index] === role + 1).join(" ")],
    })),
  };
}

function blockModelDisplayTables(object: BlockmodelResult): DisplayTable[] {
  const stack = isBlockModelStackValue(object.blockModel) ? object.blockModel : [object.blockModel];
  return stack.map((matrix, index) => matrixTable(object.glabels[index] ?? String(index + 1), matrix, object.rlabels, object.rlabels));
}

function blockedDataDisplayTables(object: BlockmodelResult): DisplayTable[] {
  const stack = isMatrixStack(object.blockedData) ? object.blockedData : [object.blockedData];
  return stack.map((matrix, index) => matrixTable(object.glabels[index] ?? String(index + 1), matrix, object.plabels, object.plabels));
}

function matrixTable(
  title: string | undefined,
  matrix: readonly (readonly (number | string | boolean | null)[])[],
  rowNames: readonly string[],
  colNames: readonly string[],
): DisplayTable {
  return {
    ...(title ? { title } : {}),
    columns: colNames,
    rows: matrix.map((row, index) => ({ label: rowNames[index] ?? String(index), values: row })),
  };
}

function quantileTable(title: string | undefined, summary: SummaryQuantiles): DisplayTable {
  return {
    ...(title ? { title } : {}),
    columns: ["Min", "1stQ", "Median", "Mean", "3rdQ", "Max"],
    rows: [{ label: "", values: summaryValues(summary) }],
  };
}

function goodnessTable(values: Record<string, number>): DisplayTable {
  return {
    title: "Goodness of Fit",
    columns: ["Value"],
    rows: Object.entries(values).map(([label, value]) => ({ label, values: [value] })),
  };
}

function formatTable(table: DisplayTable): string {
  const header = ["", ...table.columns];
  const body = table.rows.map((row) => [row.label, ...row.values.map(formatCell)]);
  const widths = header.map((cell, index) => Math.max(String(cell).length, ...body.map((row) => String(row[index] ?? "").length)));
  const lines = [
    ...(table.title ? [table.title] : []),
    header.map((cell, index) => String(cell).padStart(widths[index]!)).join("  ").trimEnd(),
    ...body.map((row) => row.map((cell, index) => String(cell).padStart(widths[index]!)).join("  ").trimEnd()),
  ];
  return lines.join("\n");
}

function formatDiagnostics(values: Readonly<Record<string, number | string | boolean | null>>): string {
  return Object.entries(values)
    .map(([key, value]) => `\t${key}: ${formatCell(value)}`)
    .join("\n");
}

function formatCell(value: number | string | boolean | null): string {
  if (typeof value === "number") return formatNumber(value);
  if (value === null) return "NA";
  return String(value);
}

function formatNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "Inf" : "-Inf";
  if (Object.is(value, -0)) return "0";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e6)) return value.toExponential(6).replace(/\.?0+e/, "e");
  return value.toPrecision(6).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function kernelDensity(values: readonly number[], points = 128): PlotPoint[] | undefined {
  if (values.length < 2) return undefined;
  const sd = stddev(values);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  if (!Number.isFinite(sd) || sd === 0 || minValue === maxValue) return undefined;
  const bandwidth = 1.06 * sd * values.length ** -0.2;
  if (!Number.isFinite(bandwidth) || bandwidth <= 0) return undefined;
  const pad = (maxValue - minValue) * 0.1 || bandwidth * 3;
  const xMin = minValue - pad;
  const xMax = maxValue + pad;
  return Array.from({ length: points }, (_unused, index) => {
    const x = xMin + (index / (points - 1)) * (xMax - xMin);
    const y = values.reduce((acc, value) => acc + Math.exp(-0.5 * ((x - value) / bandwidth) ** 2), 0) / (values.length * bandwidth * Math.sqrt(2 * Math.PI));
    return { x, y };
  });
}

function histogram(values: readonly number[], binCount = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, values.length))))): HistogramBin[] {
  if (values.length === 0) return [];
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const width = maxValue === minValue ? 1 : (maxValue - minValue) / binCount;
  const bins = Array.from({ length: binCount }, (_unused, index) => ({
    x0: minValue + index * width,
    x1: minValue + (index + 1) * width,
    count: 0,
    density: 0,
  }));
  for (const value of values) {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - minValue) / width)));
    bins[index] = { ...bins[index]!, count: bins[index]!.count + 1 };
  }
  return bins.map((bin) => ({ ...bin, density: bin.count / values.length / width }));
}

function distributionSvg(options: { title: string; xLabel: string; observed: number; density?: readonly PlotPoint[]; bins?: readonly HistogramBin[]; width: number; height: number }): string {
  const margin = { left: 56, right: 24, top: 40, bottom: 48 };
  const plotWidth = options.width - margin.left - margin.right;
  const plotHeight = options.height - margin.top - margin.bottom;
  const xValues = options.density ? options.density.map((point) => point.x) : (options.bins ?? []).flatMap((bin) => [bin.x0, bin.x1]);
  const yValues = options.density ? options.density.map((point) => point.y) : (options.bins ?? []).map((bin) => bin.density);
  const xScale = scaleLinear(Math.min(...xValues, options.observed), Math.max(...xValues, options.observed), margin.left, margin.left + plotWidth);
  const yScale = scaleLinear(0, Math.max(...yValues, 1e-12), margin.top + plotHeight, margin.top);
  const content = options.density
    ? `<path d="${options.density.map((point, index) => `${index === 0 ? "M" : "L"}${xScale(point.x).toFixed(2)},${yScale(point.y).toFixed(2)}`).join(" ")}" fill="none" stroke="#2b6cb0" stroke-width="2"/>`
    : (options.bins ?? [])
        .map((bin) => {
          const x = xScale(bin.x0);
          const w = Math.max(1, xScale(bin.x1) - x);
          const y = yScale(bin.density);
          return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${(margin.top + plotHeight - y).toFixed(2)}" fill="#9ecae1" stroke="#2b6cb0"/>`;
        })
        .join("");
  const ox = xScale(options.observed);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" role="img" aria-label="${escapeXml(options.title)}"><rect width="100%" height="100%" fill="white"/><text x="${options.width / 2}" y="24" text-anchor="middle" font-family="sans-serif" font-size="16">${escapeXml(options.title)}</text><line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#222"/><line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#222"/>${content}<line class="observed" x1="${ox.toFixed(2)}" y1="${margin.top}" x2="${ox.toFixed(2)}" y2="${margin.top + plotHeight}" stroke="#d62728" stroke-width="2" stroke-dasharray="5 4"/><text x="${options.width / 2}" y="${options.height - 12}" text-anchor="middle" font-family="sans-serif" font-size="12">${escapeXml(options.xLabel)}</text></svg>`;
}

function withBlockBoundaries(plot: PlotSociomatrixResult, membership: readonly number[]): string {
  const lines: string[] = [];
  for (let index = 1; index < membership.length; index += 1) {
    if (membership[index] === membership[index - 1]) continue;
    const verticalCell = plot.cells.find((cell) => cell.row === 0 && cell.col === index);
    const horizontalCell = plot.cells.find((cell) => cell.row === index && cell.col === 0);
    if (!verticalCell || !horizontalCell) continue;
    const x = verticalCell.x;
    const y = horizontalCell.y;
    const top = Math.min(...plot.cells.map((cell) => cell.y));
    const left = Math.min(...plot.cells.map((cell) => cell.x));
    const right = Math.max(...plot.cells.map((cell) => cell.x + cell.width));
    const bottom = Math.max(...plot.cells.map((cell) => cell.y + cell.height));
    lines.push(
      `<line class="block-boundary" x1="${x.toFixed(2)}" y1="${top.toFixed(2)}" x2="${x.toFixed(2)}" y2="${bottom.toFixed(2)}" stroke="#111" stroke-width="1.5" stroke-dasharray="4 3"/>`,
      `<line class="block-boundary" x1="${left.toFixed(2)}" y1="${y.toFixed(2)}" x2="${right.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#111" stroke-width="1.5" stroke-dasharray="4 3"/>`,
    );
  }
  return plot.svg.replace("</svg>", `${lines.join("")}</svg>`);
}

function dendrogramSvg(cluster: HclustResult, labels: readonly string[], width: number, height: number): { readonly segments: DendrogramSegment[]; readonly svg: string } {
  const n = cluster.labels.length;
  const margin = { left: 36, right: 24, top: 32, bottom: 72 };
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const maxHeight = Math.max(...cluster.height, 0);
  const xByLeaf = new Map<number, number>();
  cluster.order.forEach((leaf, index) => {
    const denom = Math.max(1, n - 1);
    xByLeaf.set(leaf, margin.left + (index / denom) * plotWidth);
  });
  const yScale = scaleLinear(0, maxHeight || 1, margin.top + plotHeight, margin.top);
  const nodes = new Map<number, { readonly x: number; readonly height: number }>();
  for (let leaf = 0; leaf < n; leaf += 1) nodes.set(-(leaf + 1), { x: xByLeaf.get(leaf) ?? margin.left, height: 0 });

  const segments: DendrogramSegment[] = [];
  cluster.merge.forEach(([leftRef, rightRef], index) => {
    const left = nodes.get(leftRef);
    const right = nodes.get(rightRef);
    if (!left || !right) return;
    const nextHeight = cluster.height[index] ?? 0;
    const y = yScale(nextHeight);
    const leftY = yScale(left.height);
    const rightY = yScale(right.height);
    segments.push(
      { x1: left.x, y1: leftY, x2: left.x, y2: y },
      { x1: right.x, y1: rightY, x2: right.x, y2: y },
      { x1: left.x, y1: y, x2: right.x, y2: y },
    );
    nodes.set(index + 1, { x: (left.x + right.x) / 2, height: nextHeight });
  });

  const segmentSvg = segments
    .map((segment) => `<line x1="${segment.x1.toFixed(2)}" y1="${segment.y1.toFixed(2)}" x2="${segment.x2.toFixed(2)}" y2="${segment.y2.toFixed(2)}" stroke="#222" stroke-width="1.5"/>`)
    .join("");
  const labelSvg = cluster.order
    .map((leaf) => {
      const x = xByLeaf.get(leaf) ?? margin.left;
      const label = labels[leaf] ?? cluster.labels[leaf] ?? String(leaf + 1);
      return `<text x="${x.toFixed(2)}" y="${height - 16}" text-anchor="end" transform="rotate(-45 ${x.toFixed(2)} ${height - 16})" font-family="sans-serif" font-size="11">${escapeXml(label)}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Position Clustering"><rect width="100%" height="100%" fill="white"/><text x="${width / 2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="16">Position Clustering</text><line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#222"/><line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#222"/>${segmentSvg}${labelSvg}</svg>`;
  return { segments, svg };
}

function multiPanelSvg(panels: readonly ModelPlotPanel[], width: number, height: number): string {
  const cols = panels.length <= 1 ? 1 : 2;
  const rows = Math.ceil(panels.length / cols);
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const body = panels
    .map((panel, index) => {
      const x = (index % cols) * cellWidth;
      const y = Math.floor(index / cols) * cellHeight;
      return `<g transform="translate(${x},${y})">${panelSvg(panel, cellWidth, cellHeight)}</g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><rect width="100%" height="100%" fill="white"/>${body}</svg>`;
}

function panelSvg(panel: ModelPlotPanel, width: number, height: number): string {
  if (panel.kind === "distribution" && panel.distribution) return inlineForeignSvg(panel.distribution.svg, width, height);
  if (panel.kind === "sociomatrix" && panel.sociomatrix) return inlineForeignSvg(panel.sociomatrix.svg, width, height);
  if (panel.kind === "network" && panel.network) return inlineForeignSvg(panel.network.svg, width, height);
  const margin = { left: 44, right: 16, top: 32, bottom: 32 };
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const points = panel.points ?? panel.lines?.flat() ?? [];
  const xVals = points.map((point) => point.x);
  const yVals = points.map((point) => point.y);
  const xScale = scaleLinear(Math.min(...xVals, 0), Math.max(...xVals, 1), margin.left, margin.left + plotWidth);
  const yScale = scaleLinear(Math.min(...yVals, 0), Math.max(...yVals, 1), margin.top + plotHeight, margin.top);
  const lineSvg = (panel.lines ?? [])
    .map((line, index) => `<path d="${line.map((point, i) => `${i === 0 ? "M" : "L"}${xScale(point.x).toFixed(2)},${yScale(point.y).toFixed(2)}`).join(" ")}" fill="none" stroke="${index === 0 ? "#222" : "#999"}" stroke-width="1.5" stroke-dasharray="${index === 0 ? "" : "4 3"}"/>`)
    .join("");
  const pointSvg = (panel.points ?? []).map((point) => `<circle cx="${xScale(point.x).toFixed(2)}" cy="${yScale(point.y).toFixed(2)}" r="2.5" fill="#2b6cb0"/>`).join("");
  const tableSvg = panel.table ? `<text x="${margin.left}" y="${margin.top + 22}" font-family="monospace" font-size="10">${escapeXml(panel.table.rows.slice(0, 6).map((row) => `${row.label}: ${row.values.map(formatCell).join(", ")}`).join(" | "))}</text>` : "";
  return `<rect width="${width}" height="${height}" fill="white"/><text x="${width / 2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="13">${escapeXml(panel.title)}</text><line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#222"/><line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#222"/>${lineSvg}${pointSvg}${tableSvg}`;
}

function inlineForeignSvg(svg: string, width: number, height: number): string {
  const data = `data:image/svg+xml;base64,${btoaSafe(svg)}`;
  return `<image href="${data}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
}

function btoaSafe(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = Array.from(value).map((char) => char.charCodeAt(0) & 0xff);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triplet = (a << 16) | (b << 8) | c;
    out += alphabet[(triplet >> 18) & 63];
    out += alphabet[(triplet >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? alphabet[triplet & 63] : "=";
  }
  return out;
}

function qqPoints(values: readonly number[]): PlotPoint[] {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  return sorted.map((value, index) => ({ x: inverseNormalCdf((index + 0.5) / sorted.length), y: value }));
}

function twoPointLine(xs: readonly number[], ys: readonly number[], slope: number, intercept: number): readonly [PlotPoint, PlotPoint] {
  const lo = Math.min(...xs, ...ys);
  const hi = Math.max(...xs, ...ys);
  return [
    { x: lo, y: intercept + slope * lo },
    { x: hi, y: intercept + slope * hi },
  ];
}

function horizontalLine(xs: readonly number[], y: number): readonly [PlotPoint, PlotPoint] {
  return [
    { x: Math.min(...xs), y },
    { x: Math.max(...xs), y },
  ];
}

function scaleLinear(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): (value: number) => number {
  const minValue = Number.isFinite(domainMin) ? domainMin : 0;
  const maxValue = Number.isFinite(domainMax) ? domainMax : 1;
  const span = maxValue === minValue ? 1 : maxValue - minValue;
  return (value) => rangeMin + ((value - minValue) / span) * (rangeMax - rangeMin);
}

function summaryValues(summary: SummaryQuantiles): number[] {
  return [summary.min, summary.firstQuartile, summary.median, summary.mean, summary.thirdQuartile, summary.max];
}

function summaryValueByIndex(summary: SummaryQuantiles, index: number): number {
  return summaryValues(summary)[index] ?? Number.NaN;
}

function flattenNumbers(value: BbnamDrawResult["em"] | BbnamDrawResult["ep"]): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => (Array.isArray(entry) ? entry : [entry])).filter(Number.isFinite);
}

function finiteMax(values: readonly number[] | undefined): number | null {
  const finite = values?.filter(Number.isFinite) ?? [];
  return finite.length === 0 ? null : Math.max(...finite);
}

function finiteMedian(values: readonly number[] | undefined): number | null {
  const finite = values?.filter(Number.isFinite) ?? [];
  return finite.length === 0 ? null : quantileSummary(finite).median;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? Number.NaN : sum(values) / values.length;
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function stddev(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return 0;
  const avg = mean(finite);
  return Math.sqrt(sum(finite.map((value) => (value - avg) ** 2)) / (finite.length - 1));
}

function quantileSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0]!;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const frac = index - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax));
  return sign * y;
}

function inverseNormalCdf(p: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

function fCdf(value: number, df1: number, df2: number): number {
  if (value <= 0) return 0;
  const x = (df1 * value) / (df1 * value + df2);
  return regularizedBeta(x, df1 / 2, df2 / 2);
}

function chiSquareCdf(value: number, df: number): number {
  if (value <= 0) return 0;
  return regularizedGammaP(df / 2, value / 2);
}

function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let sumValue = 1 / a;
    let del = sumValue;
    for (let n = 1; n <= 100; n += 1) {
      ap += 1;
      del *= x / ap;
      sumValue += del;
      if (Math.abs(del) < Math.abs(sumValue) * 1e-12) break;
    }
    return sumValue * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 100; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(x, a, b)) / a;
  return 1 - (bt * betaContinuedFraction(1 - x, b, a)) / b;
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const maxIterations = 200;
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
  const p = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = 0.9999999999998099;
  const zz = z - 1;
  for (let i = 0; i < p.length; i += 1) x += p[i]! / (zz + i + 1);
  const t = zz + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

function zeroMatrix(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

function weightedMatrixSum(stack: readonly (readonly (readonly number[])[])[], weights: readonly number[]): number[][] {
  if (stack.length === 0) return [];
  const n = stack[0]!.length;
  const out = zeroMatrix(n, n);
  for (let k = 0; k < stack.length; k += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) out[i]![j]! += (weights[k] ?? 0) * (stack[k]?.[i]?.[j] ?? 0);
    }
  }
  return out;
}

function subtractFromIdentity(matrix: readonly (readonly number[])[]): number[][] {
  return matrix.map((row, i) => row.map((value, j) => (i === j ? 1 : 0) - value));
}

function addMatrices(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): number[][] {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_unused, i) => Array.from({ length: n }, (_unused2, j) => (a[i]?.[j] ?? 0) + (b[i]?.[j] ?? 0)));
}

function inverse(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  const aug = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_unused, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(aug[row]![col]!) > Math.abs(aug[pivot]![col]!)) pivot = row;
    if (Math.abs(aug[pivot]![col]!) < 1e-12) return zeroMatrix(n, n).map((row) => row.map(() => Number.NaN));
    [aug[col], aug[pivot]] = [aug[pivot]!, aug[col]!];
    const div = aug[col]![col]!;
    for (let j = 0; j < 2 * n; j += 1) aug[col]![j]! /= div;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = aug[row]![col]!;
      for (let j = 0; j < 2 * n; j += 1) aug[row]![j]! -= factor * aug[col]![j]!;
    }
  }
  return aug.map((row) => row.slice(n));
}

function joinLines(lines: readonly string[]): string {
  return `${lines.join("\n")}`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isMatrixStack(value: number[][] | number[][][]): value is number[][][] {
  return Array.isArray(value[0]?.[0]);
}

function isBlockModelStackValue(value: BlockCell[][] | BlockCell[][][]): value is BlockCell[][][] {
  return Array.isArray(value[0]?.[0]);
}

function isGraphTestSummary(value: GraphTestSummaryResult | GraphTestResult): value is GraphTestSummaryResult {
  return typeof (value as GraphTestSummaryResult).distributionSummary === "object";
}

function isBlockmodelSummary(value: BlockmodelSummaryResult | BlockmodelResult): value is BlockmodelSummaryResult {
  return (value as BlockmodelSummaryResult).type === "summary.blockmodel";
}

function isBrokerageSummary(value: BrokerageSummaryResult | BrokerageResult): value is BrokerageSummaryResult {
  return (value as BrokerageSummaryResult).type === "summary.brokerage";
}

function isNetcancorSummary(value: NetcancorSummaryResult | NetcancorResult): value is NetcancorSummaryResult {
  return (value as NetcancorSummaryResult).type === "summary.netcancor";
}

function isNetlmSummary(value: NetlmSummaryResult | NetlmResult): value is NetlmSummaryResult {
  return (value as NetlmSummaryResult).type === "summary.netlm";
}

function isNetlogitSummary(value: NetlogitSummaryResult | NetlogitResult | PstarResult): value is NetlogitSummaryResult {
  return (value as NetlogitSummaryResult).type === "summary.netlogit" || (value as NetlogitSummaryResult).type === "summary.pstar";
}

function isLnamSummary(value: LnamSummaryResult | LnamResult): value is LnamSummaryResult {
  return (value as LnamSummaryResult).type === "summary.lnam";
}

function isBnSummary(value: BnSummaryResult | BnResult): value is BnSummaryResult {
  return (value as BnSummaryResult).type === "summary.bn";
}

function isBbnamSummary(value: BbnamSummaryResult | BbnamDrawResult): value is BbnamSummaryResult {
  return String((value as BbnamSummaryResult).type).startsWith("summary.bbnam");
}

function isBayesFactorSummary(value: BayesFactorSummaryResult | BbnamBfResult): value is BayesFactorSummaryResult {
  return (value as BayesFactorSummaryResult).type === "summary.bayes.factor";
}
