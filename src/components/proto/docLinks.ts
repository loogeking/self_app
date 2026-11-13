import type { AppData, Doc, KNode } from "./types";

export function docNodeIds(doc: Doc): string[] {
  return Array.from(
    new Set([...(doc.nodeIds ?? []), ...(doc.nodeId ? [doc.nodeId] : [])].filter(Boolean)),
  );
}

export function syncNodeDocCounts(nodes: KNode[], docs: Doc[]): KNode[] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    for (const id of docNodeIds(doc)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return nodes.map((node) => {
    const count = counts.get(node.id) ?? 0;
    return {
      ...node,
      notes: count,
      state: count > 0 ? "noted" : node.state === "noted" ? "empty" : node.state,
    };
  });
}

export function normalizeDocLinks(data: AppData): AppData {
  const docs = data.docs.map((doc) => {
    const ids = docNodeIds(doc);
    const { nodeId: _legacy, ...rest } = doc;
    return { ...rest, nodeIds: ids };
  });
  return { ...data, docs, nodes: syncNodeDocCounts(data.nodes, docs) };
}