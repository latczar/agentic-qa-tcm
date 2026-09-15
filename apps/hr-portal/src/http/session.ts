import 'express-session';

/** One-shot message shown on the next page after a redirect. */
export interface Flash {
  kind: 'success' | 'error';
  message: string;
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    flash?: Flash;
  }
}
