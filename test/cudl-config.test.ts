import {Application, Component} from '../src/app';
import fs from 'fs';
import glob from 'glob';

import {file, FileResult, withFile} from 'tmp-promise';
import {mocked} from 'ts-jest/utils';
import {promisify} from 'util';
import cudlConfigDefaultExport, {
  ApplicationWithResources,
  CONFIG_FILE_ENVAR,
  CONFIG_JSON_ENVAR,
  configPathsFromEnvar,
  ConfigSource,
  CUDLConfig,
  CUDLConfigData,
  getCudlDataDataStore,
  loadConfigFile,
  loadConfigFromEnvar,
  mergeConfigs,
  parseConfigURLValue,
  PartialCUDLConfigData,
  splitEnvarPaths,
} from '../src/cudl-config';
import {InvalidConfigError} from '../src/errors';
import {ExternalResources, Resource} from '../src/resources';
import express from 'express';
import {URL} from 'url';
import {FilesystemDataStore} from '../src/metadata/filesystem';
import {S3DataStore} from '../src/metadata/s3';
import {cudlComponents} from '../src/components/cudl/cudl-components';
import {MockComponent} from './mocking/local';
import {leadingComponents} from '../src/components/common';

jest.mock('glob', () => {
  return jest.fn(() => {
    throw new Error('No mock implementation specified');
  });
});
jest.mock('pg');
jest.mock('../src/components/cudl/cudl-components');
jest.mock('../src/components/common');

import ProcessEnv = NodeJS.ProcessEnv;

const EXAMPLE_CONFIG: CUDLConfigData = {
  darwinXTF: 'example',
  dataLocation: 'example',
  postDatabase: 'example',
  postHost: 'example',
  postPass: 'example',
  postPort: 1234,
  postUser: 'example',
  teiServiceURL: 'http://tei.example.com/',
  users: {},
  xtfBase: 'example',
  xtfIndexPath: 'example',
  zacynthiusServiceURL: 'http://zac.example.com/',
};

describe('config', () => {
  describe('mergeConfigs()', () => {
    test('merges 1 config', () => {
      const config = mergeConfigs([{source: 'foo', config: EXAMPLE_CONFIG}]);
      expect(config).toEqual(EXAMPLE_CONFIG);
    });

    test('merges multiple configs', () => {
      const configA: PartialCUDLConfigData = {
        ...EXAMPLE_CONFIG,
      };
      delete configA['darwinXTF'];
      const sources: ConfigSource[] = [
        {source: 'a', config: configA},
        {source: 'b', config: {darwinXTF: 'example'}},
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
        "Failed to load config from file '/does/not/exist': Error: ENOENT: no such file or directory, open '/does/not/exist'"
      );
    });

    test('fails when file contains invalid JSON5', async () => {
      await promisify(fs.writeFile)(tmpFile.fd, '{');
      await expect(loadConfigFile(tmpFile.path)).rejects.toThrow(
        `Failed to load config from file '${tmpFile.path}': SyntaxError: JSON5: invalid end of input at 1:2`
      );
    });

    test.each<[string, PartialCUDLConfigData]>([
      ["/* Comment */ {dataLocation: 'abcd'}", {dataLocation: 'abcd'}],
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
      mocked(glob as SimpleGlobSignature).mockClear();
      env = process.env;
      process.env = {};
    });
    afterEach(() => {
      process.env = env;
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
        [['/foo'], {[CONFIG_FILE_ENVAR]: '/foo'}, false],
        [['/foo', '/bar/*'], {[CONFIG_FILE_ENVAR]: '/foo:/bar/*'}, false],
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
      mocked(glob).mockImplementation(
        jest.requireActual('glob') as typeof glob
      );

      await withFile(async configA => {
        await withFile(async configB => {
          await promisify(fs.writeFile)(
            configA.fd,
            JSON.stringify(EXAMPLE_CONFIG)
          );
          const configBContent: PartialCUDLConfigData = {
            postPort: 42,
            users: {foo: {email: 'foo@example.com'}},
          };
          await promisify(fs.writeFile)(
            configB.fd,
            JSON.stringify(configBContent)
          );

          const configCContent: PartialCUDLConfigData = {
            users: {foo: {username: 'foo1'}},
            dataLocation: '/other',
          };

          process.env[CONFIG_FILE_ENVAR] = `${configA.path}:${configB.path}`;
          process.env[CONFIG_JSON_ENVAR] = JSON.stringify(configCContent);

          await expect(loadConfigFromEnvar()).resolves.toEqual({
            ...EXAMPLE_CONFIG,
            ...{
              postPort: 42,
              dataLocation: '/other',
              users: {foo: {email: 'foo@example.com', username: 'foo1'}},
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

describe('ApplicationWithResources', () => {
  let app: Application;
  let expressApp: express.Express;
  let res1: Resource;
  let res2: Resource;

  beforeEach(() => {
    expressApp = express();
    app = {
      close: jest.fn(),
      expressApp,
    };
    res1 = new ExternalResources(41, []);
    res2 = new ExternalResources(42, []);
    jest.spyOn(res1, 'close');
    jest.spyOn(res2, 'close');
  });

  test("expressApp is wrapped Application's expressApp", () => {
    const awr = ApplicationWithResources.from(app, res1, res2);
    expect(awr.expressApp).toBe(expressApp);
  });

  test('closes Application on close()', async () => {
    const awr = ApplicationWithResources.from(app, res1, res2);
    expect(app.close).not.toHaveBeenCalled();
    expect(res1.close).not.toHaveBeenCalled();
    expect(res2.close).not.toHaveBeenCalled();

    await awr.close();
    expect(app.close).toHaveBeenCalled();
    expect(res1.close).toHaveBeenCalled();
    expect(res2.close).toHaveBeenCalled();
  });
});

describe('parseConfigURLValue', () => {
  test('returns URL instance for valid URL string', () => {
    expect(parseConfigURLValue('http://example.com/', 'example')).toEqual(
      new URL('http://example.com/')
    );
  });

  test('throws error referencing the property name when value is not a valid URL', () => {
    expect(() =>
      parseConfigURLValue('/not/valid', 'invalidProp')
    ).toThrowErrorMatchingSnapshot();
  });
});

describe('getCudlDataDataStore', () => {
  test('returns FilesystemDataStore for non-URL path', () => {
    const dataStore = getCudlDataDataStore({
      dataLocation: '/example dir/path',
    }) as FilesystemDataStore;
    expect(dataStore).toBeInstanceOf(FilesystemDataStore);
    expect(dataStore.rootPath).toEqual('/example dir/path');
  });

  test('returns FilesystemDataStore for file: URL', () => {
    const dataStore = getCudlDataDataStore({
      dataLocation: 'file:///example%20dir/path',
    }) as FilesystemDataStore;
    expect(dataStore).toBeInstanceOf(FilesystemDataStore);
    expect(dataStore.rootPath).toEqual('/example dir/path');
  });

  test('returns S3DataStore for s3: URL', () => {
    const dataStore = getCudlDataDataStore({
      dataLocation: 's3://bucketname/key/prefix/',
    }) as S3DataStore;
    expect(dataStore).toBeInstanceOf(S3DataStore);
    expect(dataStore.options.bucket).toEqual('bucketname');
    expect(dataStore.options.keyPrefix).toEqual('key/prefix/');
  });

  test('throws on unsupported URL', () => {
    expect(() =>
      getCudlDataDataStore({dataLocation: 'foo://abc'})
    ).toThrowErrorMatchingSnapshot();
  });
});

test('module exports an instance of CUDLConfig as the default export', () => {
  expect(cudlConfigDefaultExport).toBeInstanceOf(CUDLConfig);
});

describe('CUDLConfig', () => {
  describe('createApplicationFromConfigData', () => {
    const config: CUDLConfigData = {
      darwinXTF: 'http://darwin.example.com/',
      dataLocation: '/example-data-location',
      postDatabase: 'example-pg-db',
      postHost: 'example-pg-host',
      postPass: 'example-pg-pass',
      postPort: 1234,
      postUser: 'example-pg-user',
      teiServiceURL: 'http://tei.example.com/',
      users: {
        secret: {username: 'example-user', email: 'example@example.com'},
      },
      xtfBase: 'http://xtf.example.com/',
      xtfIndexPath: '/example-xtf-index',
      zacynthiusServiceURL: 'http://zac.example.com/',
    };

    let mockCudlComponents: Component;
    let mockLeadingComponent: Component;

    beforeEach(() => {
      mockCudlComponents = new MockComponent();
      mocked(cudlComponents).mockResolvedValueOnce(mockCudlComponents);
      mockLeadingComponent = new MockComponent();
      mocked(leadingComponents).mockReturnValueOnce([mockLeadingComponent]);
    });

    test('includes cudlComponents in created app', async () => {
      const app = await new CUDLConfig().createApplicationFromConfigData(
        config
      );
      expect(app.components).toContain(mockCudlComponents);
    });

    test('includes common.leadingComponents in created app', async () => {
      const app = await new CUDLConfig().createApplicationFromConfigData(
        config
      );
      expect(app.components).toContain(mockLeadingComponent);
    });
  });
});
