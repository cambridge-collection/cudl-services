import Ajv, {ValidateFunction} from 'ajv';
import Debugger from 'debug';
import deepmerge from 'deepmerge';
import fs from 'fs';
import glob from 'glob';
import json5 from 'json5';
import util, {promisify} from 'util';
import {BaseError, InvalidConfigError, ValueError} from './errors';

import fullConfigSchema from './full-config.schema.json';
import partialConfigSchema from './partial-config.schema.json';
import {NonOptional, requireNotUndefined} from './util';
import {Config} from './config';
import {
  Application,
  ComponentApp,
  ResourceCleanupComponent,
  User,
  Users,
} from './app';
import {closingOnError, ExternalResources, Resource} from './resources';
import {FilesystemDataStore} from './metadata/filesystem';
import {DefaultXTF, XTFConfig} from './xtf';
import {fileURLToPath, pathToFileURL, URL} from 'url';
import {DatabaseConfig, PostgresDatabasePool} from './db';
import {DataStore} from './metadata';
import {S3DataStore} from './metadata/s3';
import {S3Client} from '@aws-sdk/client-s3';
import {cudlComponents} from './components/cudl/cudl-components';
import {leadingComponents} from './components/common';

const debug = Debugger('cudl-services:config');

export const CONFIG_JSON_ENVAR = 'NODE_CONFIG';
export const CONFIG_FILE_ENVAR = 'NODE_CONFIG_FILE';
export const DEFAULT_CONFIG_GLOBS =
  '/etc/cudl-services/config.json?(5):/etc/cudl-services/conf.d/*.json?(5)';

const ajv = new Ajv({schemas: [fullConfigSchema, partialConfigSchema]});
const fullConfigValidator = requireNotUndefined(
  ajv.getSchema('full-config.schema.json')
);
const partialConfigValidator = requireNotUndefined(
  ajv.getSchema('partial-config.schema.json')
);

const DEFAULT_ZACYNTHIUS_SERVICE_URL =
  'http://codex-zacynthius-transcription.cudl.lib.cam.ac.uk';

export function splitEnvarPaths(paths: string | undefined) {
  return (paths || '').split(':').filter(p => !!p);
}

export async function loadConfigFile(
  filePath: string
): Promise<PartialCUDLConfigData> {
  let jsonDocument;
  try {
    jsonDocument = await promisify(fs.readFile)(filePath, 'utf-8');
  } catch (e) {
    throw new BaseError(
      `Failed to load config from file ${util.inspect(filePath)}: ${e}`,
      e
    );
  }

  return parseConfigFromJSON(jsonDocument, `file ${util.inspect(filePath)}`);
}

export function parseConfigFromJSON(
  jsonDocument: string,
  sourceDescription: string
): PartialCUDLConfigData {
  try {
    const config = json5.parse(jsonDocument);
    validateObjectIsPartialConfig(config);
    return config;
  } catch (e) {
    throw new BaseError(
      `Failed to load config from ${sourceDescription}: ${e}`,
      e
    );
  }
}

export interface ConfigSource {
  source: string;
  config: PartialCUDLConfigData;
}

export const DEFAULT_CONFIG: ConfigSource = Object.freeze({
  source: 'default values',
  config: Object.freeze({
    postPort: 5432,
    zacynthiusServiceURL: DEFAULT_ZACYNTHIUS_SERVICE_URL,
  }),
});

export function mergeConfigs(
  configSources: ConfigSource[]
): StrictCUDLConfigData {
  debug('Merging config from sources:', configSources);
  const merged = configSources
    .map(cs => cs.config)
    .reduce((a, b) => deepmerge(a, b));
  try {
    validateObjectIsFullConfig(merged);
    return merged;
  } catch (e) {
    const sourceDesc = configSources.map(cs => cs.source).join(', ');
    throw new InvalidConfigError(
      `Failed to load config: Result of merging ${sourceDesc} was not a valid config: ${e}`,
      e
    );
  }
}

export async function configPathsFromEnvar() {
  const envarGlobs = process.env[CONFIG_FILE_ENVAR];
  const defaultPatternUsed = envarGlobs === undefined;
  const globPatterns = splitEnvarPaths(
    defaultPatternUsed ? DEFAULT_CONFIG_GLOBS : envarGlobs
  );
  const paths = await Promise.all(globPatterns.map(p => promisify(glob)(p)));

  return {
    defaultPatternUsed,
    patterns: globPatterns,
    paths: paths.reduce((a, b) => a.concat(b)),
  };
}

export async function loadConfigFromEnvar(): Promise<StrictCUDLConfigData> {
  const configFilePathInfo = await configPathsFromEnvar();
  debug(
    `${
      configFilePathInfo.defaultPatternUsed
        ? `Envar ${CONFIG_FILE_ENVAR} is not set - using default config file locations:`
        : `Using config file locations from envar ${CONFIG_FILE_ENVAR}:`
    } ${configFilePathInfo.patterns.join(':')}; found ${
      configFilePathInfo.paths.length
    } files`,
    configFilePathInfo.paths
  );

  let configSources = [DEFAULT_CONFIG];
  configSources = configSources.concat(
    await Promise.all(
      configFilePathInfo.paths.map(async file => ({
        source: `file ${util.inspect(file)}`,
        config: await loadConfigFile(file),
      }))
    )
  );

  const configJSONEnvarDocument = process.env[CONFIG_JSON_ENVAR];
  if (configJSONEnvarDocument) {
    const source = `envar ${CONFIG_JSON_ENVAR}`;
    configSources.push({
      source,
      config: parseConfigFromJSON(configJSONEnvarDocument, source),
    });
  }

  if (configSources.filter(s => s !== DEFAULT_CONFIG).length === 0) {
    throw new Error('No configuration sources found');
  }

  return mergeConfigs(configSources);
}

function validateConfig(configValidator: ValidateFunction, config: unknown) {
  const valid = configValidator(config);
  if (!valid) {
    const message =
      configValidator?.errors?.map(err => err.message).join('; ') ||
      '* validation failed without messages *';
    throw new InvalidConfigError(`config is invalid: ${message}`);
  }
}

export function validateObjectIsPartialConfig(
  config: unknown
): asserts config is PartialCUDLConfigData {
  validateConfig(partialConfigValidator, config);
}

export function validateObjectIsFullConfig(
  config: unknown
): asserts config is StrictCUDLConfigData {
  validateConfig(fullConfigValidator, config);
}

export interface CUDLConfigData<U = Users> extends XTFConfig, DatabaseConfig {
  dataLocation: string;
  users: U;
  darwinXTF: string;
  teiServiceURL: string;
  zacynthiusServiceURL: string;
}

export type PartialCUDLConfigData = Partial<
  CUDLConfigData<Users<Partial<User>>>
>;
export type StrictCUDLConfigData = NonOptional<CUDLConfigData>;

export class ApplicationWithResources implements Application {
  private readonly appWithResource: ExternalResources<Application>;

  private constructor(appWithResource: ExternalResources<Application>) {
    this.appWithResource = appWithResource;
  }

  static from(
    application: Application,
    ...res: Resource[]
  ): ApplicationWithResources {
    return new ApplicationWithResources(
      new ExternalResources<Application>(application, res)
    );
  }

  get expressApp() {
    return this.appWithResource.value.expressApp;
  }

  async close() {
    await Promise.all([
      this.appWithResource.value.close(),
      this.appWithResource.close(),
    ]);
  }
}

export function parseConfigURLValue(value: string, propertyName: string): URL {
  try {
    return new URL(value);
  } catch (e) {
    throw new InvalidConfigError({
      message: `${propertyName} is not a valid URL: "${value}". ${e}`,
      nested: e,
    });
  }
}

export function getCudlDataDataStore(
  config: Pick<CUDLConfigData, 'dataLocation'>
): DataStore {
  let locationUrl: URL;
  try {
    locationUrl = new URL(config.dataLocation);
  } catch (e) {
    locationUrl = pathToFileURL(config.dataLocation);
    debug(
      `dataLocation "${config.dataLocation}" is not a valid URL, treating it as a ` +
        `path, resulting in the URL: ${locationUrl}`
    );
  }

  if (locationUrl.protocol === 'file:') {
    return new FilesystemDataStore(fileURLToPath(locationUrl));
  } else if (locationUrl.protocol === 's3:') {
    return new S3DataStore({
      client: new S3Client({}),
      ...parseS3URL(locationUrl),
    });
  }
  throw new InvalidConfigError(
    `dataLocation URL's protocol is not supported: ${config.dataLocation}`
  );
}

function parseS3URL(s3Url: URL): {bucket: string; keyPrefix: string} {
  if (s3Url.protocol !== 's3:') {
    throw new ValueError(`unsupported URL: ${s3Url}`);
  }
  const bucket = decodeURIComponent(s3Url.host);
  const keyPrefix = decodeURIComponent(s3Url.pathname.replace(/^\//, ''));
  return {bucket, keyPrefix};
}

export class CUDLConfig implements Config {
  async createApplication(): Promise<Application> {
    return this.createApplicationFromConfigData(await loadConfigFromEnvar());
  }

  async createApplicationFromConfigData(
    config: CUDLConfigData
  ): Promise<ComponentApp> {
    return await closingOnError(
      PostgresDatabasePool.fromConfig(config),
      async dbPool => {
        const commonLeadingComponents = leadingComponents({
          apiKeys: config.users,
        });

        const components = await cudlComponents({
          cudlDataDataStore: getCudlDataDataStore(config),
          darwin: {
            darwinXtfUrl: parseConfigURLValue(config.darwinXTF, 'darwinXTF'),
          },
          dbPool,
          teiServiceURL: parseConfigURLValue(
            config.teiServiceURL,
            'teiServiceURL'
          ),
          xtf: new DefaultXTF(config),
          zacynthiusServiceURL: parseConfigURLValue(
            config.zacynthiusServiceURL,
            'zacynthiusServiceURL'
          ),
        });

        return ComponentApp.from(
          commonLeadingComponents,
          components,
          ResourceCleanupComponent.closing(dbPool)
        );
      }
    );
  }
}
export default new CUDLConfig();
