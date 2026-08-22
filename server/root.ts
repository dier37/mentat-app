import path from "node:path";
import { stat } from "node:fs/promises";
import { resolveInRoot } from "./paths";

export async function resolveDataRoot(cwd = process.cwd(), configured = process.env.MENTAT_ROOT): Promise<string> {
  const candidate = path.resolve(cwd, configured ?? "../mentat");
  let metadata;
  try {
    metadata = await stat(candidate);
  } catch {
    throw new Error(`Mentat data root does not exist: ${candidate}`);
  }
  if (!metadata.isDirectory()) throw new Error(`Mentat data root is not a directory: ${candidate}`);
  try {
    await resolveInRoot(candidate, "CLAUDE.md");
  } catch {
    throw new Error(`Mentat data root has no CLAUDE.md: ${candidate}`);
  }
  return resolveInRoot(candidate, ".");
}
