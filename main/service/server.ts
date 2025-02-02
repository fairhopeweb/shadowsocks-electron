import { IpcMain, clipboard } from 'electron';
import QRCode from 'qrcode';
import fs from 'fs';

import {
  MainService as MainServiceType,
  Config, Settings, ServiceResult, clipboardParseType
} from '../types/extention';
import { ProxyURI } from '../utils/ProxyURI';
import { startClient, stopClient, isConnected } from '../proxy';
import { createHttpServer, stopHttpServer } from '../proxy/http';
import tcpPing from '../utils/tcp-ping';
import { getPathRuntime } from '../electron';
import { parseSubscription, parseUrl } from '../utils/utils';

/* main service handler */
export class MainService implements MainServiceType {
  ipc: IpcMain

  constructor(ipc: IpcMain) {
    this.ipc = ipc;
  }

  async isConnected(): Promise<ServiceResult> {
    return Promise.resolve({
      code: 200,
      result: isConnected()
    });
  }

  async startClient(params: { config: Config, settings: Settings }): Promise<ServiceResult> {
    return startClient(params.config, params.settings);
  }

  async stopClient(): Promise<ServiceResult> {
    return new Promise((resolve) => {
      stopClient()
        .then(() => {
          resolve({
            code: 200,
            result: null
          });
        })
        .catch(error => {
          resolve({
            code: 500,
            result: error.toString()
          });
        })
    });
  }

  async parseClipboardText(params: { text: string, type: clipboardParseType }): Promise<ServiceResult> {
    const text = params.text || clipboard.readText('clipboard');
    const type = params.type || 'url';

    if (type === 'url') return Promise.resolve({
      code: 200,
      result: parseUrl(text)
    });

    if (type === 'subscription') {
      return parseSubscription(text).then(res => {
        if (res.error) {
          return {
            code: 200,
            result: {
              name: '',
              result: []
            }
          };
        }
        return {
          code: 200,
          result: {
            name: res.name || '',
            result: res.result || []
          }
        };
      });
    }

    return Promise.resolve({
      code: 200,
      result: {
        name: '',
        result: []
      }
    });
  }

  async generateUrlFromConfig(params: Config): Promise<ServiceResult> {
    let url: string = '';
    let result: {
      code: number
      result: {
        dataUrl: string
        url: string
        msg?: string
      }
    } = {
      code: 200,
      result: {
        dataUrl: '',
        url: '',
        msg: ''
      }
    };

    switch (params.type) {
      case 'ss':
        url = ProxyURI.generateSS(
          params.serverHost, params.serverPort, params.encryptMethod,
          params.password, params.remark, false
        );
        break;
      case 'ssr':
        url = ProxyURI.generateSSR(
          params.serverHost, params.serverPort, params.encryptMethod,
          params.password, params.remark
        );
        break;
      default:
        break;
    }

    return new Promise((resolve) => {
      if (url) {
        result.result.url = url;
        QRCode.toDataURL(url, function (err, _dataURL) {
          if (!err) {
            result.result.dataUrl = _dataURL;
          } else {
            result.code = 500;
            result.result.msg = err.toString();
          }
          resolve(result);
        });
      } else {
        result.code = 500;
        result.result.msg = `Invalid Conf: ${JSON.stringify(params)}`;
        resolve(result);
      }
    });
  }

  async startHttpProxyServer(params: { port: number, proxyPort: number }) {
    return new Promise(resolve => {
      return createHttpServer({...params, host: '127.0.0.1'}, (error) => {
        resolve({
          code: error ? 500 : 200,
          result: error ?? ''
        });
      });
    });
  }

  async stopHttpProxyServer(params: { port: number }) {
    return new Promise(resolve => {
      return stopHttpServer(params.port, '127.0.0.1', (error) => {
        resolve({
          code: error ? 500 : 200,
          result: error ?? ''
        });
      });
    });
  }

  async tcpPing(params: { host: string, port: number }) {
    return new Promise(resolve => {
      tcpPing({
        host: params.host,
        port: params.port
      }).then(([result, records]) => {
        resolve({
          code: 200,
          result: {
            ...result,
            records: records
          }
        });
      });
    })
  }

  async setAclConfFile(params: { text: string }): Promise<ServiceResult> {
    return new Promise(resolve => {
      return new Promise((resolve, reject) => {
        fs.writeFile(
          getPathRuntime('acl.conf'),
          params.text,
          (err => {
            if (err) reject(err);
            resolve({
              code: 200,
              result: getPathRuntime('acl.conf')
            });
          })
        );
      });
    })
  }
}
