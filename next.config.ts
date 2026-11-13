import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // 本地/平板用这些地址打开时，允许开发资源（否则 HMR / 客户端脚本会被判跨域）
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.2.25"],
  // 旧入口全部收回到根路径，只保留一个界面。
  async redirects() {
    return [
      { source: "/proto", destination: "/", permanent: false },
      { source: "/proto/:path*", destination: "/", permanent: false },
      { source: "/map", destination: "/?view=map&space=ky", permanent: false },
      { source: "/map/:path*", destination: "/?view=map&space=ky", permanent: false },
      { source: "/plan", destination: "/?view=plan&space=ky", permanent: false },
      { source: "/library", destination: "/?view=library&space=ky", permanent: false },
      { source: "/library/:path*", destination: "/?view=library&space=ky", permanent: false },
      { source: "/review", destination: "/?view=review&space=ky", permanent: false },
      { source: "/settings", destination: "/?view=settings&space=ky", permanent: false },
    ];
  },
};

export default config;