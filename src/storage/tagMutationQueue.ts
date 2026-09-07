/**
 * Tag Mutation Queue
 *
 * Per-tag FIFO queue to serialize asynchronous read-modify-write mutations
 * and prevent race conditions from rapid successive user actions on the same tag.
 */

const tagMutationQueues = new Map<string, Promise<any>>();

export function enqueueTagMutation<T>(tagUid: string, fn: () => Promise<T>): Promise<T> {
  const current = tagMutationQueues.get(tagUid) || Promise.resolve();
  const next = current
    .catch(() => {})
    .then(async () => {
      return await fn();
    });

  tagMutationQueues.set(tagUid, next);

  next.finally(() => {
    if (tagMutationQueues.get(tagUid) === next) {
      tagMutationQueues.delete(tagUid);
    }
  });

  return next;
}
