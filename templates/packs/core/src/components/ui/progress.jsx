import * as ProgressPrimitive from '@radix-ui/react-progress';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Progress = forwardRef(({ className, value = 0, ...props }, ref) => (
  <ProgressPrimitive.Root ref={ref} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)} value={value} {...props}>
    <ProgressPrimitive.Indicator className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
  </ProgressPrimitive.Root>
));
Progress.displayName = 'Progress';
