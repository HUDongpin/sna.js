import type { GraphInput, GraphOptions } from "../core/types";
import { betweenness } from "./betweenness";
import { bonpow } from "./bonpow";
import { closeness } from "./closeness";
import { degree } from "./degree";
import { evcent } from "./evcent";
import { flowbet } from "./flowbet";
import { gilschmidt } from "./gilschmidt";
import { graphcent } from "./graphcent";
import { infocent } from "./infocent";
import { loadcent } from "./loadcent";
import { prestige } from "./prestige";
import { stresscent } from "./stresscent";

export type CentralizationMeasureName =
  | "betweenness"
  | "bonpow"
  | "closeness"
  | "degree"
  | "evcent"
  | "flowbet"
  | "gilschmidt"
  | "graphcent"
  | "infocent"
  | "loadcent"
  | "prestige"
  | "stresscent";

export type CentralityFunction = (input: GraphInput, options?: Record<string, unknown>) => number[] | number;

export interface CentralizationOptions extends GraphOptions {
  readonly normalize?: boolean;
  readonly measureOptions?: Record<string, unknown>;
  readonly theoreticalMaxDeviation?: number;
}

const CENTRALITY_FUNCTIONS: Record<CentralizationMeasureName, CentralityFunction> = {
  betweenness: betweenness as CentralityFunction,
  bonpow: bonpow as CentralityFunction,
  closeness: closeness as CentralityFunction,
  degree: degree as CentralityFunction,
  evcent: evcent as CentralityFunction,
  flowbet: flowbet as CentralityFunction,
  gilschmidt: gilschmidt as CentralityFunction,
  graphcent: graphcent as CentralityFunction,
  infocent: infocent as CentralityFunction,
  loadcent: loadcent as CentralityFunction,
  prestige: prestige as CentralityFunction,
  stresscent: stresscent as CentralityFunction,
};

export function centralization(input: GraphInput, measure: CentralizationMeasureName | CentralityFunction, options: CentralizationOptions = {}): number {
  const fn = typeof measure === "string" ? CENTRALITY_FUNCTIONS[measure] : measure;
  if (!fn) throw new RangeError("unknown centrality measure");

  const measureOptions = {
    ...(options.measureOptions ?? {}),
    mode: options.mode ?? "digraph",
    diag: options.diag ?? false,
    ...(typeof options.directed === "boolean" ? { directed: options.directed } : {}),
  };
  const valuesResult = fn(input, measureOptions);
  if (!Array.isArray(valuesResult)) throw new TypeError("centralization measure must return nodal centrality scores");

  const maximum = Math.max(...valuesResult);
  const observed = valuesResult.reduce((sum, value) => sum + maximum - value, 0);
  if (options.normalize === false) return observed;

  const theoreticalMaxDeviation =
    options.theoreticalMaxDeviation ??
    (() => {
      const result = fn(input, { ...measureOptions, tmaxdev: true });
      if (typeof result !== "number") throw new TypeError("normalized centralization requires a theoretical maximum deviation");
      return result;
    })();

  return theoreticalMaxDeviation === 0 ? 0 : observed / theoreticalMaxDeviation;
}
