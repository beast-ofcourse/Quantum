import { useRef, useEffect } from "react";

export function ViewContainer({ element }: { element: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = "";
      ref.current.appendChild(element);
    }
    return () => {
      element.remove();
    };
  }, [element]);

  return <div ref={ref} className="h-full overflow-auto" />;
}
