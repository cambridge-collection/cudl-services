import { Config, loadConfigFromEnvar } from '../src/config';
import ProcessEnv = NodeJS.ProcessEnv;

const EXAMPLE_CONFIG: Config = {
  darwinXTF: 'example',
  legacyDcpDataDir: 'example',
  users: {},
  dataDir: 'example',
  postPass: 'example',
  postUser: 'example',
  postHost: 'example',
  postDatabase: 'example',
  xtfBase: 'example',
  xtfIndexPath: 'example',
};

describe('config', () => {
  describe('loadConfigFromEnvar()', () => {
    let env: ProcessEnv;
    beforeEach(() => {
      env = process.env;
      process.env = {};
    });
    afterEach(() => {
      process.env = env;
      jest.resetModules();
    });

    test('reports failure due to missing envar', () => {
      expect(process.env).toEqual({});
      expect(loadConfigFromEnvar).toThrow(
        'Configuration not found: envar CUDL_SERVICES_CONFIG must be set to the path of the config module to load'
      );
    });

    test('reports failure due to missing config module', () => {
      global.process.env['CUDL_SERVICES_CONFIG'] = '/some/config.js';
      expect(loadConfigFromEnvar).toThrow(
        "Failed to load config from '/some/config.js': Cannot find module '/some/config.js'"
      );
    });

    test.each([
      [
        {},
        "Failed to load config from '/some/config.js': config is invalid: should have required property 'darwinXTF'",
      ],
      [
        { ...EXAMPLE_CONFIG, users: [] },
        "Failed to load config from '/some/config.js': config is invalid: should be object",
      ],
    ])(
      'reports failure due to invalid config',
      (invalidConfig, message: string) => {
        jest.mock('/some/config.js', () => invalidConfig, { virtual: true });
        global.process.env['CUDL_SERVICES_CONFIG'] = '/some/config.js';

        expect(loadConfigFromEnvar).toThrow(message);
      }
    );

    test('loads config from module identified by envar', () => {
      jest.mock('/some/config.js', () => EXAMPLE_CONFIG, { virtual: true });
      global.process.env['CUDL_SERVICES_CONFIG'] = '/some/config.js';

      expect(loadConfigFromEnvar()).toEqual(EXAMPLE_CONFIG);
    });
  });
});
