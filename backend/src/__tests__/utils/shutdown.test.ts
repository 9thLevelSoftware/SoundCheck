import { describe, expect, it, jest } from '@jest/globals';
import { closeHttpServer, shutdownWithBudget } from '../../utils/shutdown';

describe('shutdownWithBudget', () => {
  it('exits 0 after the server and resources close', async () => {
    const closeServer = jest.fn(async () => undefined);
    const closeResources = jest.fn(async () => undefined);
    const exit = jest.fn();
    const clearTimer = jest.fn();

    await shutdownWithBudget('SIGTERM', {
      closeServer,
      closeResources,
      exit,
      setTimer: () => ({}) as NodeJS.Timeout,
      clearTimer,
      log: jest.fn(),
    });

    expect(closeServer).toHaveBeenCalledTimes(1);
    expect(closeResources).toHaveBeenCalledTimes(1);
    expect(clearTimer).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('force-exits when close hangs past the budget', async () => {
    let fire: (() => void) | undefined;
    const closeResources = jest.fn(async () => undefined);
    const exit = jest.fn();

    const pending = shutdownWithBudget(
      'SIGINT',
      {
        closeServer: () => new Promise(() => undefined),
        closeResources,
        exit,
        setTimer: (fn: () => void) => {
          fire = fn;
          return {} as NodeJS.Timeout;
        },
        clearTimer: jest.fn(),
        log: jest.fn(),
      },
      10_000
    );

    await Promise.resolve();
    expect(exit).not.toHaveBeenCalled();
    fire?.();
    await pending;

    expect(exit).toHaveBeenCalledWith(1);
    expect(closeResources).not.toHaveBeenCalled();
  });
});

describe('closeHttpServer', () => {
  it('closes keep-alive sockets after the close budget', async () => {
    const closeAllConnections = jest.fn();
    const server = {
      close: (_cb?: () => void) => undefined,
      closeAllConnections,
    };

    await closeHttpServer(server, 5, ((fn: () => void) => {
      fn();
      return {} as NodeJS.Timeout;
    }) as typeof setTimeout);

    expect(closeAllConnections).toHaveBeenCalledTimes(1);
  });
});
