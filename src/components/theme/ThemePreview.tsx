interface ThemePreviewProps {
  colors: Record<string, string>;
}

const SAMPLE_CODE = `import { useEffect, useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = \`Count: \${count}\`;
  }, [count]);

  return (
    <div className="app">
      <h1>Hello, World!</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}`;

export function ThemePreview({ colors }: ThemePreviewProps) {
  const bg = colors["editor.background"] ?? "#1e1e2e";
  const fg = colors["editor.foreground"] ?? "#cdd6f4";

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border" style={{ background: bg }}>
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-1.5">
        <div className="size-2.5 rounded-full bg-red-500" />
        <div className="size-2.5 rounded-full bg-yellow-500" />
        <div className="size-2.5 rounded-full bg-green-500" />
        <span className="ml-2 text-[11px] text-white/60">preview.ts</span>
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed" style={{ color: fg }}>
        <code>{SAMPLE_CODE}</code>
      </pre>
    </div>
  );
}
