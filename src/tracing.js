const DEFAULT_TRACE_HEADER = 'x-async-db-request-id';

export function resolveTraceOptions(explicitTrace, configTrace) {
  const source = explicitTrace === undefined ? configTrace : explicitTrace;
  if (source === false || source === undefined || source === null) {
    return null;
  }

  const options = source === true
    ? {}
    : typeof source === 'object'
      ? source
      : {};

  if (options.enabled === false) {
    return null;
  }

  return {
    enabled: true,
    slowMs: Math.max(0, Number(options.slowMs ?? 0)),
    console: options.console !== false,
    events: options.events !== false,
    header: typeof options.header === 'string' && options.header.trim()
      ? options.header.trim().toLowerCase()
      : DEFAULT_TRACE_HEADER,
  };
}

export function createRequestTrace(db, request, options = {}) {
  const traceOptions = resolveTraceOptions(options.trace, db?.config?.server?.trace);
  if (!traceOptions) {
    return null;
  }

  const url = new URL(request.url ?? '/', 'http://db.local');
  return new RequestTrace(traceOptions, request, url);
}

export class RequestTrace {
  constructor(options, request, url) {
    this.options = options;
    this.start = now();
    this.headerAttached = false;
    this.event = {
      type: 'request-trace',
      requestId: requestId(),
      timestamp: new Date().toISOString(),
      method: String(request.method ?? 'GET').toUpperCase(),
      pathname: url.pathname,
      queryKeys: [...new Set([...url.searchParams.keys()])].sort(),
      route: null,
      resource: null,
      operation: null,
      id: null,
      status: null,
      handled: false,
      durationMs: 0,
      slow: false,
      phases: [],
    };
  }

  markHandled(response) {
    this.event.handled = true;
    this.attachResponseHeader(response);
  }

  setRoute(details = {}) {
    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined && value !== null && value !== '') {
        this.event[key] = value;
      }
    }
  }

  addPhase(name, durationMs, details = {}) {
    const phase = {
      name,
      durationMs: roundMs(durationMs),
    };
    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined && value !== null) {
        phase[key] = value;
      }
    }
    this.event.phases.push(phase);
  }

  timeSync(name, fn, details = {}) {
    const start = now();
    try {
      return fn();
    } finally {
      this.addPhase(name, now() - start, details);
    }
  }

  async time(name, fn, details = {}) {
    const start = now();
    try {
      return await fn();
    } finally {
      this.addPhase(name, now() - start, details);
    }
  }

  setError(error) {
    if (!error) {
      return;
    }
    if (typeof error.status === 'number') {
      this.event.status = error.status;
    }
    const code = error.code ? String(error.code) : 'ERROR';
    this.event.error = {
      code,
      message: safeErrorMessage(code),
    };
  }

  finish(db, response) {
    if (!this.event.handled) {
      return null;
    }

    const status = responseStatus(response);
    if (status !== null) {
      this.event.status = status;
    }
    this.captureSerializedError(response);
    this.event.durationMs = roundMs(now() - this.start);
    this.event.slow = this.event.durationMs >= this.options.slowMs;

    const traceEvent = compactEvent(this.event);
    if (this.options.events && typeof db?.events?.emit === 'function') {
      db.events.emit(traceEvent);
    }
    if (this.options.console) {
      writeConsoleTrace(traceEvent);
    }
    return traceEvent;
  }

  attachResponseHeader(response) {
    if (this.headerAttached || !response || !this.options.header) {
      return;
    }
    this.headerAttached = true;

    if (typeof response.setHeader === 'function') {
      response.setHeader(this.options.header, this.event.requestId);
      return;
    }

    if (typeof response.writeHead !== 'function') {
      return;
    }

    const originalWriteHead = response.writeHead.bind(response);
    response.writeHead = (status, ...args) => {
      return originalWriteHead(status, ...withHeader(args, this.options.header, this.event.requestId));
    };
  }

  attachHonoHeader(c) {
    if (!this.options.header || typeof c?.header !== 'function') {
      return;
    }
    c.header(this.options.header, this.event.requestId);
  }

  captureSerializedError(response) {
    if (this.event.error || typeof response?.body !== 'string' || response.body.trim() === '') {
      return;
    }
    try {
      const parsed = JSON.parse(response.body);
      const error = parsed?.error;
      if (error && typeof error === 'object') {
        const code = error.code ? String(error.code) : 'ERROR';
        this.event.error = {
          code,
          message: safeErrorMessage(code),
        };
      }
    } catch {
      // Response bodies are not part of trace data; this only observes tests' serialized error envelope.
    }
  }
}

export function responseStatus(response) {
  if (typeof response?.status === 'number') {
    return response.status;
  }
  if (typeof response?.statusCode === 'number') {
    return response.statusCode;
  }
  return null;
}

export function tracePhase(trace, name, fn, details) {
  return trace ? trace.time(name, fn, details) : fn();
}

export function tracePhaseSync(trace, name, fn, details) {
  return trace ? trace.timeSync(name, fn, details) : fn();
}

function withHeader(args, name, value) {
  if (args.length === 0) {
    return [{ [name]: value }];
  }

  if (typeof args[0] === 'string') {
    return [
      args[0],
      {
        ...(args[1] ?? {}),
        [name]: value,
      },
      ...args.slice(2),
    ];
  }

  return [
    {
      ...(args[0] ?? {}),
      [name]: value,
    },
    ...args.slice(1),
  ];
}

function compactEvent(event) {
  const next = {};
  for (const [key, value] of Object.entries(event)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

function writeConsoleTrace(event) {
  const prefix = event.slow ? '[async-db:slow]' : '[async-db]';
  const fields = [
    event.route ? `route=${event.route}` : null,
    event.resource ? `resource=${event.resource}` : null,
    event.operation ? `op=${event.operation}` : null,
    event.hook ? `hook=${event.hook}` : null,
    event.shortCircuit ? 'shortCircuit=true' : null,
    `requestId=${event.requestId}`,
  ].filter(Boolean);

  console.log(`${prefix} ${event.method} ${event.pathname} ${event.status ?? '-'} ${event.durationMs}ms ${fields.join(' ')}`);
}

function safeErrorMessage(code) {
  return code ? `Request failed (${code})` : 'Request failed';
}

function requestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function now() {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function roundMs(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
