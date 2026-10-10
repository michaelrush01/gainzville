"use client";

import dynamic from "next/dynamic";

// Moderation needs the signed-in session from this browser, so it renders on the client only.
const AdminView = dynamic(() => import("@/components/AdminView"), { ssr: false });

export default function Page() {
  return <AdminView />;
}
