import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from 'ai/react';
import { useLoaderData } from '@remix-run/react';
import { useAnimate } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts, useSnapScroll } from '~/lib/hooks';
import { useChatHistory } from '~/lib/persistence';
import { selectedModel } from '~/lib/stores/model';
import { fixRequest, previewError, quota, requestFix } from '~/lib/stores/ui';
import { PROMPT_KEY } from '~/components/landing/starters';
import { chatStore } from '~/lib/stores/chat';
import { activeTemplate, applyTemplate, prefetchSnapshots, templateStatus, type TemplateCard } from '~/lib/templates/client';
import { chatId, description } from '~/lib/persistence';
import { beginReplay, endReplay } from '~/lib/runtime/action-runner';
import { workbenchStore } from '~/lib/stores/workbench';
import { fileModificationsToHTML } from '~/utils/diff';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import { autoFixAfter, fixInFlight, streamingNow } from './studio-state';

const logger = createScopedLogger('Chat');

const FIX_PROMPT = 'My app hit this error.';

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory } = useChatHistory();

  return (
    <>
      {ready && <ChatImpl initialMessages={initialMessages} storeMessageHistory={storeMessageHistory} />}
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
  const builtAt = useRef(0);
  const replaying = useRef(initialMessages.length > 0);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);


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
    // re-render (and re-parse) at most every 50ms instead of on every streamed token
    experimental_throttle: 50,
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
      builtAt.current = Date.now();
      // a reply cut off by the length limit gets the cut-off card under it (BaseChat)
    },
    initialMessages,
  });

  const latest = useRef(messages);
  latest.current = messages;

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
      if (replaying.current) {
        replaying.current = false;
        beginReplay();
        parseMessages(messages, isLoading);
        endReplay();
      } else {
        parseMessages(messages, isLoading);
      }
    }

    if (messages.length <= initialMessages.length) {
      return;
    }

    const save = () => storeMessageHistory(latest.current).catch((error) => toast.error(error.message));

    /*
     * Saving on every streamed chunk sent the whole conversation to the server hundreds of times per reply. Save once
     * the reply is done, and every few seconds while it streams so a crash mid-build loses little.
     */
    if (!isLoading) {
      clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      save();
    } else if (!saveTimer.current) {
      saveTimer.current = setTimeout(() => {
        saveTimer.current = undefined;
        save();
      }, 3000);
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

  useEffect(() => streamingNow.set(isLoading), [isLoading]);

  // the error banner says so while a "Fix this error" message is being answered
  useEffect(() => {
    fixInFlight.set(isLoading && (messages.findLast((m) => m.role === 'user')?.content.includes(FIX_PROMPT) ?? false));
  }, [isLoading, messages.length]);

  // Shared-Remix: the first save of a visitor's message makes their own copy
  useEffect(() => {
    if (!(loaderData as { shared?: boolean }).shared) {
      return undefined;
    }

    return chatId.listen((id, old) => {
      if (id && !old) {
        toast.success('Remixed. This copy is yours, and the original stays as it was.');
      }
    });
  }, []);

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

    sendMessage({} as React.UIEvent, `${FIX_PROMPT} Please fix it and tell me in one sentence what went wrong.\n\n${fix.text}`);
  }, [fix?.n]);

  /*
   * An error soon after a build (compile error, crash on load, failed install) gets one automatic fix: in a 40-team test
   * one fix repaired every broken first build, so teams rarely have to see one. Never for a reply that was itself a fix,
   * so it can't loop.
   */
  const autoFixedFor = useRef<string>();
  const fixAfterReply = useRef(false);

  const autoFix = (error: string | undefined) => {
    const last = latest.current.at(-1);
    const asked = latest.current.findLast((m) => m.role === 'user')?.content ?? '';

    if (!error || last?.role !== 'assistant' || autoFixedFor.current === last.id || asked.includes(FIX_PROMPT)) {
      return;
    }

    // the build's commands can fail before the reply has finished: fix it as soon as the reply is done
    if (streamingNow.get()) {
      fixAfterReply.current = true;
      return;
    }

    if (Date.now() - builtAt.current > 180_000) {
      return;
    }

    autoFixedFor.current = last.id;
    autoFixAfter.set(last.id);
    requestFix(error);
  };

  useEffect(() => previewError.listen(autoFix), []);

  useEffect(() => {
    if (!isLoading && fixAfterReply.current) {
      fixAfterReply.current = false;
      autoFix(previewError.get());
    }
  }, [isLoading]);

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
