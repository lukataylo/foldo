import { useState } from 'react';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('usePromptEnhancement');

const FAILED = "Couldn't improve that prompt just now. Press the sparkle to try again.";

export function usePromptEnhancer() {
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [promptEnhanced, setPromptEnhanced] = useState(false);

  const resetEnhancer = () => {
    setEnhancingPrompt(false);
    setPromptEnhanced(false);
  };

  /*
   * Streams the improved prompt into the composer. Any failure (offline, quota, model down, a stream that breaks
   * halfway) puts the team's own prompt back and says why in a toast; the error text never lands in the composer.
   */
  const enhancePrompt = async (input: string, setInput: (value: string) => void) => {
    setEnhancingPrompt(true);
    setPromptEnhanced(false);

    const fail = (message: string) => {
      setInput(input);
      setEnhancingPrompt(false);
      toast.error(message);
    };

    let response: Response;

    try {
      response = await fetch('/api/enhancer', {
        method: 'POST',
        body: JSON.stringify({
          message: input,
        }),
      });
    } catch {
      fail("Couldn't reach Foldo. Check your connection and try again.");
      return;
    }

    const reader = response.ok ? response.body?.getReader() : undefined;

    if (!reader) {
      // our API answers with short plain-text messages written for the user
      const text = await response.text().catch(() => '');
      fail(text && text.length < 240 && !/^[<{]/.test(text) ? text : FAILED);
      return;
    }

    const decoder = new TextDecoder();
    let improved = '';

    try {
      setInput('');

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        improved += decoder.decode(value, { stream: true });

        logger.trace('Set input', improved);

        setInput(improved);
      }
    } catch (error) {
      logger.error(error);
      fail(FAILED);
      return;
    }

    if (!improved.trim()) {
      fail(FAILED);
      return;
    }

    setEnhancingPrompt(false);
    setPromptEnhanced(true);
    setTimeout(() => setInput(improved));
  };

  return { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer };
}
