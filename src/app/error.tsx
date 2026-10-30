"use client";

import { useEffect } from "react";
import { message } from "antd";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  useEffect(() => { void message.error("页面出现异常，请点击重试恢复。", 6); }, []);
  return <div className="p-12 text-center"><p>页面暂时无法显示，请重试。</p><button className="mt-4 rounded-xl bg-blue-600 px-6 py-3 text-white" onClick={reset}>重试</button></div>;
}
