// A small synchronous event bus. The controller and render code announce what changed; the UI
// modules that own the DOM for it subscribe. This keeps imports one-directional (ui -> controller -> render -> engine).

export interface UIEvents {
  /** rebuild the inspector panel */
  panel: void;
  /** refresh the FEA status pill */
  status: void;
  /** refresh the assembly timeline (slider, label, chart) */
  timeline: void;
  /** refresh model totals in the top bar */
  stats: void;
  /** refresh the tool name and viewport hints */
  hud: void;
  /** push parameter values back into the panel inputs */
  inputs: void;
  /** mode or tool changed: update tab / rail pressed states */
  chrome: void;
  /** progress bar: label and fraction, or null to hide */
  progress: { label: string; frac: number } | null;
  toast: string;
}

type Handler<T> = [T] extends [void] ? () => void : (arg: T) => void;
const handlers = new Map<keyof UIEvents, ((arg?: unknown) => void)[]>();

export function on<K extends keyof UIEvents>(type: K, fn: Handler<UIEvents[K]>): void {
  let list = handlers.get(type);
  if (!list) handlers.set(type, list = []);
  list.push(fn as (arg?: unknown) => void);
}

export function emit<K extends keyof UIEvents>(type: K, ...arg: [UIEvents[K]] extends [void] ? [] : [UIEvents[K]]): void {
  for (const fn of handlers.get(type) ?? []) fn(arg[0]);
}
