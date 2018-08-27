import { BrowserWindow, ipcMain, session, webContents } from 'electron';
import { matchesPattern } from '~/utils';
import { resolve } from 'path';

const eventListeners: any = {};

let mainWindow: BrowserWindow;

const getTabIdByWebContentsId = async (webContentsId: number) => {
  return new Promise((resolve: (result: number) => void) => {
    mainWindow.webContents.send('get-tab-id', { webContentsId });

    ipcMain.once('get-tab-id', (e: any, tabId: number) => {
      resolve(tabId);
    });
  });
};

const getRequestType = (type: string): any => {
  if (type === 'mainFrame') return 'main_frame';
  if (type === 'subFrame') return 'sub_frame';
  if (type === 'cspReport') return 'csp_report';
  return type;
};

const getDetails = (details: any) => {
  return new Promise(async resolve => {
    resolve({
      requestId: details.id.toString(),
      url: details.url,
      method: details.method,
      frameId: 0,
      initiator: 'https://www.detectadblock.com',
      parentFrameId: -1,
      tabId: await getTabIdByWebContentsId(details.webContentsId),
      type: getRequestType(details.resourceType),
      timeStamp: Date.now(),
    });
  });
};

const matchesFilter = (filter: any, url: string) => {
  if (filter && Array.isArray(filter.urls)) {
    for (const item of filter.urls) {
      if (matchesPattern(item, url)) {
        return true;
      }
    }
  }
  return false;
};

export const runWebRequestService = (window: BrowserWindow) => {
  mainWindow = window;

  session
    .fromPartition('persist:webviewsession')
    .webRequest.onBeforeSendHeaders(async (details: any, callback: any) => {
      const eventName = 'onBeforeSendHeaders';
      const requestHeaders: object[] = [];

      Object.keys(details.requestHeaders).forEach(k => {
        requestHeaders.push({ name: k, value: details.requestHeaders[k] });
      });

      const newDetails: any = {
        ...(await getDetails(details)),
        requestHeaders,
      };

      let callbackCalled = false;
      let isIntercepted = false;

      if (Array.isArray(eventListeners[eventName])) {
        for (const event of eventListeners[eventName]) {
          if (!matchesFilter(event.filters, details.url)) continue;

          const contents = webContents.fromId(event.webContentsId);
          contents.send(
            `api-webRequest-intercepted-${eventName}-${event.id}`,
            newDetails,
          );

          ipcMain.once(
            `api-webRequest-response-${eventName}-${event.id}`,
            (e: any, res: any) => {
              if (!callbackCalled) {
                if (res) {
                  if (res.cancel) {
                    callback({ cancel: true });
                  } else if (res.requestHeaders) {
                    const requestHeaders: any = {};
                    res.requestHeaders.forEach((requestHeader: any) => {
                      requestHeaders[requestHeader.name] = requestHeader.value;
                    });
                    callback({ requestHeaders, cancel: false });
                  }
                } else {
                  callback({ cancel: false });
                }

                callbackCalled = true;
              }
            },
          );

          isIntercepted = true;
        }
      }

      if (!isIntercepted) {
        callback({ cancel: false });
      }
    });

  session
    .fromPartition('persist:webviewsession')
    .webRequest.onBeforeRequest(async (details, callback) => {
      const eventName = 'onBeforeRequest';
      const newDetails = await getDetails(details);

      let callbackCalled = false;
      let isIntercepted = false;

      const cb = (data: any) => {
        callback(data);
        callbackCalled = true;
      };

      if (Array.isArray(eventListeners[eventName])) {
        for (const event of eventListeners[eventName]) {
          if (!matchesFilter(event.filters, details.url)) continue;

          const contents = webContents.fromId(event.webContentsId);
          contents.send(
            `api-webRequest-intercepted-${eventName}-${event.id}`,
            newDetails,
          );

          ipcMain.once(
            `api-webRequest-response-${eventName}-${event.id}`,
            (e: any, res: any) => {
              if (!callbackCalled) {
                if (res) {
                  if (res.cancel) {
                    cb({ cancel: true });
                  } else if (res.redirectUrl) {
                    cb({ cancel: false, redirectURL: res.redirectUrl });
                  }
                } else {
                  cb({ cancel: false });
                }
              }
            },
          );

          isIntercepted = true;
        }
      }

      if (!isIntercepted) {
        cb({ cancel: false });
      }
    });

  ipcMain.on('api-add-webRequest-listener', (e: any, data: any) => {
    const { id, name, filters } = data;

    const item: any = {
      id,
      filters,
      webContentsId: e.sender.id,
    };

    if (eventListeners[name]) {
      eventListeners[name].push(item);
    } else {
      eventListeners[name] = [item];
    }
  });

  ipcMain.on('api-remove-webRequest-listener', (e: any, data: any) => {
    const { id, name } = data;
    if (eventListeners[name]) {
      eventListeners[name] = eventListeners[name].filter(
        (x: any) => x.id !== id && x.webContentsId !== e.sender.id,
      );
    }
  });
};