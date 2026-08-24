import type { GutterMark } from "../types";

interface GutterProps {
  marks: GutterMark[];
  onNavigate: (path: string) => void;
  onHighlight: (indexes: number[], active: boolean) => void;
}

export function Gutter({ marks, onNavigate, onHighlight }: GutterProps) {
  return (
    <div className="link-gutter" aria-hidden="true">
      {marks.map((mark, index) => (
        <button
          key={`${mark.top}-${mark.indexes.join("-")}`}
          className={`gutter-mark${mark.resolved ? " resolved" : " unresolved"}`}
          style={{ top: mark.top, height: mark.height, animationDelay: `${index * 8}ms` }}
          type="button"
          tabIndex={-1}
          title={mark.target ?? "Not written yet"}
          onMouseEnter={() => onHighlight(mark.indexes, true)}
          onMouseLeave={() => onHighlight(mark.indexes, false)}
          onClick={mark.resolved && mark.target ? () => onNavigate(mark.target!) : undefined}
        />
      ))}
    </div>
  );
}
