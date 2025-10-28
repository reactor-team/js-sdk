"use client";

import { useEffect, useState } from "react";

interface OrientationGuardProps {
  children: React.ReactNode;
}

export function OrientationGuard({ children }: OrientationGuardProps) {
  const [isLandscape, setIsLandscape] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Check if device is mobile based on screen width
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);

      // Check if orientation is landscape
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      setIsLandscape(landscape);
    };

    // Initial check
    checkOrientation();

    // Listen for orientation and resize changes
    const handleOrientationChange = () => checkOrientation();
    const handleResize = () => checkOrientation();

    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("resize", handleResize);

    // Also listen to matchMedia changes for better support
    const orientationQuery = window.matchMedia("(orientation: landscape)");
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsLandscape(e.matches);
    };

    if (orientationQuery.addEventListener) {
      orientationQuery.addEventListener("change", handleMediaChange);
    }

    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.removeEventListener("resize", handleResize);
      if (orientationQuery.removeEventListener) {
        orientationQuery.removeEventListener("change", handleMediaChange);
      }
    };
  }, []);

  // Show blocking overlay if on mobile and in portrait mode
  if (isMobile && !isLandscape) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-6 z-50">
        <div className="max-w-md text-center space-y-6">
          {/* Rotation Icon */}
          <div className="flex justify-center">
            <svg
              className="w-24 h-24 text-gray-400 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>

          {/* Title */}
          <h2 className="text-3xl font-bold text-white">
            Please Rotate Your Device
          </h2>

          {/* Description */}
          <div className="space-y-3">
            <p className="text-gray-300 text-lg">
              This app works best in landscape mode
            </p>
            <p className="text-gray-400 text-sm">
              The StreamDiffusion model was trained on landscape-orientation
              videos. Please turn your phone horizontal to continue.
            </p>
          </div>

          {/* Visual indicator */}
          <div className="flex items-center justify-center gap-4 pt-4">
            <div className="w-16 h-24 border-2 border-gray-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-gray-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
              </svg>
            </div>
            <svg
              className="w-8 h-8 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
            <div className="w-24 h-16 border-2 border-green-500 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-green-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render app normally when in landscape or on desktop
  return <>{children}</>;
}
