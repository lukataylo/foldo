import type React from 'react';
import { Icon } from '~/components/ui/icons';
import { classNames } from '~/utils/classNames';
import { ModelPicker } from './ModelPicker';
import { SIcon } from './studio-icons';

interface ComposerProps {
  variant: 'hero' | 'home' | 'studio';
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  input: string;
  placeholder: string;
  isStreaming: boolean;
  enhancingPrompt: boolean;
  promptEnhanced: boolean;
  left?: number;
  offline?: boolean;
  autoFocus?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSend?: (event: React.SyntheticEvent) => void;
  onStop?: () => void;
  onEnhance?: () => void;
}

const left$ = (n?: number) => (n === undefined ? null : `${n} ${n === 1 ? 'message' : 'messages'} left today`);

/*
 * The prompt box. "studio" is the chat composer (Build-* boards): white field, pencil "Enhance prompt" square, messages
 * left, then Send (yellow once there is text) or Stop (Ink) while Foldo is writing. "home" is the larger box the Home
 * board puts in its hero (Enhance prompt text button, model, Build).
 */
export function Composer(props: ComposerProps) {
  const { variant, textareaRef, input, placeholder, isStreaming, enhancingPrompt, promptEnhanced, left, offline } = props;
  const empty = input.trim().length === 0;
  const hero = variant === 'hero';
  const home = variant === 'home' || hero;

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();

      if (!offline && !isStreaming) {
        props.onSend?.(event);
      }
    }
  };

  const enhance = (
    <button
      type="button"
      aria-label="Enhance prompt"
      title={promptEnhanced ? 'Prompt enhanced' : 'Enhance prompt'}
      aria-busy={enhancingPrompt || undefined}
      disabled={empty || enhancingPrompt}
      onClick={() => props.onEnhance?.()}
      className={classNames(
        'inline-flex flex-none items-center justify-center gap-[6px] rounded-[6px] border border-rule bg-sheet text-ink2 outline-none transition-colors duration-120 enabled:hover:bg-wash disabled:cursor-default focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]',
        hero ? 'h-[40px] w-[40px] rounded-[8px] text-ink' : home ? 'h-[36px] px-[10px] text-[13px] font-medium text-ink' : 'h-[32px] w-[32px]',
        { 'border-ink': promptEnhanced },
      )}
    >
      {enhancingPrompt ? <SIcon.Arc size={15} /> : <Icon.Pencil size={hero ? 18 : home ? 16 : 15} />}
      {home && !hero && (enhancingPrompt ? 'Enhancing…' : promptEnhanced ? 'Prompt enhanced' : 'Enhance prompt')}
    </button>
  );

  const action = isStreaming ? (
    <button
      type="button"
      data-testid="foldo-stop"
      onClick={() => props.onStop?.()}
      className="btn-dark ml-auto h-[32px] gap-[6px] rounded-[7px] px-3 text-[13px]"
    >
      <Icon.Stop size={12} /> Stop
    </button>
  ) : (
    <span className="relative ml-auto flex">
      {offline && (
        <span
          id="foldo-send-tip"
          role="tooltip"
          className="absolute bottom-[calc(100%+8px)] right-0 whitespace-nowrap rounded-[6px] bg-ink px-[10px] py-[6px] text-[12px] font-medium text-paper"
        >
          Waiting for connection
          <span aria-hidden="true" className="absolute right-[22px] top-full h-0 w-0 border-x-[5px] border-t-[5px] border-x-transparent border-t-ink" />
        </span>
      )}
      <button
        type="submit"
        aria-label={home ? 'Build' : 'Send message'}
        aria-describedby={offline ? 'foldo-send-tip' : undefined}
        disabled={empty || offline}
        data-testid="foldo-send"
        className={classNames(
          hero ? 'btn-dark' : 'btn-primary',
          'disabled:!border-rule disabled:!bg-wash disabled:!text-pencil',
          hero ? 'min-h-[44px] gap-2 rounded-[8px] px-[18px] text-[15px]' : home ? 'h-[40px] gap-[6px] rounded-[8px] px-4 text-[14px]' : 'h-[32px] gap-[6px] rounded-[7px] px-3 text-[13px] enabled:h-[34px] enabled:rounded-[8px] enabled:-my-[1px]',
        )}
      >
        {home ? 'Build' : 'Send'} <Icon.ArrowRight size={home ? 16 : 14} />
      </button>
    </span>
  );

  return (
    <form
      className={classNames(
        'flex flex-col border border-solid border-field bg-sheet transition-[border-color,box-shadow] duration-120 focus-within:border-ink focus-within:shadow-[0_0_0_3px_rgba(255,194,26,.45)]',
        hero
          ? 'gap-[10px] rounded-[16px] !border-[rgba(22,20,15,.10)] px-6 pb-4 pt-5 shadow-float'
          : home
            ? 'gap-3 rounded-[10px] px-4 pb-3 pt-4 shadow-prompt'
            : 'gap-2 rounded-[10px] px-3 pb-2 pt-3',
      )}
      onSubmit={(event) => {
        event.preventDefault();

        if (!offline && !isStreaming) {
          props.onSend?.(event);
        }
      }}
    >
      <label htmlFor="chat-input" className={hero ? 'text-[14px] font-medium text-ink' : 'sr-only'}>
        {home ? 'Describe your app' : 'Ask for a change'}
      </label>
      <textarea
        id="chat-input"
        ref={textareaRef}
        rows={home ? 3 : 2}
        autoFocus={props.autoFocus}
        value={input}
        onChange={props.onChange}
        readOnly={!props.onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        translate="no"
        className={classNames(
          'm-0 w-full resize-none border-0 bg-transparent p-0 font-sans text-ink outline-none',
          hero ? 'min-h-[76px] text-[17px] leading-[1.5]' : home ? 'min-h-[72px] text-[16px] leading-[1.5]' : 'min-h-[42px] text-[14px] leading-[1.5]',
        )}
      />
      <div
        className={classNames('flex items-center', {
          'gap-2': !hero,
          'flex-wrap border-t border-rule2 pt-[10px]': home && !hero,
          'mt-1 gap-3 border-t border-rule2 pt-3': hero,
        })}
      >
        {enhance}
        {home && !hero && <ModelPicker />}
        {left !== undefined && (
          <span
            className={classNames('text-pencil', hero ? 'font-mono text-[12px]' : home ? 'ml-1 text-[13px]' : 'text-[12px]')}
            data-testid="foldo-messages-left"
          >
            {left$(left)}
          </span>
        )}
        {action}
      </div>
    </form>
  );
}
