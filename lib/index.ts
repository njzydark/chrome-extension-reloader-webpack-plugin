import chalk from 'chalk';
import glob from 'glob';
import http from 'http';
import path from 'path';
import sockjs, { Connection } from 'sockjs';
import { Compiler } from 'webpack';

export interface IReloadMessage {
  eventName: 'reload';
  data: 'contentScripts' | 'manifest';
}

interface ChromeExtensionReloaderOptions {
  /** @default localhost */
  host?: string;
  /** @default 9988 */
  port?: number;
  entry: {
    background: string;
    popup?: string;
    options?: string;
    contentScriptDirPath?: string;
  };
  manifestPath?: string | string[];
}

const cwd = process.cwd();

const devServerFilePaths = [
  `${cwd}/node_modules/webpack-dev-server/client/index.js`,
  `${cwd}/node_modules/webpack/hot/dev-server.js`
];

let backgroundReloaderPath = `${cwd}/node_modules/chrome-extension-reloader-webpack-plugin/dist/backgroundReloader.js`;
const contentScriptReloaderPath = `${cwd}/node_modules/chrome-extension-reloader-webpack-plugin/dist/contentScriptReloader.js`;

export class ChromeExtensionReloaderWebpackPlugin {
  private name = 'ChromeExtensionReloader';
  private options: ChromeExtensionReloaderOptions;
  private contentScriptNames: string[] = [];
  private sockjsServer: sockjs.Server | undefined;
  private clients: Connection[] = [];
  private hashData = {} as { id: string | number; hash: string };
  private changeFiles: string[] = [];

  constructor(options: ChromeExtensionReloaderOptions) {
    if (!options?.entry?.background) {
      console.log();
      console.error(`${chalk.red(`[${this.name}]`)} Please set background file path in entry option`);
      process.exit(1);
    }
    this.options = {
      host: 'localhost',
      port: 9980,
      ...options
    };
  }

  apply(compiler: Compiler) {
    this.setupWebpackConfig(compiler);

    if (compiler.options.mode !== 'development') {
      return;
    }

    this.setupServer();

    compiler.hooks.done.tap(this.name, stats => {
      const data = stats.toJson();
      const { chunks } = data;
      if (this.options.manifestPath) {
        if (Array.isArray(this.options.manifestPath)) {
          if (this.options.manifestPath.some(item => this.changeFiles.includes(item))) {
            this.sockjsServer!.emit('reload', { type: 'manifest' });
            this.sendReloadMessage('manifest');
            return;
          }
        } else {
          if (this.changeFiles.includes(this.options.manifestPath)) {
            this.sendReloadMessage('manifest');
            return;
          }
        }
      }
      chunks?.forEach(({ id, hash, modules }) => {
        if (typeof id === 'string' && this.contentScriptNames.includes(id)) {
          if (this.hashData[id] && this.hashData[id] !== hash) {
            const relateFiles =
              modules?.filter(item => item.moduleType !== 'runtime').map(item => item.nameForCondition || '') || [];
            const isChange = relateFiles?.filter(item => this.changeFiles.includes(item))?.length > 0;
            if (isChange) {
              console.log();
              console.log(`${chalk.green(`[${this.name}]`)} The content script ${id} file change, start reload...`);
              this.sendReloadMessage('contentScripts');
            }
          }
          this.hashData[id] = hash;
        }
      });
    });

    compiler.hooks.watchRun.tapAsync(this.name, (compiler, cb) => {
      const changeFiles = compiler.modifiedFiles;
      if (changeFiles) {
        this.changeFiles = [...changeFiles];
      }
      cb();
    });
  }

  sendReloadMessage(type: 'contentScripts' | 'manifest') {
    if (this.sockjsServer) {
      if (type === 'manifest') {
        console.log();
        console.log(`${chalk.green(`[${this.name}]`)} The manifest file change, start reload...`);
      }
      const data: IReloadMessage['data'] = type;
      this.sockjsServer.emit('reload', data);
      this.changeFiles = [];
    }
  }

  setupWebpackConfig(compiler: Compiler) {
    const { options: compilerOptions } = compiler;
    const { host, port, entry } = this.options;

    const isDev = compilerOptions.mode === 'development';

    compilerOptions.devServer = {
      host: 'localhost',
      port: 8080,
      ...compilerOptions.devServer,
      injectClient: false,
      injectHot: false,
      hot: true,
      writeToDisk: true,
      disableHostCheck: true
    };

    devServerFilePaths[0] += `?http://${compilerOptions.devServer.host}:${compilerOptions.devServer.port}`;
    backgroundReloaderPath += `?http://${host}:${port}`;

    const backgroundEntry = this.getNormalEntry('background', entry.background, {
      addBackgroundReloaderScripts: isDev,
      addDevServerScripts: isDev
    });
    const popupEntry = entry.popup ? this.getNormalEntry('popup', entry.popup, { addDevServerScripts: isDev }) : {};
    const optionsEntry = entry.options
      ? this.getNormalEntry('options', entry.options, { addDevServerScripts: isDev })
      : {};

    const originEntry =
      Object.prototype.toString.call(compilerOptions.entry) === '[object Object]'
        ? compilerOptions.entry
        : { main: { import: [] } };
    Object.keys(originEntry).forEach(key => {
      if (!originEntry[key].import) {
        originEntry[key].import = [];
      }
    });

    compilerOptions.entry = () =>
      Promise.resolve().then(() => {
        const contentScriptsEntry = this.getDynamicEntry(isDev);
        this.contentScriptNames = Object.keys(contentScriptsEntry);
        return {
          ...originEntry,
          ...backgroundEntry,
          ...popupEntry,
          ...optionsEntry,
          ...contentScriptsEntry
        };
      });

    compilerOptions.devtool = isDev && 'inline-source-map';

    compilerOptions.optimization = {
      ...compilerOptions.optimization,
      splitChunks: {
        cacheGroups: {
          vendor: {
            name: 'vendor',
            chunks(chunk) {
              return ['popup', 'options'].includes(chunk.name);
            },
            test: /[\\/]node_modules[\\/]/,
            priority: -10
          },
          common: {
            chunks(chunk) {
              return ['popup', 'options'].includes(chunk.name);
            },
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true
          }
        }
      },
      runtimeChunk: false
    };
  }

  setupServer() {
    this.sockjsServer = sockjs.createServer({
      sockjs_url: this.options.host,
      prefix: '/chromeExtensionReloader',
      log: () => {}
    });

    this.sockjsServer.on('connection', conn => {
      conn.on('close', () => {
        const index = this.clients.findIndex(item => item.id === conn.id);
        this.clients.splice(index, 1);
        console.log(`${chalk.green(`[${this.name}]`)} close a connection, total: ${this.clients.length}`);
      });
      this.clients.push(conn);
      console.log(`${chalk.green(`[${this.name}]`)} receive new connection, total: ${this.clients.length}`);
    });

    this.sockjsServer.on('reload', (data: IReloadMessage['data']) => {
      const message: IReloadMessage = {
        eventName: 'reload',
        data
      };
      this.clients.forEach(conn => {
        conn.write(JSON.stringify(message));
      });
    });

    const server = http.createServer();
    this.sockjsServer.installHandlers(server);

    server.listen(this.options.port, this.options.host, () => {
      console.log();
      console.log(
        `${chalk.green(`[${this.name}]`)} Running at ${chalk.green(`http://${this.options.host}:${this.options.port}`)}`
      );
    });
  }

  getNormalEntry = (
    entryName: string,
    entryPath?: string,
    options?: { addBackgroundReloaderScripts?: boolean; addDevServerScripts?: boolean }
  ) => {
    if (!entryPath) {
      return {
        [entryName]: {
          import: []
        }
      };
    }
    const entryValue = [entryPath];
    if (options?.addDevServerScripts) {
      entryValue.unshift(...devServerFilePaths);
    }
    if (options?.addBackgroundReloaderScripts) {
      entryValue.unshift(backgroundReloaderPath);
    }
    return {
      [entryName]: {
        import: entryValue
      }
    };
  };

  getDynamicEntry(addContentScriptReloaderScripts = false) {
    const { entry } = this.options;
    if (entry.contentScriptDirPath) {
      const allFilesPath = glob.sync('**/*', {
        cwd: path.join(entry.contentScriptDirPath)
      });
      const allFiles = allFilesPath.reduce<{ name: string; path: string }[]>((acc, cur) => {
        const filePath = path.join(entry.contentScriptDirPath!, cur);
        const pathArr = cur.split('/');
        if (pathArr.length > 2) {
          return acc;
        } else if (pathArr.length === 2) {
          if (/index\.(ts|tsx|js|jsx|vue)$/.test(pathArr[1])) {
            acc.push({
              name: pathArr[0],
              path: filePath
            });
          } else {
            return acc;
          }
        } else {
          if (/.*\.(ts|tsx|js|jsx|vue)$/.test(pathArr[0])) {
            acc.push({
              name: pathArr[0].replace(/\.(ts|tsx|js|jsx|vue)$/, ''),
              path: filePath
            });
          }
        }
        return acc;
      }, []);
      const res = allFiles.reduce<{ [prop: string]: { import: string[] } }>((acc, cur) => {
        acc[cur.name] = { import: [cur.path] };
        if (addContentScriptReloaderScripts) {
          acc[cur.name].import.unshift(contentScriptReloaderPath);
        }
        return acc;
      }, {});
      return res;
    }
    return {};
  }
}
