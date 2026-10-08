"use client";

import dynamic from "next/dynamic";

// Uses saved data from this browser, so it renders on the client only.
const ResultView = dynamic(() => import("@/components/ResultView"), { ssr: false });

export default function Page() {
  return <ResultView />;
}
