import type {
  AssemblyMateRecord,
  AssemblyPartInstance,
  AssemblyRigidGroup,
} from '../../types/assembly.ts';

export type AssemblyUndoSnapshot = {
  instances: AssemblyPartInstance[];
  mateRecords: AssemblyMateRecord[];
  groups: AssemblyRigidGroup[];
};

function snapshotKey(snapshot: AssemblyUndoSnapshot): string {
  return JSON.stringify(snapshot);
}

export function assemblySnapshotsEqual(
  first: AssemblyUndoSnapshot,
  second: AssemblyUndoSnapshot,
): boolean {
  return snapshotKey(first) === snapshotKey(second);
}

export function appendAssemblySnapshot(
  history: AssemblyUndoSnapshot[],
  snapshot: AssemblyUndoSnapshot,
  limit = 50,
): AssemblyUndoSnapshot[] {
  const latest = history.at(-1);
  if (latest && assemblySnapshotsEqual(latest, snapshot)) return history;
  return [...history, snapshot].slice(-limit);
}

export function undoAssemblySnapshot(
  history: AssemblyUndoSnapshot[],
  current: AssemblyUndoSnapshot,
): { snapshot: AssemblyUndoSnapshot; history: AssemblyUndoSnapshot[] } | null {
  const latest = history.at(-1);
  if (!latest) return null;
  if (!assemblySnapshotsEqual(latest, current)) {
    return { snapshot: latest, history };
  }
  if (history.length < 2) return null;
  const nextHistory = history.slice(0, -1);
  return {
    snapshot: nextHistory[nextHistory.length - 1],
    history: nextHistory,
  };
}
