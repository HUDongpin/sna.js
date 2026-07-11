export type RandomSource = () => number;

export interface RandomOptions {
  readonly seed?: number | string;
  readonly rng?: RandomSource;
}

export function createSeededRng(seed: number | string): RandomSource {
  let state = seedToUint32(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

export function resolveRandomSource(options: RandomOptions = {}): RandomSource {
  const source = options.rng ?? (options.seed !== undefined ? createSeededRng(options.seed) : Math.random);
  return () => {
    const value = source();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("rng must return finite values in [0, 1)");
    }
    return value;
  };
}

export function assertProbability(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be a probability in [0, 1]`);
  }
}

export function randomInt(rng: RandomSource, upperExclusive: number): number {
  if (!Number.isInteger(upperExclusive) || upperExclusive <= 0) {
    throw new RangeError("upperExclusive must be a positive integer");
  }
  return Math.floor(rng() * upperExclusive);
}

export function binomial(trials: number, probability: number, rng: RandomSource): number {
  if (!Number.isInteger(trials) || trials < 0) throw new RangeError("trials must be a non-negative integer");
  assertProbability(probability, "probability");
  if (probability === 0 || trials === 0) return 0;
  if (probability === 1) return trials;

  let count = 0;
  for (let draw = 0; draw < trials; draw += 1) {
    if (rng() < probability) count += 1;
  }
  return count;
}

export function shuffleInPlace<T>(values: T[], rng: RandomSource): T[] {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, i + 1);
    const temp = values[i]!;
    values[i] = values[j]!;
    values[j] = temp;
  }
  return values;
}

export function shuffled<T>(values: readonly T[], rng: RandomSource): T[] {
  return shuffleInPlace([...values], rng);
}

export function sampleWithoutReplacement(populationSize: number, count: number, rng: RandomSource): number[] {
  if (!Number.isInteger(populationSize) || populationSize < 0) {
    throw new RangeError("populationSize must be a non-negative integer");
  }
  if (!Number.isInteger(count) || count < 0 || count > populationSize) {
    throw new RangeError("count must be an integer in [0, populationSize]");
  }

  const values = Array.from({ length: populationSize }, (_unused, index) => index);
  for (let i = 0; i < count; i += 1) {
    const j = i + randomInt(rng, populationSize - i);
    const temp = values[i]!;
    values[i] = values[j]!;
    values[j] = temp;
  }
  return values.slice(0, count);
}

function seedToUint32(seed: number | string): number {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) throw new RangeError("seed must be a finite number or string");
    return Math.trunc(seed) >>> 0;
  }

  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
