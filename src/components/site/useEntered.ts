"use client";

import { useEffect, useState } from "react";

/** True once the WebGL preloader has finished (or immediately on repeat visits). */
export function useEntered() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const done = () => setEntered(true);
    window.addEventListener("pf:entered", done);
    const t = setTimeout(done, 9000); // safety net
    return () => {
      window.removeEventListener("pf:entered", done);
      clearTimeout(t);
    };
  }, []);
  return entered;
}
