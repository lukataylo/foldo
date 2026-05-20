import { defineManifest } from '@crxjs/vite-plugin';

// Manifest V3, the extension's only job is to freeze the current state of any
// URL into a Foldo capture frame on the cloud. It cannot receive edit
// dispatches (those flow only through the in-directory MCP).
export const manifest = defineManifest({
  manifest_version: 3,
  name: 'Foldo · Capture',
  description:
    'Freeze the current state of any deployed app into a Foldo canvas frame.',
  version: '0.0.1',
  icons: {
    '16': 'public/icon-16.png',
    '48': 'public/icon-48.png',
    '128': 'public/icon-128.png',
  },
  action: {
    default_title: 'Foldo · Capture',
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'public/icon-16.png',
      '48': 'public/icon-48.png',
      '128': 'public/icon-128.png',
    },
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['activeTab', 'scripting', 'tabs', 'storage'],
  host_permissions: ['<all_urls>'],
  web_accessible_resources: [
    {
      resources: ['public/logo.png', 'public/icon-128.png', 'public/icon-48.png'],
      matches: ['<all_urls>'],
    },
  ],
});
