"use client";

import dynamic from "next/dynamic";

// Sign-in state lives in this browser, so the page renders on the client only.
const AccountView = dynamic(() => import("@/components/AccountView"), { ssr: false });

export default function Page() {
  return <AccountView />;
}
