"use client";

import { ConfigProvider, Select, theme } from "antd";
import { ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";

export function SelectMenu({ value, options, onChange, label, disabled = false }: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  return <ConfigProvider theme={{ algorithm: resolvedTheme === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { colorPrimary: "#3979b7", borderRadius: 9, fontSize: 14, controlHeight: 38 } }}>
    <Select aria-label={label} className="coco-select" value={value} options={options} onChange={onChange} disabled={disabled} suffixIcon={<ChevronDown size={15} />} popupMatchSelectWidth={false} styles={{ popup: { root: { minWidth: 180, padding: 6, borderRadius: 12 } } }} />
  </ConfigProvider>;
}
