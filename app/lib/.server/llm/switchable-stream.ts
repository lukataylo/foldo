/*
 * One response stream fed by a series of sources (the reply, then each continuation). `onFinish` fires while the last
 * chunks of a source are still in flight, so ending or switching waits for the current source to drain; only `close()`
 * (Stop, a stalled provider) cuts it off.
 */
export default class SwitchableStream extends TransformStream {
  private _controller: TransformStreamDefaultController | null = null;
  private _currentReader: ReadableStreamDefaultReader | null = null;
  private _pumping: Promise<void> = Promise.resolve();
  private _switches = 0;
  private _closed = false;

  constructor() {
    let controllerRef: TransformStreamDefaultController | undefined;

    super({
      start(controller) {
        controllerRef = controller;
      },
    });

    if (controllerRef === undefined) {
      throw new Error('Controller not properly initialized');
    }

    this._controller = controllerRef;
  }

  /** queue a source; it starts once every source queued before it has drained */
  switchSource(newStream: ReadableStream) {
    this._switches++;

    this._pumping = this._pumping.then(() => {
      if (this._closed) {
        newStream.cancel().catch(() => undefined);
        return undefined;
      }

      const reader = newStream.getReader();
      this._currentReader = reader;

      return this._pumpStream(reader);
    });

    return this._pumping;
  }

  private async _pumpStream(reader: ReadableStreamDefaultReader) {
    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done || this._closed) {
          break;
        }

        this._controller?.enqueue(value);
      }
    } catch (error) {
      if (!this._closed) {
        console.log(error);
        this._closed = true;
        this._controller?.error(error);
      }
    }
  }

  /** end once every queued source has delivered everything */
  finish() {
    return this._pumping.then(() => this.#terminate());
  }

  /** end now, dropping whatever the current source still has (Stop, or a provider that stalled) */
  close() {
    this._currentReader?.cancel().catch(() => undefined);
    this.#terminate();
  }

  #terminate() {
    if (this._closed) {
      return;
    }

    this._closed = true;
    this._controller?.terminate();
  }

  get switches() {
    return this._switches;
  }
}
