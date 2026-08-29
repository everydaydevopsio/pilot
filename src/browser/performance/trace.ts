import type { Client } from 'chrome-remote-interface';

const MAX_TRACE_EVENTS = 100000;

export interface TraceState {
  tracing: boolean;
  events: unknown[];
  listenerClient: WeakRef<Client> | null;
}

export function createTraceState(): TraceState {
  return { tracing: false, events: [], listenerClient: null };
}

export async function startTrace(
  client: Client,
  state: TraceState
): Promise<void> {
  if (state.tracing) {
    throw new Error('Tracing is already active. Stop it first.');
  }

  state.events = [];
  state.tracing = true;

  // Only attach listener if not already attached to this client
  if (state.listenerClient?.deref() !== client) {
    client.Tracing.dataCollected((params) => {
      if (state.events.length < MAX_TRACE_EVENTS) {
        state.events.push(...params.value);
      }
    });
    state.listenerClient = new WeakRef(client);
  }

  await client.Tracing.start({
    categories:
      'devtools.timeline,loading,v8,v8.execute,blink.user_timing,navigation',
    transferMode: 'ReportEvents'
  });
}

export async function stopTrace(
  client: Client,
  state: TraceState
): Promise<unknown[]> {
  if (!state.tracing) {
    throw new Error('No active trace. Call start first.');
  }

  await new Promise<void>((resolve) => {
    client.Tracing.tracingComplete(() => {
      resolve();
    });
    void client.Tracing.end();
  });

  state.tracing = false;
  return state.events;
}
