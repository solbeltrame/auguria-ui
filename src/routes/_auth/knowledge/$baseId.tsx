import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeBaseWorkspace } from ".";

export const Route = createFileRoute("/_auth/knowledge/$baseId")({
  component: KnowledgeBaseDetail,
});

function KnowledgeBaseDetail() {
  const { baseId } = Route.useParams();
  return <KnowledgeBaseWorkspace baseId={baseId} />;
}
