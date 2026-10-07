/**
 * core/bounds.ts — global memory & message budgets.
 *
 * Every allocation path in the system checks these bounds BEFORE allocating
 * (Invariant #4): untrusted length prefixes, array sizes and string byte
 * counts are rejected before any memory is reserved — an OOM attack must be
 * impossible from malformed input.
 */

/** Hard cap for one wire message (worker <-> main thread). 1 MiB. */
export const MAX_MESSAGE_BYTES = 1 << 20;

/** Hard cap for a single UTF-8 string crossing a trust boundary. 256 KiB. */
export const MAX_STRING_BYTES = 1 << 18;

/** Hard cap for array element counts crossing a trust boundary. */
export const MAX_ARRAY_ITEMS = 1 << 16;

/** Max records kept in one LWW collection (portfolio-scale, bounded by design). */
export const MAX_LIST_RECORDS = 4096;

/**
 * Aggregate allocation budget for validated payloads per operation
 * (64 MiB). Parsers multiply element count × element budget and refuse
 * anything above this before touching the heap.
 */
export const ALLOCATION_BUDGET_BYTES = 64 << 20;

/** Main-thread frame budget in ms (60fps target; half of it to be safe). */
export const FRAME_BUDGET_MS = 8;

/** WASM linear memory budget: 256 pages × 64 KiB = 16 MiB (matches module max). */
export const WASM_MEMORY_BUDGET_BYTES = 256 * 65536;
