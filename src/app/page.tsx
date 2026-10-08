"use client";

import dynamic from "next/dynamic";

// Uses saved data from this browser, so it renders on the client only.
const HomeView = dynamic(() => import("@/components/HomeView"), { ssr: false });

export default function Page() {
  return <HomeView />;
}
