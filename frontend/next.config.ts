import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Attendance moved under Time & Attendance; keep old links working.
      { source: "/attendance", destination: "/time-off/attendance", permanent: false },
      { source: "/attendance/:path*", destination: "/time-off/attendance/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
