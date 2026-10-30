'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import styles from './donation-modal.module.css';
import { X, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PaymentMethod = 'wechat' | 'alipay';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function DonationModal({ isOpen, onClose }: DonationModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('wechat');
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (isOpen && !element.open) element.showModal();
    if (!isOpen && element.open) element.close();
  }, [isOpen, mounted]);

  if (!mounted) return null;

  return createPortal(
    <dialog ref={dialog} aria-label="支持作者" className={styles.dialog}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClose={() => { if (isOpen) onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}>
            {/* Close Button */}
            <button
              onClick={onClose}
              aria-label="关闭支持作者"
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex flex-col items-center pt-2">
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mb-4 text-rose-500">
                <Heart className="w-8 h-8 fill-current" />
              </div>
              <h2 className="font-bold text-xl text-slate-800 dark:text-slate-100 mb-2">支持作者</h2>
              <p className="text-center text-slate-500 dark:text-slate-400 text-sm mb-6">
                如果觉得这个项目对你有帮助，<br />
                欢迎请作者喝一杯咖啡 ☕️
              </p>

              {/* Tabs */}
              <div className="w-full flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
                <button
                  onClick={() => setMethod('wechat')}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-300",
                    method === 'wechat'
                      ? "bg-white dark:bg-slate-700 text-green-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  微信支付
                </button>
                <button
                  onClick={() => setMethod('alipay')}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-300",
                    method === 'alipay'
                      ? "bg-white dark:bg-slate-700 text-blue-500 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  支付宝
                </button>
              </div>

              {/* QR Code Area */}
              <div className="w-full relative aspect-square bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center p-4 group">
                <div className="relative w-full h-full">
                  <Image
                    src={method === 'wechat' ? '/images/weixin_given.png' : '/images/zhifubao_given.png'}
                    alt={method === 'wechat' ? 'WeChat Pay' : 'Alipay'}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              </div>

              <div className="mt-6 text-center">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  您的支持是我更新的最大动力
                </p>
              </div>
            </div>
    </dialog>,
    document.body
  );
}
