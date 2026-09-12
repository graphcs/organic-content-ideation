import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import type { HookPatch, Status } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { status?: Status; hooks?: HookPatch };
  const store = await getStore();

  try {
    let post = await store.getPost(id);
    if (!post) {
      return NextResponse.json({ error: `No post ${id}` }, { status: 404 });
    }
    if (body.hooks) post = await store.updateHooks(id, body.hooks);
    if (body.status) post = await store.setStatus(id, body.status);
    return NextResponse.json({ post });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 },
    );
  }
}
