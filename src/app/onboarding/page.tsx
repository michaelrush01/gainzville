"use client";

import dynamic from "next/dynamic";

// Reads any saved plan from this browser, so it renders on the client only.
const OnboardingView = dynamic(() => import("@/components/OnboardingView"), { ssr: false });

export default function Page() {
  return <OnboardingView />;
}
