"use client";

import { useEffect } from "react";
import { message } from "antd";

export function ErrorNotifications() {
  const [api, contextHolder] = message.useMessage();
  useEffect(() => {
    const notify = () => {
      void api.error({ key: "unexpected-error", content: "操作未完成，请重试；渠道功能受第三方服务稳定性影响。", duration: 6 });
    };
    window.addEventListener("error", notify);
    window.addEventListener("unhandledrejection", notify);
    return () => {
      window.removeEventListener("error", notify);
      window.removeEventListener("unhandledrejection", notify);
    };
  }, [api]);
  return contextHolder;
}
