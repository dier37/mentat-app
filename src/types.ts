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
