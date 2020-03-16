import Debug from 'debug';

export const Debugger = Debug('mongo-controller');

export function debug(...args: any) {
  Debugger.log = console.debug.bind(console);
  Debugger.apply(Debugger, args);
}

export function log(...args: any) {
  Debugger.log = console.log.bind(console);
  Debugger.apply(Debugger, args);
}

export function warn(...args: any) {
  Debugger.log = console.warn.bind(console);
  Debugger.apply(Debugger, args);
}

export function error(...args: any) {
  Debugger.log = console.error.bind(console);
  Debugger.apply(Debugger, args);
}
