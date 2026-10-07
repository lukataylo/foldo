import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Table = forwardRef(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
));
export const TableHeader = forwardRef(({ className, ...props }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />);
export const TableBody = forwardRef(({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />);
export const TableRow = forwardRef(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />
));
export const TableHead = forwardRef(({ className, ...props }, ref) => (
  <th ref={ref} className={cn('h-10 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground', className)} {...props} />
));
export const TableCell = forwardRef(({ className, ...props }, ref) => <td ref={ref} className={cn('px-3 py-3 align-middle', className)} {...props} />);
