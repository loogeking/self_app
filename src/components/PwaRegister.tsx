"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 本地 http 非 localhost 时注册会失败，不影响使用 */
    });
  }, []);
  return null;
}
