import Ajv from 'ajv';
import * as util from 'util';

import configSchema from './config.schema.json';

export const CONFIG_ENVAR = 'CUDL_SERVICES_CONFIG';
const configValidator = new Ajv().compile(configSchema);

export function loadConfigFromEnvar(): Config {
  const configModulePath = process.env[CONFIG_ENVAR];
  if (!configModulePath) {
    throw new Error(`\
Configuration not found: envar ${CONFIG_ENVAR} must be set to the path of the \
config module to load`);
  }

  let config;
  try {
    config = require(configModulePath);
    validateObjectIsConfig(config);
  } catch (e) {
    throw new Error(
      `Failed to load config from ${util.inspect(configModulePath)}: ${
        e.message
      }`
    );
  }
  return config;
}

function validateObjectIsConfig(config: any): asserts config is Config {
  const valid = configValidator(config);
  if (!valid) {
    const message =
      configValidator?.errors?.map(err => err.message).join('; ') ||
      '* validation failed without messages *';
    throw new Error(`config is invalid: ${message}`);
  }
}

export interface Config extends XTFConfig {
  dataDir: string;
  legacyDcpDataDir: string;
  users: Users;
  darwinXTF: string;
  postHost: string;
  postPort?: number;
  postUser: string;
  postPass: string;
  postDatabase: string;
  [index: string]: unknown;
}

export interface XTFConfig {
  xtfBase: string;
  xtfIndexPath: string;
}

export interface Users {
  [apiKey: string]: User;
}

export interface User {
  username: string;
  email: string;
}
