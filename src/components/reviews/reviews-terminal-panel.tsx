"use client";

import { useCallback, useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type DesktopReviewsTerminal = NonNullable<
  NonNullable<Window["ghatDesktop"]>["reviewsTerminal"]
>;

const noop = () => undefined;

const TERMINAL_THEME = {
  background: "#0b1020",
  foreground: "#e4ecff",
  cursor: "#82aaff",
  cursorAccent: "#0b1020",
  selectionBackground: "rgba(130, 170, 255, 0.28)",
  black: "#111827",
  red: "#ff7a90",
  green: "#8de89a",
  yellow: "#ffd580",
  blue: "#82aaff",
  magenta: "#c099ff",
  cyan: "#78e4ff",
  white: "#ecf2ff",
  brightBlack: "#4b5563",
  brightRed: "#ff9db0",
  brightGreen: "#b5f3be",
  brightYellow: "#ffe2a8",
  brightBlue: "#a8c1ff",
  brightMagenta: "#d1b8ff",
  brightCyan: "#a5efff",
  brightWhite: "#ffffff",
} as const;

function writeBootText(term: Terminal) {
  term.writeln("\u001b[1;34mGitHub Activity Tracker\u001b[0m reviews terminal");
  term.writeln("");
  term.writeln("\u001b[32m>\u001b[0m Opening local desktop shell...");
  term.writeln("\u001b[36m>\u001b[0m This session runs inside the Electron app.");
  term.writeln("");
}

export function ReviewsTerminalPanel({
  className,
  onCollapse,
}: {
  className?: string;
  onCollapse: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const desktopApiRef = useRef<DesktopReviewsTerminal | null>(null);

  const resetTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.clear();
    terminal.focus();
    const desktopApi = desktopApiRef.current;
    if (desktopApi) {
      void desktopApi.restart();
    }
  }, []);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily:
        '"SFMono-Regular", "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.4,
      letterSpacing: 0.1,
      theme: TERMINAL_THEME,
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(mountNode);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    writeBootText(terminal);
    terminal.focus();

    const fit = () => {
      if (mountNode.clientWidth === 0 || mountNode.clientHeight === 0) return;
      fitAddon.fit();
      const desktopApi = desktopApiRef.current;
      if (desktopApi) {
        void desktopApi.resize(terminal.cols, terminal.rows);
      }
    };
    const focusTerminal = () => terminal.focus();
    const initialFitFrames = [30, 120, 260].map((delay) =>
      window.setTimeout(fit, delay),
    );
    const resizeObserver = new ResizeObserver(() => fit());
    window.addEventListener("resize", fit);
    mountNode.addEventListener("click", focusTerminal);
    resizeObserver.observe(mountNode);

    const desktopApi = window.ghatDesktop?.reviewsTerminal;
    desktopApiRef.current = desktopApi ?? null;

    let removeDataListener: () => void = noop;
    let removeExitListener: () => void = noop;
    let inputListener: { dispose: () => void } = { dispose: noop };

    if (desktopApi) {
      void desktopApi
        .start()
        .then((session) => {
          terminal.writeln(
            `\u001b[33m>\u001b[0m Shell: ${session.shell}  cwd: ${session.cwd}`,
          );
          fit();
        })
        .catch((error: unknown) => {
          terminal.writeln(
            "\u001b[31m>\u001b[0m Failed to start the desktop shell.",
          );
          terminal.writeln(
            `\u001b[33m>\u001b[0m ${error instanceof Error ? error.message : String(error)}`,
          );
          terminal.writeln(
            "\u001b[36m>\u001b[0m Check that your local shell exists and restart the desktop app.",
          );
        });

      removeDataListener = desktopApi.onData((data) => {
        terminal.write(data);
      });

      removeExitListener = desktopApi.onExit(({ exitCode, signal }) => {
        terminal.writeln("");
        terminal.writeln(
          `\u001b[31m>\u001b[0m Shell exited (${exitCode ?? "?"}${
            signal ? `, signal ${signal}` : ""
          }).`,
        );
        terminal.writeln("\u001b[33m>\u001b[0m Press Clear to start a fresh shell.");
      });

      inputListener = terminal.onData((input) => {
        void desktopApi.write(input);
      });
    } else {
      terminal.writeln("\u001b[31m>\u001b[0m Desktop PTY is unavailable in the browser.");
      terminal.writeln(
        "\u001b[33m>\u001b[0m Launch the app with `pnpm desktop:dev` to use the real shell.",
      );
    }

    return () => {
      for (const timer of initialFitFrames) {
        window.clearTimeout(timer);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", fit);
      mountNode.removeEventListener("click", focusTerminal);
      removeDataListener();
      removeExitListener();
      inputListener.dispose();
      desktopApiRef.current = null;
      fitAddonRef.current = null;
      terminalRef.current = null;
      terminal.dispose();
    };
  }, []);

  return (
    <section
      className={cn(
        "flex h-full min-h-0 overflow-hidden flex-col bg-card/70 backdrop-blur-xs",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">Review Terminal</p>
          <p className="truncate text-[11px] text-muted-foreground">
            Local terminal surface for Codex or Claude Code review workflows
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetTerminal}>
          Clear
        </Button>
        <Button variant="outline" size="sm" onClick={onCollapse}>
          Close
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        Desktop shell connected
        <span className="text-border">/</span>
        PTY via Electron
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="reviews-terminal h-full overflow-hidden rounded-lg border border-white/8 bg-[#0b1020] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div ref={mountRef} className="h-full w-full overflow-hidden px-2 py-2" />
        </div>
      </div>
    </section>
  );
}
