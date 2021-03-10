import Debugger from 'debug';
import util from 'util';
import {Config, loadConfig} from './config';
import {BaseResource, using} from './resources';
import {BaseError} from './errors';
import * as http from 'http';
import {applyDefaults} from './util';
import {AddressInfo} from 'net';

const debug = Debugger('cudl-services');

export class ServerError extends BaseError {}

export class Server extends BaseResource {
  private readonly server: http.Server;
  public readonly shutdownShutdownComplete: Promise<void>;

  private constructor(server: http.Server, shutdownComplete: Promise<void>) {
    super();
    this.server = server;
    this.shutdownShutdownComplete = shutdownComplete;
  }

  get address(): string | AddressInfo {
    const addr = this.server.address();
    if (addr === null) {
      // Should not happen as the server is listening by the time Server is constructed
      throw new Error('server.address() returned null');
    }
    return addr;
  }

  async close(): Promise<void> {
    if (this.isClosed()) {
      return;
    }
    await super.close();
    this.server.close();
    return this.shutdownShutdownComplete;
  }

  static async start(options?: {port?: number}): Promise<Server> {
    const {port} = applyDefaults(options || {}, {port: 0});

    let config: Config;
    try {
      config = await loadConfig();
    } catch (e) {
      throw new ServerError({
        message: `Failed to load configuration: ${e}`,
        nested: e,
      });
    }

    let serverCreated: (server: http.Server | PromiseLike<http.Server>) => void;
    const serverPromise = new Promise<http.Server>(resolve => {
      serverCreated = resolve;
    });

    const onServerShutdownComplete = using(
      config.createApplication(),
      async application => {
        application.expressApp.set('port', port);

        const server = application.expressApp.listen(port);
        server.once('listening', () => {
          const msg = `Express server listening on ${util.inspect(
            server?.address()
          )}`;
          (debug.enabled ? debug : console.log)(msg);
          serverCreated(server);
        });

        await new Promise((resolve, reject) => {
          function shutdown() {
            process.stdout.write(' Shutting down gracefully... ');
            server.close(err => {
              if (err) {
                reject(err);
              } else {
                resolve(undefined);
              }
            });
          }

          process.once('SIGINT', shutdown);
          process.once('SIGTERM', shutdown);
          server.once('error', reject);
          server.once('close', resolve);
        });
        console.log('server stopped.');
      }
    );

    // We must wait for both promises when waiting for the server, otherwise we'd ignore
    // errors from the process of creating the server.
    try {
      await Promise.race([serverPromise, onServerShutdownComplete]);
    } catch (e) {
      throw new ServerError({
        message: `Failed to start server: ${e}`,
        nested: e,
      });
    }
    return new Server(await serverPromise, onServerShutdownComplete);
  }
}
