import { globSync } from 'fast-glob';
import fs from 'node:fs/promises';
import { basename } from 'node:path';
import { defineConfig, presetIcons, presetUno, transformerDirectives } from 'unocss';

const iconPaths = globSync('./icons/*.svg');

const collectionName = 'bolt';

const customIconCollection = iconPaths.reduce(
  (acc, iconPath) => {
    const [iconName] = basename(iconPath).split('.');

    acc[collectionName] ??= {};
    acc[collectionName][iconName] = async () => fs.readFile(iconPath, 'utf8');

    return acc;
  },
  {} as Record<string, Record<string, () => Promise<string>>>,
);

const BASE_COLORS = {
  white: '#FFFFFF',
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#2C2C2C',
    900: '#252525',
    950: '#1E1E1E',
  },
  // Foldo yellow: 400 = Review Yellow, 500 = Pillow Yellow
  accent: {
    50: '#FFF9E5',
    100: '#FFF0BC',
    200: '#FFE48A',
    300: '#FFD45C',
    400: '#FFC21A',
    500: '#FDB306',
    600: '#D99500',
    700: '#A86F00',
    800: '#7A5000',
    900: '#523600',
    950: '#2E1E00',
  },
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
    950: '#052E16',
  },
  orange: {
    50: '#FFFAEB',
    100: '#FEEFC7',
    200: '#FEDF89',
    300: '#FEC84B',
    400: '#FDB022',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
    800: '#93370D',
    900: '#792E0D',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
};

const COLOR_PRIMITIVES = {
  ...BASE_COLORS,
  alpha: {
    white: generateAlphaPalette(BASE_COLORS.white),
    gray: generateAlphaPalette(BASE_COLORS.gray[900]),
    red: generateAlphaPalette(BASE_COLORS.red[500]),
    accent: generateAlphaPalette(BASE_COLORS.accent[500]),
  },
};

// Paper design system (see public/art/README.md for images). Exact values come from the Components board.
const PAPER = {
  paper: '#FBF8F1',
  sheet: '#FFFFFF',
  wash: '#F4F0E6',
  codebg: '#F6F3EC',
  ink: '#16140F',
  ink2: '#3A362E',
  pencil: '#6B6457',
  placeholder: '#766F62',
  rule: '#E4DDCF',
  rule2: '#EFEAE0',
  field: '#CFC6B4',
  highlighter: '#FFC21A',
  heroyellow: '#FDB914',
  live: { DEFAULT: '#1F7A4D', bg: '#EEF6F1', border: '#BFD9C9' },
  warning: { DEFAULT: '#8A5A00', bg: '#FFF6DB', border: '#F2D58A' },
  error: { DEFAULT: '#B42318', bg: '#FBEFED', border: '#F0C9C4' },
  info: { DEFAULT: '#2B5C9E', bg: '#EEF3FA', border: '#C9D7EC' },
};

// focus ring: 2px Paper gap + 2px Ink (red for danger buttons)
const RING = 'focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]';
const RING_RED = 'focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#B42318]';
// disabled wins over hover (important), the same for every filled variant
const OFF = 'disabled:(!border-rule !bg-wash !text-placeholder cursor-not-allowed)';

export default defineConfig({
  shortcuts: {
    'bolt-ease-cubic-bezier': 'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'transition-theme': 'transition-[background-color,border-color,color] duration-150 bolt-ease-cubic-bezier',

    /*
     * Buttons: one variant + one size, e.g. "btn-primary btn-lg".
     * Sizes: btn-lg 44 (default), btn-md 40 (dialog footers, empty states), btn-sm 34 (dense app chrome).
     */
    btn: `inline-flex shrink-0 items-center justify-center whitespace-nowrap border border-solid font-sans no-underline outline-none cursor-pointer aria-busy:cursor-progress transition-[background-color,border-color,color,box-shadow] duration-120 ${RING}`,
    'btn-lg': 'min-h-[44px] px-[18px] gap-2 rounded-[8px] text-[15px] leading-[1.2]',
    'btn-md': 'min-h-[40px] px-4 gap-2 rounded-[8px] text-[14px] leading-[1.2]',
    'btn-sm': 'h-[34px] px-3 gap-1.5 rounded-[7px] text-[13px] leading-[1.2]',
    'btn-primary': `btn border-ink bg-highlighter text-ink font-semibold hover:bg-[#EFB619] ${OFF}`,
    'btn-secondary': `btn border-field bg-sheet text-ink font-medium hover:bg-wash ${OFF}`,
    'btn-ghost': 'btn border-transparent bg-transparent text-ink2 font-medium hover:(text-ink underline underline-offset-4 decoration-field) disabled:(!text-placeholder !no-underline cursor-not-allowed)',
    'btn-dark': `btn border-ink bg-ink text-paper font-semibold hover:(bg-ink2 border-ink2) ${OFF}`,
    'btn-danger': `btn border-error-border bg-sheet text-error font-medium hover:bg-error-bg ${RING_RED} ${OFF}`,
    'btn-destructive': `btn border-error bg-error text-white font-semibold hover:bg-[#9E2117] ${RING_RED} ${OFF}`,
    // square icon button (header toggles, close buttons); size with w-/h- utilities when it isn't 34
    'btn-icon': `inline-flex shrink-0 items-center justify-center w-[34px] h-[34px] rounded-[6px] border-0 bg-transparent text-ink2 cursor-pointer outline-none transition-[background-color,color,box-shadow] duration-120 hover:(bg-wash text-ink) disabled:(!text-placeholder !bg-transparent cursor-not-allowed) ${RING}`,

    // inputs: label above, help or error below
    input: 'h-[46px] w-full min-w-0 rounded-[8px] border border-solid border-field bg-sheet px-[14px] font-sans text-[15px] text-ink outline-none placeholder:text-placeholder transition-[border-color,box-shadow] duration-120 focus:(border-ink shadow-[0_0_0_3px_rgba(255,194,26,.45)]) aria-[invalid=true]:border-error disabled:(cursor-not-allowed border-rule bg-wash text-pencil)',
    'input-label': 'text-[14px] font-medium text-ink',
    'input-help': 'text-[13px] text-pencil',
    'input-error': 'flex items-start gap-1.5 text-[13px] text-error',

    // status pills: "pill pill-live" + optional <span class="pill-dot" />
    pill: 'inline-flex shrink-0 items-center gap-[6px] h-[24px] px-[10px] rounded-full border border-solid text-[12px] font-medium leading-none whitespace-nowrap',
    'pill-dot': 'inline-block w-[6px] h-[6px] shrink-0 rounded-full bg-current',
    'pill-live': 'pill border-live-border bg-live-bg text-live',
    'pill-warning': 'pill border-warning-border bg-warning-bg text-warning',
    'pill-error': 'pill border-error-border bg-error-bg text-error',
    'pill-info': 'pill border-info-border bg-info-bg text-info',
    'pill-neutral': 'pill border-rule bg-sheet text-ink2',
    'pill-muted': 'pill border-dashed border-field bg-paper text-pencil',
    'pill-tag': 'pill border-rule bg-sheet text-ink2 font-mono font-normal',

    // in-panel banners: icon + <p><strong>Title.</strong> One sentence.</p> + one banner-action
    banner: 'flex items-start gap-[10px] px-3 py-[10px] rounded-[10px] border border-solid text-[13px] leading-[1.5] text-ink',
    'banner-info': 'banner border-info-border bg-info-bg [--banner-accent:#2B5C9E]',
    'banner-warning': 'banner border-warning-border bg-warning-bg [--banner-accent:#8A5A00]',
    'banner-error': 'banner border-error-border bg-error-bg [--banner-accent:#B42318]',
    'banner-paused': 'banner border-ink bg-sheet [--banner-accent:#16140F]',
    'banner-action': 'flex-none border-0 bg-transparent p-0 font-sans text-[13px] font-medium text-[var(--banner-accent)] underline underline-offset-3 cursor-pointer',

    // mono caps label above headings and table heads
    eyebrow: 'font-mono text-[12px] tracking-[.08em] uppercase text-pencil',

    // surfaces: flat 1px Rule cards; floating things get shadow-float
    card: 'rounded-[12px] border border-solid border-rule bg-sheet',
    surface: 'card',
    'menu-panel': 'rounded-[12px] border border-solid border-rule bg-sheet p-[6px] shadow-float',
    'menu-item': 'flex w-full items-center gap-[10px] min-h-[34px] px-[10px] rounded-[6px] border-0 bg-transparent font-sans text-[14px] text-ink no-underline outline-none cursor-pointer hover:bg-wash data-[highlighted]:bg-wash',
    'menu-separator': 'my-1 h-px bg-rule2',

    // segmented control: "seg" track with "seg-item" buttons; selected via aria-selected/checked/pressed or Radix data-state
    seg: 'inline-flex gap-[2px] rounded-[7px] border border-solid border-rule bg-paper p-[2px]',
    'seg-item': 'inline-flex items-center justify-center gap-1.5 h-[28px] px-3 rounded-[5px] border border-solid border-transparent bg-transparent font-sans text-[13px] font-medium text-pencil cursor-pointer outline-none focus-visible:shadow-[0_0_0_2px_#16140F] aria-selected:(border-rule bg-sheet text-ink font-semibold) aria-checked:(border-rule bg-sheet text-ink font-semibold) aria-pressed:(border-rule bg-sheet text-ink font-semibold) data-[state=active]:(border-rule bg-sheet text-ink font-semibold)',
    'seg-icon': 'seg-item w-[32px] px-0 aria-checked:shadow-[0_1px_0_rgba(22,20,15,.06)] aria-pressed:shadow-[0_1px_0_rgba(22,20,15,.06)]',

    // 44x26 switch: <button role="switch" aria-checked class="switch"><span class="switch-knob" /></button> (Radix Switch works too)
    switch: 'relative inline-flex flex-none items-center w-[44px] h-[26px] p-[2px] rounded-full border border-solid border-field bg-wash cursor-pointer outline-none transition-colors duration-200 aria-checked:(justify-end border-ink bg-ink) data-[state=checked]:(justify-end border-ink bg-ink) disabled:(opacity-50 cursor-not-allowed) focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]',
    'switch-knob': 'block w-[20px] h-[20px] rounded-full border border-solid border-field bg-white transition-transform duration-200',

    // dark toast (react-toastify is styled the same way in styles/components/toast.scss)
    toast: 'flex items-center gap-[10px] max-w-[360px] px-[14px] py-[11px] rounded-[10px] bg-ink text-paper text-[14px] shadow-float',

    avatar: 'inline-flex shrink-0 items-center justify-center w-[34px] h-[34px] rounded-full bg-ink text-paper font-sans text-[12px] font-semibold',
    kdb: 'inline-flex items-center h-[22px] px-[6px] rounded-[5px] border border-solid border-field border-b-2 bg-sheet font-mono text-[12px] text-ink',

    // page containers: app pages 1312, marketing 1344, both with fluid gutters
    'container-app': 'mx-auto w-full max-w-[1312px] px-[clamp(16px,4vw,64px)]',
    'container-marketing': 'mx-auto w-full max-w-[1344px] px-[clamp(16px,4vw,64px)]',

    'max-w-chat': 'max-w-[var(--chat-max-width)]',
  },
  rules: [
    /**
     * This shorthand doesn't exist in Tailwind and we overwrite it to avoid
     * any conflicts with minified CSS classes.
     */
    ['b', {}],
  ],
  theme: {
    fontFamily: {
      sans: "'Instrument Sans', ui-sans-serif, system-ui, sans-serif",
      serif: "'Instrument Serif', ui-serif, Georgia, serif",
      display: "'Instrument Serif', ui-serif, Georgia, serif",
      mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    boxShadow: {
      float: '0 24px 64px rgba(22,20,15,.18)',
      prompt: '0 1px 0 rgba(22,20,15,.04),0 18px 40px -28px rgba(22,20,15,.35)',
    },
    duration: {
      fast: '120ms',
      base: '200ms',
      slow: '320ms',
    },
    colors: {
      ...COLOR_PRIMITIVES,
      ...PAPER,
      bolt: {
        elements: {
          borderColor: 'var(--bolt-elements-borderColor)',
          borderColorActive: 'var(--bolt-elements-borderColorActive)',
          background: {
            depth: {
              1: 'var(--bolt-elements-bg-depth-1)',
              2: 'var(--bolt-elements-bg-depth-2)',
              3: 'var(--bolt-elements-bg-depth-3)',
              4: 'var(--bolt-elements-bg-depth-4)',
            },
          },
          textPrimary: 'var(--bolt-elements-textPrimary)',
          textSecondary: 'var(--bolt-elements-textSecondary)',
          textTertiary: 'var(--bolt-elements-textTertiary)',
          code: {
            background: 'var(--bolt-elements-code-background)',
            text: 'var(--bolt-elements-code-text)',
          },
          button: {
            primary: {
              background: 'var(--bolt-elements-button-primary-background)',
              backgroundHover: 'var(--bolt-elements-button-primary-backgroundHover)',
              text: 'var(--bolt-elements-button-primary-text)',
            },
            secondary: {
              background: 'var(--bolt-elements-button-secondary-background)',
              backgroundHover: 'var(--bolt-elements-button-secondary-backgroundHover)',
              text: 'var(--bolt-elements-button-secondary-text)',
            },
            danger: {
              background: 'var(--bolt-elements-button-danger-background)',
              backgroundHover: 'var(--bolt-elements-button-danger-backgroundHover)',
              text: 'var(--bolt-elements-button-danger-text)',
            },
          },
          item: {
            contentDefault: 'var(--bolt-elements-item-contentDefault)',
            contentActive: 'var(--bolt-elements-item-contentActive)',
            contentAccent: 'var(--bolt-elements-item-contentAccent)',
            contentDanger: 'var(--bolt-elements-item-contentDanger)',
            backgroundDefault: 'var(--bolt-elements-item-backgroundDefault)',
            backgroundActive: 'var(--bolt-elements-item-backgroundActive)',
            backgroundAccent: 'var(--bolt-elements-item-backgroundAccent)',
            backgroundDanger: 'var(--bolt-elements-item-backgroundDanger)',
          },
          actions: {
            background: 'var(--bolt-elements-actions-background)',
            code: {
              background: 'var(--bolt-elements-actions-code-background)',
            },
          },
          artifacts: {
            background: 'var(--bolt-elements-artifacts-background)',
            backgroundHover: 'var(--bolt-elements-artifacts-backgroundHover)',
            borderColor: 'var(--bolt-elements-artifacts-borderColor)',
            inlineCode: {
              background: 'var(--bolt-elements-artifacts-inlineCode-background)',
              text: 'var(--bolt-elements-artifacts-inlineCode-text)',
            },
          },
          messages: {
            background: 'var(--bolt-elements-messages-background)',
            linkColor: 'var(--bolt-elements-messages-linkColor)',
            code: {
              background: 'var(--bolt-elements-messages-code-background)',
            },
            inlineCode: {
              background: 'var(--bolt-elements-messages-inlineCode-background)',
              text: 'var(--bolt-elements-messages-inlineCode-text)',
            },
          },
          icon: {
            success: 'var(--bolt-elements-icon-success)',
            error: 'var(--bolt-elements-icon-error)',
            primary: 'var(--bolt-elements-icon-primary)',
            secondary: 'var(--bolt-elements-icon-secondary)',
            tertiary: 'var(--bolt-elements-icon-tertiary)',
          },
          preview: {
            addressBar: {
              background: 'var(--bolt-elements-preview-addressBar-background)',
              backgroundHover: 'var(--bolt-elements-preview-addressBar-backgroundHover)',
              backgroundActive: 'var(--bolt-elements-preview-addressBar-backgroundActive)',
              text: 'var(--bolt-elements-preview-addressBar-text)',
              textActive: 'var(--bolt-elements-preview-addressBar-textActive)',
            },
          },
          terminals: {
            background: 'var(--bolt-elements-terminals-background)',
            buttonBackground: 'var(--bolt-elements-terminals-buttonBackground)',
          },
          dividerColor: 'var(--bolt-elements-dividerColor)',
          loader: {
            background: 'var(--bolt-elements-loader-background)',
            progress: 'var(--bolt-elements-loader-progress)',
          },
          prompt: {
            background: 'var(--bolt-elements-prompt-background)',
          },
          sidebar: {
            dropdownShadow: 'var(--bolt-elements-sidebar-dropdownShadow)',
            buttonBackgroundDefault: 'var(--bolt-elements-sidebar-buttonBackgroundDefault)',
            buttonBackgroundHover: 'var(--bolt-elements-sidebar-buttonBackgroundHover)',
            buttonText: 'var(--bolt-elements-sidebar-buttonText)',
          },
          cta: {
            background: 'var(--bolt-elements-cta-background)',
            text: 'var(--bolt-elements-cta-text)',
          },
        },
      },
    },
  },
  transformers: [transformerDirectives()],
  presets: [
    presetUno(),
    presetIcons({
      warn: true,
      collections: {
        ...customIconCollection,
      },
    }),
  ],
});

/**
 * Generates an alpha palette for a given hex color.
 *
 * @param hex - The hex color code (without alpha) to generate the palette from.
 * @returns An object where keys are opacity percentages and values are hex colors with alpha.
 *
 * Example:
 *
 * ```
 * {
 *   '1': '#FFFFFF03',
 *   '2': '#FFFFFF05',
 *   '3': '#FFFFFF08',
 * }
 * ```
 */
function generateAlphaPalette(hex: string) {
  return [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].reduce(
    (acc, opacity) => {
      const alpha = Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');

      acc[opacity] = `${hex}${alpha}`;

      return acc;
    },
    {} as Record<number, string>,
  );
}
