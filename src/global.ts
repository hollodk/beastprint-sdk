import { print } from './index';

declare global {
  interface Window {
    beastprint?: {
      print: typeof print;
    };
  }
}

if (typeof window !== 'undefined') {
  window.beastprint = { print };
}
