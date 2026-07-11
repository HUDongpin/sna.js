export type {
  ComponentResult,
  DenseGraph,
  EdgeListInput,
  EdgeTuple,
  GeodistResult,
  GraphInput,
  GraphMode,
  GraphOptions,
  MatrixLike,
} from "./core/types";

export { createNumberMatrix, toNestedMatrix } from "./core/matrix";
export { denseGraphToMatrix, hasTie, isDenseGraph, isEdgeListInput, isMissingTie, makeDenseGraph, neighbors, tieWeight } from "./core/graph";
export { createSeededRng } from "./core/random";
export type { RandomOptions, RandomSource } from "./core/random";
export { betweenness } from "./algorithms/betweenness";
export type { BetweennessMode, BetweennessOptions } from "./algorithms/betweenness";
export { bonpow } from "./algorithms/bonpow";
export type { BonpowOptions } from "./algorithms/bonpow";
export { centralization } from "./algorithms/centralization";
export type { CentralityFunction, CentralizationMeasureName, CentralizationOptions } from "./algorithms/centralization";
export { closeness } from "./algorithms/closeness";
export type { ClosenessMode, ClosenessOptions } from "./algorithms/closeness";
export { components, isConnected } from "./algorithms/components";
export type { ComponentsOptions } from "./algorithms/components";
export { componentDist, componentLargest, componentSizeByVertex, neighborhood, reachability } from "./algorithms/connectivity";
export type {
  ComponentDistOptions,
  ComponentDistributionResult,
  ComponentLargestOptions,
  Connectedness,
  NeighborhoodOptions,
  NeighborhoodType,
  ReachabilityOptions,
} from "./algorithms/connectivity";
export {
  addIsolates,
  asEdgelistSna,
  asSociomatrixSna,
  diagRemove,
  egoExtract,
  event2dichot,
  gt,
  gvectorize,
  intervalGraph,
  isEdgelistSna,
  lowerTriRemove,
  makeStochastic,
  sr2css,
  stackcount,
  symmetrize,
  upperTriRemove,
} from "./algorithms/dataprep";
export type {
  AddIsolatesOptions,
  AsEdgelistOptions,
  AsSociomatrixOptions,
  DataPrepInput,
  EdgelistResult,
  EgoExtractOptions,
  EgoNeighborhood,
  Event2DichotMethod,
  Event2DichotOptions,
  GtOptions,
  GVectorizeOptions,
  GraphStackInput,
  IntervalGraphOptions,
  IntervalGraphResult,
  IntervalGraphType,
  MakeStochasticOptions,
  MatrixStack,
  RemoveOptions,
  SnaEdge,
  SnaEdgeList,
  SociomatrixResult,
  Spell,
  SpellListInput,
  StochasticMode,
  SymmetrizeOptions,
  SymmetrizeRule,
} from "./algorithms/dataprep";
export { degree } from "./algorithms/degree";
export type { DegreeMode, DegreeOptions } from "./algorithms/degree";
export { evcent } from "./algorithms/evcent";
export type { EvcentOptions } from "./algorithms/evcent";
export { flowbet } from "./algorithms/flowbet";
export type { FlowBetweennessMode, FlowBetweennessOptions } from "./algorithms/flowbet";
export { gden, nties } from "./algorithms/density";
export { geodist } from "./algorithms/geodist";
export type { GeodistOptions } from "./algorithms/geodist";
export { readDot, readNos, writeDl, writeNos } from "./algorithms/fileio";
export type { ReadDotOptions, ReadDotResult, ReadNosOptions, WriteDlOptions, WriteNosOptions } from "./algorithms/fileio";
export { gilschmidt } from "./algorithms/gilschmidt";
export type { GilSchmidtOptions } from "./algorithms/gilschmidt";
export { graphcent } from "./algorithms/graphcent";
export type { GraphCentralityMode, GraphCentralityOptions } from "./algorithms/graphcent";
export { connectedness, dyadCensus, efficiency, grecip, gtrans, hierarchy, lubness, mutuality } from "./algorithms/graphStatistics";
export type {
  DyadCensusOptions,
  DyadCensusResult,
  EfficiencyOptions,
  HierarchyMeasure,
  HierarchyOptions,
  LubnessOptions,
  ReciprocityMeasure,
  ReciprocityOptions,
  TransitivityMeasure,
  TransitivityOptions,
} from "./algorithms/graphStatistics";
export { infocent } from "./algorithms/infocent";
export type { InfocentOptions } from "./algorithms/infocent";
export { loadcent } from "./algorithms/loadcent";
export type { LoadCentralityMode, LoadCentralityOptions } from "./algorithms/loadcent";
export {
  centralgraph,
  gclustBoxstats,
  gclustCentralgraph,
  gcor,
  gcov,
  gscor,
  gscov,
  hdist,
  sdmat,
  structdist,
} from "./algorithms/graphComparison";
export type {
  BoxStats,
  CentralGraphOptions,
  ClusterInput,
  ClusterObject,
  ExchangeList,
  GclustBoxstatsResult,
  GraphComparisonInput,
  GraphComparisonMethod,
  GraphPairOptions,
  HdistOptions,
  SdmatOptions,
  SdmatOutput,
  StructuralComparisonOptions,
  StructdistOptions,
} from "./algorithms/graphComparison";
export { cugTest, cugtest, qaptest } from "./algorithms/graphTests";
export type { CugTestOptions, CugTestResult, CugTestStatistic, CugtestOptions, CugtestResult, GraphTestData, GraphTestResult, GraphTestStatistic, QaptestOptions } from "./algorithms/graphTests";
export { gapply, gliop, graphComposition, logMean, logSub, logSum } from "./algorithms/operators";
export type { GapplyFunction, GapplyMargin, GapplyNeighborhood, GapplyOptions, GapplyStats, GliopOperator, GliopOptions, LogSpaceEmpty } from "./algorithms/operators";
export {
  bbnam,
  bbnamActor,
  bbnamBf,
  bbnamFixed,
  bbnamJntlik,
  bbnamJntlikSlice,
  bbnamPooled,
  bbnamProbtie,
  bn,
  bnDyadStats,
  bnNlplDyad,
  bnNlplEdge,
  bnNlplTriad,
  bnNltl,
  bnPtriad,
  bnTriadStats,
  brokerage,
  coefBn,
  coefLnam,
  consensus,
  evalEdgeperturbation,
  lnam,
  nacf,
  netcancor,
  netlm,
  netlogit,
  npostpred,
  potscaleredMcmc,
  pstar,
  seLnam,
} from "./algorithms/models";
export type {
  BbnamBfOptions,
  BbnamBfResult,
  BbnamDrawResult,
  BbnamFixedOptions,
  BbnamMcmcOptions,
  BbnamOptions,
  BrokerageClass,
  BrokerageResult,
  BnDyadStat,
  BnMethod,
  BnOptions,
  BnParameters,
  BnResult,
  ConsensusMetadata,
  ConsensusMethod,
  ConsensusOptions,
  ConsensusResult,
  LnamNullModel,
  LnamOptions,
  LnamResult,
  NacfOptions,
  NacfType,
  NetcancorNull,
  NetcancorOptions,
  NetcancorResult,
  NetlmOptions,
  NetlmResult,
  NetlmTestStatistic,
  NetlogitOptions,
  NetlogitResult,
  NetlogitTestStatistic,
  NetworkRegressionNull,
  NetworkRegressionResult,
  PstarEffect,
  PstarOptions,
  PstarResult,
} from "./algorithms/models";
export { DIRECTED_TRIAD_CLASSES, triadCensus, triadClassify } from "./algorithms/triads";
export type {
  DirectedTriadCensusResult,
  DirectedTriadClass,
  TriadCensusResult,
  TriadClass,
  TriadOptions,
  TriadVertices,
  UndirectedTriadCensusResult,
  UndirectedTriadClass,
} from "./algorithms/triads";
export { isolates, isIsolate } from "./algorithms/isolates";
export type { IsolateOptions } from "./algorithms/isolates";
export { prestige } from "./algorithms/prestige";
export type { PrestigeMode, PrestigeOptions } from "./algorithms/prestige";
export { stresscent } from "./algorithms/stresscent";
export type { StressCentralityMode, StressCentralityOptions } from "./algorithms/stresscent";
export { labOptimize, labOptimizeAnneal, labOptimizeExhaustive, labOptimizeGumbel, labOptimizeHillclimb, labOptimizeMc, numperm, rmperm, rperm } from "./algorithms/permutation";
export type { ExchangeLabel, LabOptimizeExchangeList, LabOptimizeFunction, LabOptimizeMethod, LabOptimizeOptions, LabOptimizeSeek, MatrixPermutationOptions, PermutationOptions } from "./algorithms/permutation";
export { rewireUd, rewireWs, rgbn, rgnm, rgnmix, rgraph, rguman, rgws } from "./algorithms/randomGraph";
export type {
  ProbabilityMatrix,
  ProbabilityStack,
  RandomGraphResult,
  RewireOptions,
  RgbnOptions,
  RgbnParameters,
  RgbnResult,
  RgnmOptions,
  RgnmixOptions,
  RgnmixType,
  RgraphOptions,
  RgumanOptions,
  RgwsOptions,
  TieList,
  TieProbability,
} from "./algorithms/randomGraph";
export { blockmodel, blockmodelExpand, equivClust, redist, sedist } from "./algorithms/roles";
export type {
  BlockCell,
  BlockContent,
  BlockmodelExpandOptions,
  BlockmodelOptions,
  BlockmodelResult,
  BlockModelMatrix,
  BlockModelStack,
  EquivClustOptions,
  EquivClustResult,
  EquivDistanceFunction,
  HclustMethod,
  HclustResult,
  RedistMethod,
  RedistOptions,
  RoleGraphInput,
  SedistMethod,
  SedistOptions,
} from "./algorithms/roles";
export {
  bicomponentDist,
  cliqueCensus,
  cutpoints,
  kcores,
  kcycleCensus,
  kpathCensus,
  maxflow,
  simmelian,
  structureStatistics,
} from "./algorithms/structural";
export type {
  BicomponentDistOptions,
  BicomponentDistResult,
  BicomponentSymmetrizeRule,
  CliqueCensusOptions,
  CliqueCensusResult,
  ComembershipMode,
  CutpointConnectedness,
  CutpointsOptions,
  KcoreMode,
  KCoresOptions,
  KCycleCensusOptions,
  KCycleCensusResult,
  KPathCensusOptions,
  KPathCensusResult,
  MaxflowOptions,
  SimmelianOptions,
  StructureStatisticsOptions,
} from "./algorithms/structural";
/**
 * @deprecated Root re-exports of the display helpers are kept for
 * compatibility with 0.1.x; import from "@peterhudongpin/sna.js/display"
 * instead. They will be removed from the root entry in a future minor.
 */
export * from "./display";
/**
 * @deprecated Import from "@peterhudongpin/sna.js/compat" instead; kept at
 * the root for compatibility with 0.1.x.
 */
export { onAttach, onLoad } from "./compat/packageHooks";
export type { AttachOptions } from "./compat/packageHooks";
/**
 * @deprecated Import from "@peterhudongpin/sna.js/compat" instead; kept at
 * the root for compatibility with 0.1.x.
 */
export { snaR } from "./compat/rNames";
