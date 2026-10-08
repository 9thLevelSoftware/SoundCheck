export const SHUTDOWN_BUDGET_MS = 10_000;
export const HTTP_CLOSE_BUDGET_MS = 2_000;

export interface ShutdownHooks {
  closeServer: () => Promise<void>;
  closeResources: () => Promise<void>;
  exit: (code: number) => void;
  setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  log: (message: string) => void;
}

export interface HttpServerLike {
  close: (callback?: () => void) => void;
  closeAllConnections?: () => void;
}

/**
 * Stop accepting connections, then force-close keep-alive sockets if `close`
 * does not finish within the budget.
 */
export async function closeHttpServer(
  server: HttpServerLike,
  budgetMs: number = HTTP_CLOSE_BUDGET_MS,
  schedule: typeof setTimeout = setTimeout
): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    schedule(finish, budgetMs);
    try {
      server.close(() => finish());
    } catch {
      finish();
    }
  });
  server.closeAllConnections?.();
}

/**
 * Run shutdown steps and force `exit(1)` if they are still running when the
 * budget elapses. The returned promise settles even if a step hangs.
 */
export function shutdownWithBudget(
  signal: string,
  hooks: ShutdownHooks,
  budgetMs: number = SHUTDOWN_BUDGET_MS
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      hooks.exit(code);
      resolve();
    };

    const timer = hooks.setTimer(() => {
      hooks.log(`${signal} shutdown exceeded ${budgetMs}ms; forcing exit`);
      finish(1);
    }, budgetMs);

    void (async () => {
      try {
        await hooks.closeServer();
        if (settled) return;
        await hooks.closeResources();
        if (settled) return;
        hooks.clearTimer(timer);
        finish(0);
      } catch (error) {
        if (settled) return;
        hooks.clearTimer(timer);
        const message = error instanceof Error ? error.message : String(error);
        hooks.log(`${signal} shutdown failed: ${message}`);
        finish(1);
      }
    })();
  });
}
