"use client";

import { useEffect, useState } from "react";

/** True once the WebGL preloader has finished (or immediately on repeat visits). */
export function useEntered() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const done = () => setEntered(true);
    window.addEventListener("pf:entered", done);
    // Safety net: if the preloader never signals (no WebGL, blocked canvas, a
    // crash inside <Canvas>), the hero must still appear. Revealing it early is
    // harmless — the preloader overlay sits above it at z-100.
    const t = setTimeout(done, 2500);
    return () => {
      window.removeEventListener("pf:entered", done);
      clearTimeout(t);
    };
  }, []);
  return entered;
}
