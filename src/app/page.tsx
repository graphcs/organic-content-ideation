import Workbench from "@/components/Workbench";
import { fixtureMeta } from "@/lib/fixture";
import { getStore, isDemoMode } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const store = await getStore();
  const posts = await store.listPosts();

  return (
    <Workbench
      initialPosts={posts}
      demo={isDemoMode()}
      capturedAt={fixtureMeta.capturedAt}
      market={fixtureMeta.sourceAccount}
    />
  );
}
