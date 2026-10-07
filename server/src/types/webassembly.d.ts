/**
 * Minimal WebAssembly ambient types for the server build (no DOM lib).
 * Covers exactly what runtime/wasm-core.ts consumes — nothing wider.
 */
declare namespace WebAssembly {
  interface Memory {
    readonly buffer: ArrayBuffer;
    grow(pages: number): number;
  }
  interface Module {}
  interface Instance {
    readonly exports: Record<string, unknown>;
  }
  const Module: {
    new (bytes: Uint8Array<ArrayBuffer> | ArrayBuffer): Module;
  };
  const Instance: {
    new (module: Module, imports?: Record<string, unknown>): Instance;
  };
  function instantiateStreaming(
    source: Promise<Response> | Response,
    imports?: Record<string, unknown>,
  ): Promise<{ module: Module; instance: Instance }>;
}
