// Message contracts between the popup, the service worker, and content scripts.
// All payloads are plain JSON-serialisable values — Chrome's runtime APIs only
// marshal structured-clonable data.

import type { CreateCaptureResponse } from '@foldo/protocol';

export type Phase =
  | 'idle'
  | 'reading-tab'
  | 'injecting'
  | 'snapping'
  | 'uploading'
  | 'done'
  | 'error';

export interface Settings {
  cloudUrl: string;
  webUrl: string;
  bearerToken: string;
  boardId: string;
}

/** Result of the in-page DOM/viewport probe. */
export interface PageProbe {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  domSnapshot?: string;
}

// ---------- popup → service worker ----------

export interface CaptureCommand {
  type: 'capture/run';
}

export interface SettingsReadCommand {
  type: 'settings/read';
}

export interface SettingsWriteCommand {
  type: 'settings/write';
  settings: Partial<Settings>;
}

export type ExtensionCommand =
  | CaptureCommand
  | SettingsReadCommand
  | SettingsWriteCommand;

// ---------- service worker → popup ----------

export interface CaptureProgress {
  type: 'capture/progress';
  phase: Phase;
  detail?: string;
}

export interface CaptureSuccess {
  type: 'capture/success';
  frame: CreateCaptureResponse['frame'];
  viewUrl: string;
}

export interface CaptureFailure {
  type: 'capture/failure';
  message: string;
}

export type CaptureEvent = CaptureProgress | CaptureSuccess | CaptureFailure;

// ---------- service worker → content script ----------

export interface BannerCommand {
  type: 'foldo/banner';
  viewUrl: string;
  logoUrl: string;
}
