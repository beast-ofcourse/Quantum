import { useEffect, useRef } from "react";
import { useUiStore } from "@/stores/uiStore";

interface TrailPoint {
  x: number;
  y: number;
  time: number;
}

const TRAIL_DURATION = 400;
const MAX_POINTS = 20;
const DOT_RADIUS = 2;
const TRAIL_COLOR = "#E23636";

export function useCursorTrail(containerSelector: string) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<TrailPoint[]>([]);
  const rafRef = useRef<number>(0);
  const containerRectRef = useRef<DOMRect | null>(null);

  const theme = useUiStore((s) => s.theme);
  const isActive = theme === "spiderman";

  useEffect(() => {
    if (!isActive) {
      if (canvasRef.current) {
        canvasRef.current.remove();
        canvasRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      pointsRef.current = [];
      return;
    }

    const container = document.querySelector(containerSelector) as HTMLElement | null;
    if (!container) return;

    const canvas = document.createElement("canvas");
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "9999";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext("2d");
    containerRectRef.current = container.getBoundingClientRect();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      containerRectRef.current = rect;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const now = Date.now();

      pointsRef.current.push({ x, y, time: now });
      if (pointsRef.current.length > MAX_POINTS) {
        pointsRef.current = pointsRef.current.slice(-MAX_POINTS);
      }
    };

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);

    document.addEventListener("mousemove", handleMouseMove);

    const draw = () => {
      if (!ctx || !canvas) return;
      const now = Date.now();
      pointsRef.current = pointsRef.current.filter(
        (p) => now - p.time < TRAIL_DURATION
      );

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < pointsRef.current.length; i++) {
        const p = pointsRef.current[i];
        const age = now - p.time;
        const opacity = Math.max(0, 1 - age / TRAIL_DURATION);
        const radius = DOT_RADIUS * opacity;

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = TRAIL_COLOR;
        ctx.globalAlpha = opacity * 0.7;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (canvasRef.current) canvasRef.current.remove();
      canvasRef.current = null;
      pointsRef.current = [];
    };
  }, [isActive, containerSelector]);
}
