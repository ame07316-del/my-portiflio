"use client";

import dynamic from "next/dynamic";

const Preloader = dynamic(() => import("./Preloader"), { ssr: false });

export default function PreloaderMount(props: {
  phases: string[];
  enterLabel: string;
  hint: string;
}) {
  return <Preloader {...props} />;
}
