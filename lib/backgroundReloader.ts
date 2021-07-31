/* eslint-disable @typescript-eslint/no-var-requires */
/* global __resourceQuery */
import SockJS from 'sockjs-client';

import { IReloadMessage } from './index';

const host = __resourceQuery.replace('?', '');

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
