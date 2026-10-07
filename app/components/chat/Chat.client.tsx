import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from 'ai/react';
import { useLoaderData } from '@remix-run/react';
import { useAnimate } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts, useSnapScroll } from '~/lib/hooks';
import { useChatHistory } from '~/lib/persistence';
import { selectedModel } from '~/lib/stores/model';
import { fixRequest, quota } from '~/lib/stores/ui';
import { PROMPT_KEY } from '~/components/landing/starters';
import { chatStore } from '~/lib/stores/chat';
import { activeTemplate, applyTemplate, prefetchSnapshots, templateStatus, type TemplateCard } from '~/lib/templates/client';
import { description } from '~/lib/persistence';
import { workbenchStore } from '~/lib/stores/workbench';
import { fileModificationsToHTML } from '~/utils/diff';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory } = useChatHistory();

  return (
    <>
      {ready && <ChatImpl initialMessages={initialMessages} storeMessageHistory={storeMessageHistory} />}
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          /**
           * @todo Handle more types if we need them. This may require extra color palettes.
           */
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
      />
    </>
  );
}

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
}

export const ChatImpl = memo(({ initialMessages, storeMessageHistory }: ChatProps) => {
  useShortcuts();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);

  const { showChat } = useStore(chatStore);

  const [animationScope, animate] = useAnimate();

  const model = useStore(selectedModel);
  const template = useStore(activeTemplate);
  const status = useStore(templateStatus);
  const loaderData = useLoaderData() as { template?: string; templates?: TemplateCard[] };
  const templates = loaderData.templates ?? [];

  // reopening a template project: put the template back before any saved edits are replayed on top of it
  const [tplReady, setTplReady] = useState(!loaderData.template);

  const { messages, isLoading, input, handleInputChange, setInput, setMessages, stop, append } = useChat({
    api: '/api/chat',
    body: { provider: model, template },
    onResponse: (response) => {
      const left = response.headers.get('X-Foldo-Remaining');

      if (left !== null) {
        quota.set(Number(left));
      }
    },
    onError: (error) => {
      logger.error('Request failed\n\n', error);

      // our API answers with short plain-text messages written for the user; anything else is a transport error
      const known = error.message.length < 240 && !/^[<{]/.test(error.message);

      toast.error(known ? error.message : 'Something went wrong on our side. Press send to try again.');
    },
    onFinish: () => {
      logger.debug('Finished streaming');
    },
    initialMessages,
  });

  const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
  const { parsedMessages, parseMessages } = useMessageParser();

  const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

  useEffect(() => {
    chatStore.setKey('started', initialMessages.length > 0);

    if (loaderData.template) {
      applyTemplate(loaderData.template, templates.find((t) => t.id === loaderData.template)?.title)
        .catch(() => toast.error('Could not set up the template. Reload to try again.'))
        .finally(() => setTplReady(true));
    }

    // warm the shared packages download a bit later, staggered so a whole room does not hit the network at once
    prefetchSnapshots(['core']);

    // a template chosen on the landing page survives sign-up too
    try {
      const pendingTemplate = sessionStorage.getItem('foldo_template');

      if (pendingTemplate && initialMessages.length === 0) {
        sessionStorage.removeItem('foldo_template');
        startTemplate(pendingTemplate);
      }
    } catch {
      // storage unavailable
    }

    // a prompt typed on the landing page survives sign-up via sessionStorage
    try {
      const pending = sessionStorage.getItem(PROMPT_KEY);

      if (pending && initialMessages.length === 0) {
        sessionStorage.removeItem(PROMPT_KEY);
        setInput(pending);
        textareaRef.current?.focus();
      }
    } catch {
      // storage unavailable: nothing to restore
    }
  }, []);

  useEffect(() => {
    // saved edits replay only after the template underneath them is in place
    if (tplReady) {
      parseMessages(messages, isLoading);
    }

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  }, [messages, isLoading, parseMessages, tplReady]);

  const scrollTextArea = () => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  };

  const abort = () => {
    stop();
    chatStore.setKey('aborted', true);
    workbenchStore.abortAllActions();
  };

  useEffect(() => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.style.height = 'auto';

      const scrollHeight = textarea.scrollHeight;

      textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
      textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    }
  }, [input, textareaRef]);

  const runAnimation = async () => {
    if (chatStarted) {
      return;
    }

    await Promise.all([
      animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
      animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
    ]);

    chatStore.setKey('started', true);

    setChatStarted(true);
  };

  // "Fix this error" buttons elsewhere in the UI land here
  const fix = useStore(fixRequest);

  useEffect(() => {
    if (!fix) {
      return;
    }

    if (isLoading) {
      toast.info('Wait for the current build to finish, then press Fix this error again.');

      return;
    }

    sendMessage({} as React.UIEvent, `My app hit this error. Please fix it and tell me in one sentence what went wrong.\n\n${fix.text}`);
  }, [fix?.n]);

  // start a project from a template: instant working app, no AI call (and no tokens) until the team asks for changes
  const startTemplate = async (id: string) => {
    const t = templates.find((x) => x.id === id);

    if (!t || isLoading) {
      return;
    }

    activeTemplate.set(id);
    description.set(t.title);
    chatStore.setKey('aborted', false);
    // switch to the chat view right away (the fade animation depends on animation frames, which a background tab never gets)
    chatStore.setKey('started', true);
    setChatStarted(true);
    setMessages([{ id: 'tpl-intro', role: 'assistant', content: `__TEMPLATE__:${id}` }]);
    setTplReady(false);

    try {
      await applyTemplate(id, t.title);
    } catch {
      toast.error('Could not set up the template. Please try again.');
    } finally {
      setTplReady(true);
    }
  };

  const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
    const _input = messageInput || input;

    if (!tplReady) {
      toast.info('Still setting up your template. One moment...');

      return;
    }

    if (_input.length === 0 || isLoading) {
      return;
    }

    /**
     * @note (delm) Usually saving files shouldn't take long but it may take longer if there
     * many unsaved files. In that case we need to block user input and show an indicator
     * of some kind so the user is aware that something is happening. But I consider the
     * happy case to be no unsaved files and I would expect users to save their changes
     * before they send another message.
     */
    await workbenchStore.saveAllFiles();

    const fileModifications = workbenchStore.getFileModifcations();

    chatStore.setKey('aborted', false);

    runAnimation();

    if (fileModifications !== undefined) {
      const diff = fileModificationsToHTML(fileModifications);

      /**
       * If we have file modifications we append a new user message manually since we have to prefix
       * the user input with the file modifications and we don't want the new user input to appear
       * in the prompt. Using `append` is almost the same as `handleSubmit` except that we have to
       * manually reset the input and we'd have to manually pass in file attachments. However, those
       * aren't relevant here.
       */
      append({ role: 'user', content: `${diff}\n\n${_input}` });

      /**
       * After sending a new message we reset all modifications since the model
       * should now be aware of all the changes.
       */
      workbenchStore.resetAllFileModifications();
    } else {
      append({ role: 'user', content: _input });
    }

    setInput('');

    resetEnhancer();

    textareaRef.current?.blur();
  };

  const [messageRef, scrollRef] = useSnapScroll();

  return (
    <BaseChat
      ref={animationScope}
      textareaRef={textareaRef}
      input={input}
      showChat={showChat}
      chatStarted={chatStarted}
      isStreaming={isLoading}
      enhancingPrompt={enhancingPrompt}
      promptEnhanced={promptEnhanced}
      sendMessage={sendMessage}
      messageRef={messageRef}
      scrollRef={scrollRef}
      handleInputChange={handleInputChange}
      handleStop={abort}
      onStartTemplate={startTemplate}
      messages={messages.map((message, i) => {
        if (message.role === 'user') {
          return message;
        }

        return {
          ...message,
          content: parsedMessages[i] || '',
        };
      })}
      enhancePrompt={() => {
        enhancePrompt(input, (input) => {
          setInput(input);
          scrollTextArea();
        });
      }}
    />
  );
});
