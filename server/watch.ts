import path from "node:path";
import { watch, type FSWatcher } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolveInRoot, toPosixRelative } from "./paths";

export interface ChangeEvent { type: "change"; path: string }

export async function watchBrain(root: string, onChange: (event: ChangeEvent) => void): Promise<() => void> {
  const canonicalRoot = await resolveInRoot(root, ".");
  const watchers = new Map<string, FSWatcher>();
  let timer: NodeJS.Timeout | undefined;
  const pending = new Set<string>();

  const emitSoon = (relPath: string) => {
    if (relPath.split("/").some((part) => part.startsWith("."))) return;
    pending.add(relPath);
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const changedPath of pending) onChange({ type: "change", path: changedPath });
      pending.clear();
    }, 100);
  };

  const addDirectory = async (directory: string): Promise<void> => {
    const relDirectory = toPosixRelative(canonicalRoot, directory) || ".";
    const guarded = await resolveInRoot(canonicalRoot, relDirectory);
    if (!watchers.has(guarded)) {
      watchers.set(guarded, watch(guarded, (_event, filename) => {
        if (!filename) return;
        const relPath = toPosixRelative(canonicalRoot, path.join(guarded, filename.toString()));
        emitSoon(relPath);
        void refresh();
      }));
    }
    for (const entry of await readdir(guarded, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        await addDirectory(path.join(guarded, entry.name));
      }
    }
  };

  const refresh = async () => { await addDirectory(canonicalRoot); };
  await refresh();
  return () => {
    clearTimeout(timer);
    for (const watcher of watchers.values()) watcher.close();
  };
}
