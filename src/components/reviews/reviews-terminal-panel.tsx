"use client";

import { useCallback, useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

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
  term.writeln("\u001b[32m>\u001b[0m xterm.js panel is mounted.");
  term.writeln(
    "\u001b[33m>\u001b[0m PTY wiring is the next step once Electron is connected to node-pty.",
  );
  term.writeln(
    "\u001b[36m>\u001b[0m Keep this open while triaging pull request conversations and review context.",
  );
  term.writeln("");
  term.write("$ ");
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
  const inputBufferRef = useRef("");
  const fitAddonRef = useRef<FitAddon | null>(null);

  const writePrompt = useCallback((terminal: Terminal) => {
    terminal.write("\r\n$ ");
  }, []);

  const runCommand = useCallback(
    (terminal: Terminal, rawCommand: string) => {
      const command = rawCommand.trim();

      if (!command) {
        writePrompt(terminal);
        return;
      }

      if (command === "clear") {
        terminal.clear();
        writeBootText(terminal);
        return;
      }

      if (command === "help") {
        terminal.writeln("");
        terminal.writeln("Available for now: help, clear, status, review-context");
        writePrompt(terminal);
        return;
      }

      if (command === "status") {
        terminal.writeln("");
        terminal.writeln("UI terminal is active.");
        terminal.writeln("Electron PTY bridge is not connected yet.");
        writePrompt(terminal);
        return;
      }

      if (command === "review-context") {
        terminal.writeln("");
        terminal.writeln("Use this panel beside the expanded PR details and conversations.");
        terminal.writeln("Next step: wire commands through Electron main with node-pty.");
        writePrompt(terminal);
        return;
      }

      terminal.writeln("");
      terminal.writeln(`Command not connected yet: ${command}`);
      terminal.writeln("Try `help` while the PTY backend is still pending.");
      writePrompt(terminal);
    },
    [writePrompt],
  );

  const resetTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    inputBufferRef.current = "";
    terminal.clear();
    writeBootText(terminal);
    terminal.focus();
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
    inputBufferRef.current = "";
    writeBootText(terminal);
    terminal.focus();

    const dataListener = terminal.onData((input) => {
      if (input === "\r") {
        const command = inputBufferRef.current;
        inputBufferRef.current = "";
        runCommand(terminal, command);
        return;
      }

      if (input === "\u007F") {
        if (inputBufferRef.current.length === 0) return;
        inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        terminal.write("\b \b");
        return;
      }

      if (input === "\u0003") {
        inputBufferRef.current = "";
        terminal.write("^C");
        writePrompt(terminal);
        return;
      }

      if (input === "\u000c") {
        inputBufferRef.current = "";
        terminal.clear();
        writeBootText(terminal);
        terminal.focus();
        return;
      }

      if (input >= " " && input !== "\u007f") {
        inputBufferRef.current += input;
        terminal.write(input);
      }
    });

    const fit = () => {
      if (mountNode.clientWidth === 0 || mountNode.clientHeight === 0) return;
      fitAddon.fit();
    };
    const focusTerminal = () => terminal.focus();
    const initialFitFrames = [30, 120, 260].map((delay) =>
      window.setTimeout(fit, delay),
    );
    const resizeObserver = new ResizeObserver(() => fit());
    window.addEventListener("resize", fit);
    mountNode.addEventListener("click", focusTerminal);
    resizeObserver.observe(mountNode);

    return () => {
      for (const timer of initialFitFrames) {
        window.clearTimeout(timer);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", fit);
      mountNode.removeEventListener("click", focusTerminal);
      dataListener.dispose();
      fitAddonRef.current = null;
      terminalRef.current = null;
      terminal.dispose();
    };
  }, [runCommand, writePrompt]);

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
        Terminal mounted
        <span className="text-border">/</span>
        PTY backend pending
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="reviews-terminal h-full overflow-hidden rounded-lg border border-white/8 bg-[#0b1020] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div ref={mountRef} className="h-full w-full overflow-hidden px-2 py-2" />
        </div>
      </div>
    </section>
  );
}
