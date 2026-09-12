import { NextResponse } from "next/server";
import { getStore, isDemoMode } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDemoMode()) {
    return NextResponse.json(
      { error: "Reset only exists in demo mode. Locally, re-run npm run seed." },
      { status: 400 },
    );
  }
  const store = await getStore();
  await store.reset();
  return NextResponse.json({ posts: await store.listPosts() });
}
