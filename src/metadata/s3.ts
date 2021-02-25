import {DataStore, MetadataError} from '../metadata';
import {
  GetObjectCommand,
  GetObjectCommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import {applyLazyDefaults} from '../util';
import streamToPromise from 'stream-to-promise';
import {Readable} from 'stream';

export interface S3DataStoreInput {
  client: S3Client;
  bucket: string;
  keyPrefix?: string;
  join?: (rootPath: string, path: string) => string;
}

export class S3DataStore implements DataStore {
  private readonly options: Required<S3DataStoreInput>;

  constructor(options: S3DataStoreInput) {
    this.options = applyLazyDefaults(options, {
      keyPrefix: () => '',
      join: () => (prefix, key) => `${prefix}${key}`,
    });
  }

  async read(location: string): Promise<Buffer> {
    let response: GetObjectCommandOutput;
    try {
      response = await this.options.client.send(
        new GetObjectCommand({
          Bucket: this.options.bucket,
          Key: this.options.join(this.options.keyPrefix, location),
        })
      );
    } catch (e) {
      throw new MetadataError(`Failed to load data from S3: ${e}`);
    }
    if (!(response.Body instanceof Readable)) {
      throw new Error(
        `Unexpected GetObjectCommandOutput.Body type: ${response.Body}`
      );
    }
    return await streamToPromise(response.Body);
  }
}