export const SHARE_QUERY_PARAM = "share";

const TREE_KIND_PRIORITY = {
  session: 3,
  "archived-session": 2,
  aggregate: 1,
};

function rememberTreeEntry(byId, byShareKey, item) {
  byId.set(item.id, item);
  if (!item.shareKey) return;

  const current = byShareKey.get(item.shareKey);
  if (!current || TREE_KIND_PRIORITY[item.kind] > TREE_KIND_PRIORITY[current.kind]) {
    byShareKey.set(item.shareKey, item);
  }
}

export function buildTreeIndexes(projects) {
  const byId = new Map();
  const byShareKey = new Map();

  for (const project of projects || []) {
    for (const group of project.memories || []) {
      for (const file of group.files || []) {
        rememberTreeEntry(byId, byShareKey, {
          id: file.id,
          shareKey: file.shareKey || null,
          kind: file.kind,
          projectId: project.projectId,
        });
      }
    }

    for (const group of project.archive || []) {
      for (const file of group.files || []) {
        rememberTreeEntry(byId, byShareKey, {
          id: file.id,
          shareKey: file.shareKey || null,
          kind: file.kind,
          projectId: project.projectId,
        });
      }
    }

    for (const aggregate of project.aggregates || []) {
      rememberTreeEntry(byId, byShareKey, {
        id: aggregate.id,
        shareKey: aggregate.shareKey || null,
        kind: aggregate.kind,
        projectId: project.projectId,
      });
    }
  }

  return { byId, byShareKey };
}

export function getTreeEntryByFileId(byId, fileId) {
  return byId.get(Number(fileId)) || null;
}

export function getTreeEntryByShareKey(byShareKey, shareKey) {
  if (!shareKey) return null;
  return byShareKey.get(shareKey) || null;
}

export function getShareKeyFromHref(href, shareQueryParam = SHARE_QUERY_PARAM) {
  const url = new URL(href);
  return url.searchParams.get(shareQueryParam);
}

export function buildShareUrl(href, shareKey, shareQueryParam = SHARE_QUERY_PARAM) {
  const url = new URL(href);
  if (shareKey) {
    url.searchParams.set(shareQueryParam, shareKey);
  } else {
    url.searchParams.delete(shareQueryParam);
  }
  return url.toString();
}

export function resolveSharedEntry({
  href,
  byShareKey,
  shareQueryParam = SHARE_QUERY_PARAM,
}) {
  const shareKey = getShareKeyFromHref(href, shareQueryParam);
  if (!shareKey) {
    return { status: "empty", shareKey: null, entry: null };
  }

  const entry = getTreeEntryByShareKey(byShareKey, shareKey);
  if (!entry) {
    return { status: "not-found", shareKey, entry: null };
  }

  return { status: "resolved", shareKey, entry };
}
