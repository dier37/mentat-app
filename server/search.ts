import { getFile } from "./file";
import { resolveInRoot } from "./paths";
import { listMarkdownFiles } from "./tree";

export interface SearchResult {
  path: string;
  line: number;
  text: string;
}

export async function searchFiles(root: string, query: string, relPath = "."): Promise<SearchResult[]> {
  await resolveInRoot(root, relPath);
  if (!query.trim()) return [];
  const needle = query.toLocaleLowerCase();
  const results: SearchResult[] = [];
  for (const filePath of await listMarkdownFiles(root, relPath)) {
    const file = await getFile(root, filePath);
    for (const [index, line] of file.content.split(/\r?\n/).entries()) {
      if (line.toLocaleLowerCase().includes(needle)) {
        results.push({ path: filePath, line: index + 1, text: line });
        if (results.length === 200) return results;
      }
    }
  }
  return results;
}
