"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ResizableDividerProps {
  onResize: (deltaY: number) => void;
  className?: string;
}

export function ResizableDivider({ onResize, className }: ResizableDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const lastY = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    lastY.current = e.clientY;
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - lastY.current;
      lastY.current = e.clientY;
      onResize(deltaY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, onResize]);

  return (
    <div
      className={cn(
        "h-2 cursor-row-resize flex items-center justify-center group",
        "hover:bg-primary/10 transition-colors",
        isDragging && "bg-primary/20",
        className
      )}
      onMouseDown={handleMouseDown}
    >
      <div 
        className={cn(
          "w-12 h-1 rounded-full bg-muted-foreground/30 group-hover:bg-primary/50 transition-colors",
          isDragging && "bg-primary"
        )} 
      />
    </div>
  );
}
