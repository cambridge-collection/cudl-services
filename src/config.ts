import Ajv, {ValidateFunction} from 'ajv';
import Debugger from 'debug';
import deepmerge from 'deepmerge';
import fs from 'fs';
import glob from 'glob';
import json5 from 'json5';
import util, { promisify } from 'util';
import { BaseError, InvalidConfigError } from './errors';

import fullConfigSchema from './full-config.schema.json';
import partialConfigSchema from './partial-config.schema.json';
import { NonOptional, requireNotUndefined } from './util';

const debug = Debugger('cudl-services:config');

export const CONFIG_JSON_ENVAR = 'NODE_CONFIG';
export const CONFIG_FILE_ENVAR = 'NODE_CONFIG_FILE';
export const DEFAULT_CONFIG_GLOBS =
  '/etc/cudl-services/config.json?(5):/etc/cudl-services/conf.d/*.json?(5)';

const ajv = new Ajv({ schemas: [fullConfigSchema, partialConfigSchema] });
const fullConfigValidator = requireNotUndefined(ajv.getSchema('full-config.schema.json'));
const partialConfigValidator = requireNotUndefined(ajv.getSchema('partial-config.schema.json'));


const DEFAULT_ZACYNTHIUS_SERVICE_URL =
  'http://codex-zacynthius-transcription.cudl.lib.cam.ac.uk';

export function splitEnvarPaths(paths: string | undefined) {
  return (paths || '').split(':').filter(p => !!p);
}

export async function loadConfigFile(filePath: string): Promise<PartialConfig> {
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
): PartialConfig {
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
  config: PartialConfig;
}

export const DEFAULT_CONFIG: ConfigSource = Object.freeze({
  source: 'default values',
  config: Object.freeze({
    postPort: 5432,
    zacynthiusServiceURL: DEFAULT_ZACYNTHIUS_SERVICE_URL,
  }),
});

export function mergeConfigs(configSources: ConfigSource[]): StrictConfig {
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

export async function loadConfigFromEnvar(): Promise<StrictConfig> {
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
    throw new Error(`No configuration sources found`);
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
): asserts config is PartialConfig {
  validateConfig(partialConfigValidator, config);
}

export function validateObjectIsFullConfig(
  config: unknown
): asserts config is StrictConfig {
  validateConfig(fullConfigValidator, config);
}

export interface Config<U = Users> extends XTFConfig {
  dataDir: string;
  legacyDcpDataDir: string;
  users: U;
  darwinXTF: string;
  postHost: string;
  postPort: number;
  postUser: string;
  postPass: string;
  postDatabase: string;
  zacynthiusServiceURL: string;
}

export type PartialConfig = Partial<Config<Users<Partial<User>>>>;
export type StrictConfig = NonOptional<Config>;

export interface XTFConfig {
  xtfBase: string;
  xtfIndexPath: string;
}

export interface Users<U = User> {
  [apiKey: string]: U;
}

export interface User {
  username: string;
  email: string;
}
