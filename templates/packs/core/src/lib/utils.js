import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// cn('px-2', cond && 'font-bold') -> merged Tailwind class string
export const cn = (...inputs) => twMerge(clsx(inputs));
