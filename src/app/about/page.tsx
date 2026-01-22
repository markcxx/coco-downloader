import { Code, Mail } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center">
            <UserIcon className="w-8 h-8 text-sky-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">关于作者</h1>
            <p className="text-slate-500">CoCo Studio</p>
          </div>
        </div>
        
        <div className="space-y-6 text-slate-600">
          <p>
            欢迎来到 COCO 音乐下载站。这是一个致力于提供纯净、快速音乐搜索与下载体验的项目。
            我们摒弃了繁杂的广告与推荐，只为您呈现最直接的音乐内容。
          </p>
          
          <div className="grid gap-4 mt-8">
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
              <Code className="w-5 h-5 text-sky-500" />
              <div>
                <h3 className="font-medium text-slate-800">技术栈</h3>
                <p className="text-sm text-slate-500">Next.js 14, Tailwind CSS, Framer Motion</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
              <Mail className="w-5 h-5 text-sky-500" />
              <div>
                <h3 className="font-medium text-slate-800">联系我们</h3>
                <p className="text-sm text-slate-500">contact@coco.studio (Placeholder)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
