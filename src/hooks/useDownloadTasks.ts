"use client";

import { useEffect, useState } from 'react';
import { readDownloadTasks, saveDownloadTasks } from '@/lib/download-history';

export function useDownloadTasks() {
  const [tasks, setTasks] = useState(readDownloadTasks);
  useEffect(() => saveDownloadTasks(tasks), [tasks]);
  return [tasks, setTasks] as const;
}
