# chrome-extension-reloader-webpack-plugin

A webpack plugin to auto reloader when content scripts change

## Features

- Support auto reload when content scripts change
- Support dynamic generate content scripts

## Usage

```bash
npm i -D chrome-extension-reloader-webpack-plugin
```

add to webpack config

```js
...
import { ChromeExtensionReloaderWebpackPlugin } from 'chrome-extension-reloader-webpack-plugin';

import pkg from '../package.json';

const chromeMainfestVersion = pkg.chromeExtension['mainifest-version'];
...

{
  plugins:[
    ...
    new ChromeExtensionReloaderWebpackPlugin({
      manifestPath: path.resolve(__dirname, '../src/manifest.v2.json'),
      entry: {
        background: path.resolve(
          __dirname,
          chromeMainfestVersion === 3 ? '../src/background/v3.ts' : '../src/background/v2.ts'
        ),
        popup: path.resolve(__dirname, '../src/popup/index.tsx'),
        options: path.resolve(__dirname, '../src/options/index.tsx'),
        contentScriptDirPath: path.resolve(__dirname, '../src/contents')
      }
    }),
    ...
  ]
}
```

## Options

- host - default localhost
- port - default 9988
- manifestPath - when manifest change, reloader extension
- entry
  - background - required background file path
  - popup - popup file path
  - options - options file path
  - contentScriptDirPath

### ContentScriptDirPath

All content script in this directory will dynamic generate（**There can only be two levels of nesting**）

If the contentScriptDirPath is `contents`:

```txt
contents/test.js 🆗

contents/test/index.js 🆗

contents/test/a.js 🚫

contents/test/t/index.js 🚫
```

## PS

Because background and content script file can't import other file, so this plugin will override some webpack options for chrome extension dev

- devServer
- devtool
- optimization
  - splitChunks
  - runtimeChunk

### devServer

```json
{
  host: "localhost",
  port: 8080,
  ...your options,
  injectClient: false,
  injectHot: false,
  hot: true,
  writeToDisk: true,
  disableHostCheck: true,
}
```

### devtool

For debug by vscode, this options will use `inline-source-map`

### optimization

Because background js can't import file, so this option will use:

```js
splitChunks: {
  cacheGroups: {
    vendor: {
      name: "vendor",
      chunks(chunk) {
        return ["popup", "options"].includes(chunk.name);
      },
      test: /[\\/]node_modules[\\/]/,
      priority: -10,
    },
    common: {
      chunks(chunk) {
        return ["popup", "options"].includes(chunk.name);
      },
      minChunks: 2,
      priority: -20,
      reuseExistingChunk: true,
    },
  },
},
runtimeChunk: false,
```

## Projects

- [chrome-extension-boilerplate](https://github.com/njzydark/chrome-extension-boilerplate) - A chrome extension boilerplate by Webpack5 + TS + React
