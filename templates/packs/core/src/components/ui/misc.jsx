import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { Check, ChevronDown } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Separator = ({ className, vertical }) => (
  <div role="separator" className={cn('shrink-0 bg-border', vertical ? 'h-full w-px' : 'h-px w-full', className)} />
);

export const Skeleton = ({ className }) => <div className={cn('animate-pulse rounded-md bg-muted', className)} />;

export const Avatar = ({ name = '?', className }) => (
  <AvatarPrimitive.Root className={cn('relative flex size-9 shrink-0 overflow-hidden rounded-full', className)}>
    <AvatarPrimitive.Fallback className="flex size-full items-center justify-center bg-accent text-xs font-semibold text-accent-foreground">
      {name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
    </AvatarPrimitive.Fallback>
  </AvatarPrimitive.Root>
);

export const Checkbox = forwardRef(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn('peer size-4 shrink-0 rounded-sm border border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', className)}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      <Check className="size-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = ({ content, children }) => (
  <TooltipPrimitive.Provider delayDuration={150}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
);

export const Accordion = AccordionPrimitive.Root;
export const AccordionItem = forwardRef(({ className, ...props }, ref) => <AccordionPrimitive.Item ref={ref} className={cn('border-b', className)} {...props} />);
export const AccordionTrigger = forwardRef(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger ref={ref} className={cn('flex flex-1 items-center justify-between py-4 text-left text-sm font-medium hover:underline [&[data-state=open]>svg]:rotate-180', className)} {...props}>
      {children}
      <ChevronDown className="size-4 shrink-0 transition-transform" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
export const AccordionContent = forwardRef(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content ref={ref} className="overflow-hidden text-sm" {...props}>
    <div className={cn('pb-4 text-muted-foreground', className)}>{children}</div>
  </AccordionPrimitive.Content>
));

export const Alert = ({ variant = 'default', title, children, className }) => (
  <div
    role="alert"
    className={cn(
      'rounded-lg border p-4 text-sm',
      variant === 'warning' && 'border-warning/40 bg-warning/10',
      variant === 'destructive' && 'border-destructive/40 bg-destructive/10',
      variant === 'success' && 'border-success/40 bg-success/10',
      variant === 'default' && 'bg-muted/50',
      className,
    )}
  >
    {title && <div className="mb-1 font-semibold">{title}</div>}
    <div className="text-muted-foreground">{children}</div>
  </div>
);
