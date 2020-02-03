jest.mock('glob', () => {
  return jest.fn(() => {
    throw new Error('No mock implementation specified');
  });
});

import fs from 'fs';
import glob from 'glob';

import { file, FileResult, withFile } from 'tmp-promise';
import { mocked } from 'ts-jest/utils';
import { promisify } from 'util';
import {
  Config,
  CONFIG_FILE_ENVAR,
  CONFIG_JSON_ENVAR,
  configPathsFromEnvar,
  ConfigSource,
  loadConfigFile,
  loadConfigFromEnvar,
  mergeConfigs,
  PartialConfig,
  splitEnvarPaths,
} from '../src/config';
import { InvalidConfigError } from '../src/errors';
import ProcessEnv = NodeJS.ProcessEnv;

const EXAMPLE_CONFIG: Config = {
  darwinXTF: 'example',
  legacyDcpDataDir: 'example',
  users: {},
  dataDir: 'example',
  postPass: 'example',
  postUser: 'example',
  postHost: 'example',
  postPort: 1234,
  postDatabase: 'example',
  xtfBase: 'example',
  xtfIndexPath: 'example',
  zacynthiusServiceURL: 'http://example.com/',
};

describe('config', () => {
  describe('mergeConfigs()', () => {
    test('merges 1 config', () => {
      const config = mergeConfigs([{ source: 'foo', config: EXAMPLE_CONFIG }]);
      expect(config).toEqual(EXAMPLE_CONFIG);
    });

    test('merges multiple configs', () => {
      const configA: PartialConfig = {
        ...EXAMPLE_CONFIG,
      };
      delete configA['darwinXTF'];
      const sources: ConfigSource[] = [
        { source: 'a', config: configA },
        { source: 'b', config: { darwinXTF: 'example' } },
      ];

      expect(mergeConfigs(sources)).toEqual(EXAMPLE_CONFIG);
    });

    test('fails if result is not a complete config', () => {
      const sources: ConfigSource[] = [
        {
          source: 'foo',
          config: {
            darwinXTF: 'xxx',
          },
        },
        {
          source: 'bar',
          config: {
            postDatabase: 'xxx',
          },
        },
      ];
      expect(() => mergeConfigs(sources)).toThrowError(InvalidConfigError);
      expect(() => mergeConfigs(sources)).toThrowError(
        /^Failed to load config: Result of merging foo, bar was not a valid config: .+/
      );
    });
  });

  describe('loadConfigFile()', () => {
    let tmpFile: FileResult;
    beforeEach(async () => {
      tmpFile = await file();
    });

    afterEach(() => tmpFile.cleanup());

    test('fails when filePath cannot be read', async () => {
      await expect(loadConfigFile('/does/not/exist')).rejects.toThrow(
        `Failed to load config from file '/does/not/exist': Error: ENOENT: no such file or directory, open '/does/not/exist'`
      );
    });

    test('fails when file contains invalid JSON5', async () => {
      await promisify(fs.writeFile)(tmpFile.fd, '{');
      await expect(loadConfigFile(tmpFile.path)).rejects.toThrow(
        `Failed to load config from file '${tmpFile.path}': SyntaxError: JSON5: invalid end of input at 1:2`
      );
    });

    test.each<[string, PartialConfig]>([
      [`/* Comment */ {dataDir: 'abcd'}`, { dataDir: 'abcd' }],
      [JSON.stringify(EXAMPLE_CONFIG), EXAMPLE_CONFIG],
    ])('returns partial config', async (content, expected) => {
      await promisify(fs.writeFile)(tmpFile.fd, content);
      expect(await loadConfigFile(tmpFile.path)).toEqual(expected);
    });
  });

  test('splitEnvarPaths()', () => {
    expect(splitEnvarPaths(undefined)).toEqual([]);
    expect(splitEnvarPaths('')).toEqual([]);
    expect(splitEnvarPaths(':')).toEqual([]);
    expect(splitEnvarPaths('::')).toEqual([]);
    expect(splitEnvarPaths('foo:')).toEqual(['foo']);
    expect(splitEnvarPaths('foo::')).toEqual(['foo']);
    expect(splitEnvarPaths(':foo')).toEqual(['foo']);
    expect(splitEnvarPaths('a:bc:d')).toEqual(['a', 'bc', 'd']);
  });

  describe('loadConfigFromEnvar()', () => {
    let env: ProcessEnv;
    beforeEach(() => {
      jest.resetAllMocks();
      env = process.env;
      process.env = {};
    });
    afterEach(() => {
      process.env = env;
      jest.resetModules();
    });

    type SimpleGlobSignature = (
      pattern: string,
      cb: (err: Error | null, matches: string[]) => void
    ) => void;

    describe('configPathsFromEnvar()', () => {
      test.each<[string[], {}, boolean]>([
        [
          [
            '/etc/cudl-services/config.json?(5)',
            '/etc/cudl-services/conf.d/*.json?(5)',
          ],
          {},
          true,
        ],
        [['/foo'], { [CONFIG_FILE_ENVAR]: '/foo' }, false],
        [['/foo', '/bar/*'], { [CONFIG_FILE_ENVAR]: '/foo:/bar/*' }, false],
      ])(
        'Expands glob patterns %s when environment contains %s',
        async (patterns, env, defaultUsed) => {
          Object.assign(process.env, env);
          mocked(glob as SimpleGlobSignature).mockImplementation((_, cb) =>
            cb(null, ['a', 'b'])
          );

          const result = await configPathsFromEnvar();
          expect(mocked(glob).mock.calls.map(args => args[0])).toEqual(
            patterns
          );
          expect(result.defaultPatternUsed).toBe(defaultUsed);
          expect(result.paths).toEqual(
            new Array(patterns.length)
              .fill(['a', 'b'])
              .reduce((a, b) => a.concat(b))
          );
          expect(result.patterns).toEqual(patterns);
        }
      );
    });

    test('reports failure due to unreadable config module', async () => {
      mocked(glob).mockImplementationOnce(jest.requireActual('glob'));

      await withFile(async tmpFile => {
        process.env[CONFIG_FILE_ENVAR] = tmpFile.path;
        await promisify(fs.chmod)(tmpFile.path, 0o000);
        await expect(loadConfigFromEnvar()).rejects.toThrow(
          `Failed to load config from file '${tmpFile.path}': Error: EACCES: permission denied`
        );
      });
    });

    test('loads config from file identified by envar', async () => {
      mocked(glob).mockImplementation(jest.requireActual('glob'));

      await withFile(async configA => {
        await withFile(async configB => {
          await promisify(fs.writeFile)(
            configA.fd,
            JSON.stringify(EXAMPLE_CONFIG)
          );
          const configBContent: PartialConfig = {
            postPort: 42,
            users: { foo: { email: 'foo@example.com' } },
          };
          await promisify(fs.writeFile)(
            configB.fd,
            JSON.stringify(configBContent)
          );

          const configCContent: PartialConfig = {
            users: { foo: { username: 'foo1' } },
            dataDir: '/other',
          };

          process.env[CONFIG_FILE_ENVAR] = `${configA.path}:${configB.path}`;
          process.env[CONFIG_JSON_ENVAR] = JSON.stringify(configCContent);

          await expect(loadConfigFromEnvar()).resolves.toEqual({
            ...EXAMPLE_CONFIG,
            ...{
              postPort: 42,
              dataDir: '/other',
              users: { foo: { email: 'foo@example.com', username: 'foo1' } },
            },
          });
        });
      });
    });

    test('loads config envar JSON without config files', async () => {
      mocked(glob as SimpleGlobSignature).mockImplementation((pattern, cb) =>
        cb(null, [])
      );
      process.env[CONFIG_JSON_ENVAR] = JSON.stringify(EXAMPLE_CONFIG);
      await expect(loadConfigFromEnvar()).resolves.toEqual(EXAMPLE_CONFIG);
    });
  });
});
