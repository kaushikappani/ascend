import type { ReactNode } from 'react';
import { cn } from '../lib/format';
import { TopBar } from './Shell';

export function PageFrame({
  title,
  right,
  children,
  className,
  scroll = true,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title={title} right={right} />
      {scroll ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn('mx-auto w-full max-w-[1240px] px-8 py-7', className)}>{children}</div>
        </div>
      ) : (
        <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>{children}</div>
      )}
    </div>
  );
}
