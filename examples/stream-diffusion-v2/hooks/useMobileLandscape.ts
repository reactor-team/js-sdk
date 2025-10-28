"use client";

import { useEffect, useState } from "react";

/**
 * Hook to detect if the device is in mobile landscape mode
 * Returns true when screen width <= 900px AND height <= 500px
 */
export function useMobileLandscape(): boolean {
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);

  useEffect(() => {
    const checkMobileLandscape = () => {
      const mobile =
        window.innerWidth <= 900 &&
        window.innerHeight <= 500 &&
        window.matchMedia("(orientation: landscape)").matches;
      setIsMobileLandscape(mobile);
    };

    // Initial check
    checkMobileLandscape();

    // Listen for orientation and resize changes
    const handleChange = () => checkMobileLandscape();

    window.addEventListener("orientationchange", handleChange);
    window.addEventListener("resize", handleChange);

    // Also listen to matchMedia changes
    const orientationQuery = window.matchMedia("(orientation: landscape)");
    const handleMediaChange = () => checkMobileLandscape();

    if (orientationQuery.addEventListener) {
      orientationQuery.addEventListener("change", handleMediaChange);
    }

    return () => {
      window.removeEventListener("orientationchange", handleChange);
      window.removeEventListener("resize", handleChange);
      if (orientationQuery.removeEventListener) {
        orientationQuery.removeEventListener("change", handleMediaChange);
      }
    };
  }, []);

  return isMobileLandscape;
}
