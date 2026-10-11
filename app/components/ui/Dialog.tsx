import * as RadixDialog from '@radix-ui/react-dialog';
import { motion, type Variants } from 'framer-motion';
import React, { memo, type ReactNode } from 'react';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { Icon } from './icons';

export { Close as DialogClose, Root as DialogRoot } from '@radix-ui/react-dialog';

// motion.slow (Foundations board): dialogs and scrim
const transition = {
  duration: 0.32,
  ease: cubicEasingFn,
};

export const dialogBackdropVariants = {
  closed: {
    opacity: 0,
    transition,
  },
  open: {
    opacity: 1,
    transition,
  },
} satisfies Variants;

export const dialogVariants = {
  closed: {
    x: '-50%',
    y: '-40%',
    scale: 0.96,
    opacity: 0,
    transition,
  },
  open: {
    x: '-50%',
    y: '-50%',
    scale: 1,
    opacity: 1,
    transition,
  },
} satisfies Variants;

interface DialogButtonProps {
  type: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
  disabled?: boolean;
  onClick?: (event: React.UIEvent) => void;
}

// footer buttons are 40 high (Components board 15); "danger" is the destructive confirm (red fill)
export const DialogButton = memo(({ type, children, disabled, onClick }: DialogButtonProps) => {
  return (
    <button
      type="button"
      disabled={disabled}
      className={classNames('btn-md', {
        'btn-primary': type === 'primary',
        'btn-secondary': type === 'secondary',
        'btn-destructive': type === 'danger',
      })}
      onClick={onClick}
    >
      {children}
    </button>
  );
});

// header A: serif 30 title, optional 14px Pencil subtitle, Rule-2 bottom; the close button sits over its right edge
export const DialogHeader = memo(({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) => {
  return (
    <div className="flex flex-col gap-[2px] border-b border-rule2 pb-[14px] pl-[22px] pr-[64px] pt-5">
      <RadixDialog.Title className="m-0 font-serif text-[30px] font-normal leading-[1.1] text-ink">{title}</RadixDialog.Title>
      {subtitle && <RadixDialog.Description className="m-0 text-[14px] text-pencil">{subtitle}</RadixDialog.Description>}
    </div>
  );
});

export const DialogTitle = memo(({ className, children, ...props }: RadixDialog.DialogTitleProps) => {
  return (
    <RadixDialog.Title
      className={classNames(
        'm-0 border-b border-rule2 pb-[14px] pl-[22px] pr-[64px] pt-5 font-serif text-[30px] font-normal leading-[1.1] text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </RadixDialog.Title>
  );
});

// body B: 16-20 / 22 padding, 14px Ink-2
export const DialogDescription = memo(({ className, children, ...props }: RadixDialog.DialogDescriptionProps) => {
  return (
    <RadixDialog.Description className={classNames('px-[22px] py-4 text-[14px] text-ink2', className)} {...props}>
      {children}
    </RadixDialog.Description>
  );
});

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={classNames('px-[22px] py-4 text-[14px] text-ink2', className)}>{children}</div>;
}

// footer C: Rule-2 top, actions right
export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={classNames('flex justify-end gap-2 border-t border-rule2 px-[22px] py-3', className)}>{children}</div>
  );
}

interface DialogProps {
  children: ReactNode | ReactNode[];
  className?: string;
  onBackdrop?: (event: React.UIEvent) => void;
  onClose?: (event: React.UIEvent) => void;
  // render your own RadixDialog.Close instead (e.g. to place it earlier in the tab order)
  hideClose?: boolean;
}

// Sheet, 1px Rule, radius 14, floating shadow, over an Ink scrim at 42%
export const Dialog = memo(({ className, children, onBackdrop, onClose, hideClose }: DialogProps) => {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay onClick={onBackdrop} asChild>
        <motion.div
          className="fixed inset-0 z-max bg-[rgba(22,20,15,.42)]"
          initial="closed"
          animate="open"
          exit="closed"
          variants={dialogBackdropVariants}
        />
      </RadixDialog.Overlay>
      <RadixDialog.Content asChild>
        <motion.div
          className={classNames(
            'fixed left-[50%] top-[50%] z-max max-h-[85vh] w-[calc(100vw-32px)] max-w-[450px] translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-[14px] border border-rule bg-sheet text-ink shadow-float focus:outline-none',
            className,
          )}
          initial="closed"
          animate="open"
          exit="closed"
          variants={dialogVariants}
        >
          {children}
          {!hideClose && (
            <RadixDialog.Close asChild onClick={onClose}>
              <button type="button" aria-label="Close" className="btn-icon absolute right-4 top-4 h-[36px] w-[36px]">
                <Icon.Close size={18} />
              </button>
            </RadixDialog.Close>
          )}
        </motion.div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
});
