import { cn } from '@/lib/utils';

export function BrowserDownloadNotice({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs leading-5 text-[#404752] dark:text-[#c6c6c7]', className)}>
      此渠道需逐首交给浏览器下载，网页无法跟踪后续进度，也不支持自动批量下载。
      如需批量下载音频，可
      <a
        href="https://github.com/markcxx/coco-downloader/releases"
        target="_blank"
        rel="noopener noreferrer"
        className="mx-1 font-medium text-[#005faa] underline underline-offset-2 dark:text-[#a3c9ff]"
      >
        使用客户端
      </a>
      。
    </p>
  );
}
