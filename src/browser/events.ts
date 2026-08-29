import type { Client } from 'chrome-remote-interface';

/**
 * Normalize CDP console level names to match ConsoleLevel.
 * CDP uses "warning" for console.warn; normalize to "warn".
 */
function normLevel(raw: string): string {
  return raw === 'warning' ? 'warn' : raw;
}

export function attachEventListeners(
  client: Client,
  opts: {
    emit: (event: string, data: unknown) => void;
    onDisconnect: () => void;
    pendingNetworkRequests: Set<string>;
    checkNetworkIdle: () => void;
    onFrameNavigated: (url: string) => void;
  }
): void {
  client.on('disconnect', () => {
    opts.onDisconnect();
  });

  // Console events
  client.Runtime.consoleAPICalled((params) => {
    const text = params.args
      .map((a) =>
        a.value !== undefined ? String(a.value) : (a.description ?? '')
      )
      .join(' ');
    opts.emit('console_message', {
      level: normLevel(params.type),
      text,
      url: params.stackTrace?.callFrames?.[0]?.url ?? '',
      lineNumber: params.stackTrace?.callFrames?.[0]?.lineNumber ?? 0,
      timestamp: Date.now()
    });
  });

  client.Console.messageAdded((params) => {
    opts.emit('console_message', {
      level: normLevel(params.message.level),
      text: params.message.text,
      url: params.message.url ?? '',
      lineNumber: params.message.line ?? 0,
      timestamp: Date.now()
    });
  });

  // Runtime exceptions
  client.Runtime.exceptionThrown((params) => {
    const ex = params.exceptionDetails;
    const message = ex.exception?.description ?? ex.text ?? 'Unknown exception';
    const frames = ex.stackTrace?.callFrames?.map((f) => ({
      url: f.url,
      functionName: f.functionName,
      lineNumber: f.lineNumber,
      columnNumber: f.columnNumber
    }));

    const topFrame = frames?.[0];
    opts.emit('console_message', {
      level: 'error',
      text: message,
      url: ex.url ?? topFrame?.url ?? '',
      lineNumber: ex.lineNumber ?? topFrame?.lineNumber ?? 0,
      columnNumber: ex.columnNumber ?? topFrame?.columnNumber,
      timestamp: Date.now(),
      stackFrames: frames,
      isException: true
    });
  });

  // Network events
  client.Network.requestWillBeSent((params) => {
    opts.pendingNetworkRequests.add(params.requestId);
    opts.emit('network_request', {
      requestId: params.requestId,
      url: params.request.url,
      method: params.request.method,
      timestamp: Date.now()
    });
  });

  client.Network.responseReceived((params) => {
    opts.pendingNetworkRequests.delete(params.requestId);
    opts.checkNetworkIdle();
    opts.emit('network_response', {
      requestId: params.requestId,
      url: params.response.url,
      status: params.response.status,
      mimeType: params.response.mimeType,
      fromCache: params.response.fromDiskCache ?? false,
      timestamp: Date.now()
    });
  });

  client.Network.loadingFailed((params) => {
    opts.pendingNetworkRequests.delete(params.requestId);
    opts.checkNetworkIdle();
    opts.emit('network_failed', {
      requestId: params.requestId,
      url: '',
      errorText: params.errorText,
      timestamp: Date.now()
    });
  });

  client.Network.loadingFinished((params) => {
    opts.pendingNetworkRequests.delete(params.requestId);
    opts.checkNetworkIdle();
  });

  // Page navigation
  client.Page.frameNavigated((params) => {
    if (params.frame.parentId === undefined) {
      opts.onFrameNavigated(params.frame.url);
    }
  });
}
