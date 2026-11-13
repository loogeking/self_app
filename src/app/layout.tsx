import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import "./proto.css";

export const metadata: Metadata = {
  title: "足迹 · 学习系统",
  description: "只排内容，不排分钟。记录学过的足迹，用笔记和复盘留下证据。",
  manifest: "/manifest.webmanifest",
  applicationName: "足迹",
  appleWebApp: {
    capable: true,
    title: "足迹",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eef1f7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}