import {mocked} from 'ts-jest/utils';
import {Config, loadConfig} from '../src/config';
import {Application} from '../src/app';
import express from 'express';
import {Server} from '../src/server';
import {AddressInfo} from 'net';
import getPort from 'get-port';
import {using} from '../src/resources';

jest.mock('../src/config', () => {
  return {
    loadConfig: jest.fn(),
  };
});

global.process.getuid = jest.fn(global.process.getuid);

describe('Server', () => {
  let expressApp: express.Application;
  let app: Application;
  let config: Config;

  beforeEach(() => {
    expressApp = express();
    jest.spyOn(expressApp, 'listen');
    app = {
      expressApp,
      close: jest.fn().mockResolvedValue(undefined),
    };
    config = {
      createApplication: jest.fn().mockResolvedValue(app),
    };

    mocked(loadConfig).mockResolvedValue(config);
  });

  describe('start()', () => {
    test('throws if loadConfig() fails', async () => {
      mocked(loadConfig).mockRejectedValueOnce(new Error('Boom!'));
      await expect(Server.start()).rejects.toThrowErrorMatchingSnapshot();
    });

    test('throws if loadConfig().createApplication() fails', async () => {
      mocked(config.createApplication).mockRejectedValueOnce(
        new Error('Boom!')
      );
      await expect(Server.start()).rejects.toThrowErrorMatchingSnapshot();
    });
  });

  describe('running', () => {
    test('runs Application from loadConfig()', async () => {
      expect.assertions(4);
      await using(Server.start(), async server => {
        expect((server.address as AddressInfo).port).toBeTruthy();
        expect(app.expressApp.listen).toHaveBeenCalled();
        expect(app.close).not.toHaveBeenCalled();
      });

      expect(app.close).toHaveBeenCalled();
    });

    test('listens on specified port', async () => {
      const port = await getPort();
      await using(Server.start({port}), async server => {
        expect((server.address as AddressInfo).port).toBe(port);
      });
    });

    test('throws if server fails to bind', async () => {
      const port = await getPort();

      expect.assertions(1);
      await using(Server.start({port}), async () => {
        // Try to listen on the same port again
        await expect(Server.start({port})).rejects.toThrowError(
          `Failed to start server: Error: listen EADDRINUSE: address already in use :::${port}`
        );
      });
    });

    test('shuts down on close()', async () => {
      jest.useFakeTimers();
      const onShutdown = jest.fn();

      const server = await Server.start();
      server.shutdownShutdownComplete.then(onShutdown);

      jest.advanceTimersByTime(1000);
      expect(onShutdown).not.toHaveBeenCalled();

      jest.advanceTimersByTime(10000);
      expect(onShutdown).not.toHaveBeenCalled();

      await server.close();
      expect(onShutdown).toHaveBeenCalled();
      expect(server.isClosed()).toBeTruthy();
    });
  });
});
