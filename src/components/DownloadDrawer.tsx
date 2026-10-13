import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, CheckCircle2, AlertCircle, Trash2, Music, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { DownloadTask } from '@/types/download';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface DownloadDrawerProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  tasks: DownloadTask[];
  onRemoveTask: (taskId: string) => void;
  onClearCompleted: () => void;
}

export function DownloadDrawer({
  isOpen,
  onOpen,
  onClose,
  tasks,
  onRemoveTask,
  onClearCompleted
}: DownloadDrawerProps) {
  const [activeTab, setActiveTab] = useState<'downloading' | 'completed'>('downloading');
  // Sort tasks: downloading first, then recent
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === 'downloading' && b.status !== 'downloading') return -1;
    if (a.status !== 'downloading' && b.status === 'downloading') return 1;
    return b.startTime - a.startTime;
  });

  const downloadingCount = tasks.filter(t => t.status === 'downloading').length;
  const completedCount = tasks.filter(t => t.status === 'completed' || t.status === 'error').length;

  const filteredTasks = activeTab === 'downloading'
    ? sortedTasks.filter(t => t.status === 'downloading' || t.status === 'pending')
    : sortedTasks.filter(t => t.status === 'completed' || t.status === 'error');

  return (
    <>
      <motion.button
        type="button"
        initial={false}
        animate={{
          right: isOpen ? "min(100vw, 380px)" : 0,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        onClick={isOpen ? onClose : onOpen}
        className="fixed top-1/2 z-[80] flex h-16 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-xl border border-r-0 border-white/20 bg-[#005faa] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-colors hover:bg-[#0078d4] dark:bg-[#003f6d] dark:hover:bg-[#005faa]"
        aria-label={isOpen ? "收起下载管理" : "打开下载管理"}
        title={isOpen ? "收起下载管理" : "打开下载管理"}
      >
        {isOpen ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        {downloadingCount > 0 && !isOpen ? (
          <span className="absolute -left-1 -top-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
        ) : null}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
              className="fixed inset-0 z-[60] bg-[#1b1b1c]/20 backdrop-blur-sm"
            />

            <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-[380px] flex-col gap-4 border-l border-white/10 bg-[#eae7e7]/95 p-4 shadow-[0_0_40px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:bg-[#242526]/95"
          >
            <div className="mt-4 flex items-start justify-between">
              <div>
                <h2 className="text-[28px] font-bold leading-9 text-[#1b1b1c] dark:text-[#f3f0ef]">下载管理</h2>
                <p className="mt-1 text-sm leading-5 text-[#404752] dark:text-[#c6c6c7]">
                  {downloadingCount > 0 ? `${downloadingCount} 个任务进行中` : '管理您的音乐下载队列'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="cursor-pointer rounded-full p-2 text-[#404752] transition-colors hover:bg-[#e5e2e1] dark:text-[#c6c6c7] dark:hover:bg-white/10"
                aria-label="关闭下载管理"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-1 flex rounded-xl bg-[#e5e2e1]/70 p-1 dark:bg-white/10">
              <button
                onClick={() => setActiveTab('downloading')}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
                  activeTab === 'downloading'
                    ? "bg-[#5badff] text-[#003f6d] shadow-sm"
                    : "text-[#404752] hover:bg-[#e5e2e1]/70 dark:text-[#c6c6c7] dark:hover:bg-white/10"
                )}
              >
                <Download className="h-4 w-4" />
                进行中 ({downloadingCount})
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
                  activeTab === 'completed'
                    ? "bg-[#5badff] text-[#003f6d] shadow-sm"
                    : "text-[#404752] hover:bg-[#e5e2e1]/70 dark:text-[#c6c6c7] dark:hover:bg-white/10"
                )}
              >
                <CheckCircle2 className="h-4 w-4" />
                已完成 ({completedCount})
              </button>
            </div>

            {tasks.some(t => t.status === 'completed' || t.status === 'error') && (
              <div className="flex justify-end">
                <button
                  onClick={onClearCompleted}
                  className="flex cursor-pointer items-center gap-1 text-xs font-medium text-[#005faa] transition-colors hover:text-[#0078d4] dark:text-[#a3c9ff]"
                >
                  <Trash2 className="h-4 w-4" />
                  清空已完成/失败
                </button>
              </div>
            )}

            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              {filteredTasks.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-[#404752] dark:text-[#c6c6c7]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white dark:bg-white/10">
                    {activeTab === 'downloading' ? (
                      <Download className="h-8 w-8 text-[#717783] dark:text-[#c6c6c7]" />
                    ) : (
                      <CheckCircle2 className="h-8 w-8 text-[#717783] dark:text-[#c6c6c7]" />
                    )}
                  </div>
                  <p>{activeTab === 'downloading' ? '还没有下载任务' : '还没有已完成的下载'}</p>
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className="group rounded-xl border border-black/5 bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.05)] transition-transform hover:-translate-y-[2px] dark:border-white/10 dark:bg-[#303030]"
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex min-w-0 flex-1 items-center gap-3 pr-4">
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#005faa]/10 text-[#005faa] dark:bg-[#a3c9ff]/15 dark:text-[#a3c9ff]">
                          {task.musicItem.cover ? (
                            <Image
                              src={task.musicItem.cover}
                              alt={task.musicItem.title}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <Music className="h-5 w-5" />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                            {task.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-[#a3c9ff]" />}
                            {task.status === 'error' && <AlertCircle className="h-5 w-5 text-red-300" />}
                            {task.status === 'downloading' && <Loader2 className="h-5 w-5 animate-spin text-white" />}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-medium leading-5 text-[#1b1b1c] dark:text-[#f3f0ef]">
                            {task.musicItem.title}
                          </h3>
                          <p className="mt-1 flex justify-between text-xs font-medium leading-4 text-[#404752] dark:text-[#c6c6c7]">
                            <span>{task.fileName}</span>
                            <span className="ml-2 shrink-0 text-[#005faa] dark:text-[#a3c9ff]">
                              {task.status === 'downloading' ? `${Math.round(task.progress)}%` : task.status === 'pending' ? '等待中' : ''}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#e5e2e1] dark:bg-white/10">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${task.progress}%` }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                          "h-full rounded-full",
                          task.status === 'error' ? "bg-red-500" :
                          task.status === 'pending' ? "bg-[#a3c9ff]/55" :
                          "bg-[#005faa] dark:bg-[#a3c9ff]"
                        )}
                      />
                    </div>

                    {task.error && (
                      <p className="mt-2 truncate text-[10px] text-red-500 dark:text-red-300">{task.error}</p>
                    )}

                    <div className="mt-3 flex items-center justify-between">
                      <span className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold tracking-wide",
                        task.status === 'completed' && "bg-[#005faa]/10 text-[#005faa] dark:text-[#a3c9ff]",
                        task.status === 'error' && "bg-red-500/10 text-red-600 dark:text-red-300",
                        task.status === 'downloading' && "bg-[#005faa]/10 text-[#005faa] dark:text-[#a3c9ff]",
                        task.status === 'pending' && "bg-[#5c5e5e]/10 text-[#5c5e5e] dark:text-[#c6c6c7]"
                      )}>
                        {task.status === 'completed' && '已完成'}
                        {task.status === 'error' && '失败'}
                        {task.status === 'downloading' && '下载中'}
                        {task.status === 'pending' && '排队中'}
                      </span>
                      <button
                        onClick={() => onRemoveTask(task.id)}
                        className="cursor-pointer rounded-full p-1.5 text-[#ba1a1a] opacity-0 transition-all hover:bg-[#ffdad6]/50 group-hover:opacity-100 focus:opacity-100"
                        title="删除记录"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
