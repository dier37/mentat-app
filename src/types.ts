export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
}

export interface BrainFile {
  path: string;
  content: string;
  mtime: string;
  version: string;
}

export interface OutboundLink {
  target: string;
  candidates: string[];
  resolved: boolean;
  ambiguous: boolean;
}

export interface LinkResult {
  outbound: OutboundLink[];
  inbound: string[];
  unresolved: string[];
}

export interface ChangeEvent {
  type: "change";
  path: string;
}

export interface SearchResult {
  path: string;
  line: number;
  text: string;
}

export interface GutterMark {
  top: number;
  height: number;
  resolved: boolean;
  target?: string;
  indexes: number[];
}
