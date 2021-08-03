/* eslint-disable @typescript-eslint/no-var-requires */
/* global __resourceQuery */
import SockJS from 'sockjs-client';

import { IReloadMessage } from './index';

const queryData = __resourceQuery.replace('?', '').split('&');

// eslint-disable-next-line prefer-destructuring
const host = queryData[0];
const debugPages = queryData.length > 1 ? queryData[1].split(',') : [];

const extensionId = chrome.runtime.id;

const openDebugPages = () => {
  if (debugPages.length > 0 && extensionId) {
    debugPages.forEach(page => {
      chrome.tabs.create({ url: `chrome-extension://${extensionId}/${page}.html`, active: false });
    });
  }
};

chrome.runtime.onInstalled.addListener(() => {
  openDebugPages();
});

const sockjsClient = new SockJS(`${host}/chromeExtensionReloader`);

sockjsClient.onopen = function () {
  console.log(
    '%c [ChromeExtensionReloader] Connection success ',
    'background:#41b883 ; padding: 1px; border-radius: 3px;  color: #fff'
  );
};

sockjsClient.onmessage = function (e) {
  const res: IReloadMessage = JSON.parse(e.data);
  if (res.eventName === 'reload') {
    console.log(
      `%c [ChromeExtensionReloader] Detect ${res.data} file change `,
      'background:#41b883 ; padding: 1px; border-radius: 3px;  color: #fff'
    );
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, 'reload');
        }
      });
      chrome.runtime.reload();
    });
  }
};
