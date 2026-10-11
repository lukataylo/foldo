import path from 'node:path';
import { vitePlugin as remixVitePlugin } from '@remix-run/dev';
import UnoCSS from 'unocss/vite';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig((config) => {
  return {
    build: {
      target: 'esnext',
    },
    plugins: [
      ssrNodePath(),
      nodePolyfills({
        include: ['path', 'buffer'],
        // the default process shim would hide the real process.env on the server
        globals: { process: false },
      }),
      remixVitePlugin({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
        },
      }),
      UnoCSS(),
      tsconfigPaths(),
      chrome129IssuePlugin(),
      config.mode === 'production' && optimizeCssModules({ apply: 'build' }),
    ],
  };
});

/*
 * nodePolyfills aliases node:path to path-browserify for every environment. The production server build is fine, but the
 * dev server's SSR loader then evaluates that CommonJS file and fails ("module is not defined"), so in dev the server
 * gets the real node:path back.
 */
function ssrNodePath(): Plugin {
  const shim = '\0foldo-node-path';
  const names = Object.keys(path).filter((k) => /^[a-z]\w*$/i.test(k));

  return {
    name: 'foldo-ssr-node-path',
    apply: 'serve',
    enforce: 'pre',
    resolveId(id, _importer, options) {
      return options?.ssr && /(^|\/)path-browserify(\/|$)/.test(id) ? shim : undefined;
    },
    load(id) {
      return id === shim
        ? `const p = process.getBuiltinModule('node:path');\nexport default p;\nexport const { ${names.join(', ')} } = p;`
        : undefined;
    },
  };
}

function chrome129IssuePlugin() {
  return {
    name: 'chrome129IssuePlugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const raw = req.headers['user-agent']?.match(/Chrom(e|ium)\/([0-9]+)\./);

        if (raw) {
          const version = parseInt(raw[2], 10);

          if (version === 129) {
            res.setHeader('content-type', 'text/html');
            res.end(
              '<body><h1>Please use Chrome Canary for testing.</h1><p>Chrome 129 has an issue with JavaScript modules & Vite local development, see <a href="https://github.com/stackblitz/bolt.new/issues/86#issuecomment-2395519258">for more information.</a></p><p><b>Note:</b> This only impacts <u>local development</u>. `pnpm run build` and `pnpm run start` will work fine in this browser.</p></body>',
            );

            return;
          }
        }

        next();
      });
    },
  };
}
