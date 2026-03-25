export {};

declare global {
  interface Window {
    ghatDesktop?: {
      isDesktop: boolean;
      platform: string;
      reviewsTerminal?: {
        start: () => Promise<{
          shell: string;
          cwd: string;
          home: string;
        }>;
        write: (data: string) => Promise<void>;
        resize: (cols: number, rows: number) => Promise<void>;
        restart: () => Promise<void>;
        onData: (callback: (data: string) => void) => () => void;
        onExit: (
          callback: (payload: {
            exitCode: number;
            signal: number;
          }) => void,
        ) => () => void;
      };
    };
  }
}
