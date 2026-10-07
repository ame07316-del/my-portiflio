/**
 * core/validate.ts — zero-dependency, strict schema validation.
 *
 * Role in the system: this is the Zod stand-in (the stack is dependency-free
 * by sovereign decree). Every value crossing a trust boundary (wire message,
 * IndexedDB snapshot, user input) is parsed here BEFORE any structure is
 * allocated from it — bounds are checked on the *declared* sizes first, so a
 * forged 0xFFFFFFFF length prefix costs O(1), not 4 GiB.
 *
 * Complexity (per parse): Time O(size of input), Space O(1) extra beyond
 * the produced (bounded) output — string byte-length is counted in place,
 * no throwaway UTF-8 buffers are allocated during validation.
 */

import { MAX_ARRAY_ITEMS, MAX_STRING_BYTES } from './bounds.js';

export class ValidationFailure extends Error {
  constructor(
    public readonly path: string,
    public readonly code: string,
    message: string,
  ) {
    super(`[${path}] ${code}: ${message}`);
    this.name = 'ValidationFailure';
  }
}

export interface Schema<T> {
  /** Parse or throw `ValidationFailure`. @complexity Time O(input), Space O(1) extra. */
  parse(input: unknown, path?: string): T;
}

/**
 * UTF-8 byte length without allocating an encoded copy.
 * @complexity Time O(s.length), Space O(1).
 */
export function utf8ByteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i) as number;
    n += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (cp > 0xffff) i++; // skip trailing surrogate of an astral pair
  }
  return n;
}

export function str(opts: { maxBytes: number; minBytes?: number }): Schema<string> {
  if (opts.maxBytes > MAX_STRING_BYTES) {
    throw new ValidationFailure('$schema', 'BOUNDS', 'maxBytes exceeds MAX_STRING_BYTES');
  }
  return {
    parse(input, path = '$') {
      if (typeof input !== 'string') throw new ValidationFailure(path, 'TYPE', 'expected string');
      const bytes = utf8ByteLength(input);
      if (bytes > opts.maxBytes) {
        throw new ValidationFailure(path, 'MAX_BYTES', `${bytes} > ${opts.maxBytes}`);
      }
      if (opts.minBytes !== undefined && bytes < opts.minBytes) {
        throw new ValidationFailure(path, 'MIN_BYTES', `${bytes} < ${opts.minBytes}`);
      }
      return input;
    },
  };
}

export function num(opts: { min: number; max: number }): Schema<number> {
  return {
    parse(input, path = '$') {
      if (typeof input !== 'number' || !Number.isFinite(input)) {
        throw new ValidationFailure(path, 'TYPE', 'expected finite number');
      }
      if (input < opts.min || input > opts.max) {
        throw new ValidationFailure(path, 'RANGE', `${input} outside [${opts.min}, ${opts.max}]`);
      }
      return input;
    },
  };
}

export function int32(opts: { min: number; max: number }): Schema<number> {
  const inner = num(opts);
  return {
    parse(input, path = '$') {
      const v = inner.parse(input, path);
      if (!Number.isInteger(v)) throw new ValidationFailure(path, 'INT', 'expected integer');
      return v;
    },
  };
}

export function bool(): Schema<boolean> {
  return {
    parse(input, path = '$') {
      if (typeof input !== 'boolean') throw new ValidationFailure(path, 'TYPE', 'expected boolean');
      return input;
    },
  };
}

export function literal<T extends string>(value: T): Schema<T> {
  return {
    parse(input, path = '$') {
      if (input !== value) throw new ValidationFailure(path, 'LITERAL', `expected "${value}"`);
      return value;
    },
  };
}

/**
 * Bounded array: the declared/observed length is checked against `maxItems`
 * BEFORE the result array is allocated.
 * @complexity Time O(n), Space O(n) for the (bounded) result only.
 */
export function arr<T>(item: Schema<T>, opts: { maxItems: number }): Schema<T[]> {
  if (opts.maxItems > MAX_ARRAY_ITEMS) {
    throw new ValidationFailure('$schema', 'BOUNDS', 'maxItems exceeds MAX_ARRAY_ITEMS');
  }
  return {
    parse(input, path = '$') {
      if (!Array.isArray(input)) throw new ValidationFailure(path, 'TYPE', 'expected array');
      if (input.length > opts.maxItems) {
        throw new ValidationFailure(path, 'MAX_ITEMS', `${input.length} > ${opts.maxItems}`);
      }
      const out: T[] = new Array(input.length);
      for (let i = 0; i < input.length; i++) {
        out[i] = item.parse(input[i], `${path}[${i}]`);
      }
      return out;
    },
  };
}

type Shape = Record<string, Schema<unknown>>;
type ObjOf<S extends Shape> = { [K in keyof S]: S[K] extends Schema<infer T> ? T : never };

/**
 * Object schema. Unknown extra keys are ignored (forward compatibility),
 * missing required keys fail fast. @complexity Time O(fields), Space O(fields).
 */
export function obj<S extends Shape>(shape: S): Schema<ObjOf<S>> {
  const keys = Object.keys(shape);
  return {
    parse(input, path = '$') {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new ValidationFailure(path, 'TYPE', 'expected object');
      }
      const src = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of keys) {
        const schema = shape[k];
        if (schema === undefined) continue;
        out[k] = schema.parse(src[k], `${path}.${k}`);
      }
      return out as ObjOf<S>;
    },
  };
}

/** Union of string literals, validated in O(1) via Set membership. */
export function oneOf<T extends string>(values: readonly T[]): Schema<T> {
  const set = new Set<string>(values);
  return {
    parse(input, path = '$') {
      if (typeof input !== 'string' || !set.has(input)) {
        throw new ValidationFailure(path, 'ONE_OF', `expected one of ${values.join('|')}`);
      }
      return input as T;
    },
  };
}
