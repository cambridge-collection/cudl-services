import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {awsEndpointUrl} from './config';
import cryptoRandomString from 'crypto-random-string';
import assert from 'assert';
import {S3DataStore} from '../src/metadata/s3';
import {MetadataError} from '../src/metadata';
import {ErrorCategories} from '../src/errors';

describe('S3DataStore', () => {
  let client: S3Client;
  let bucketName: string;

  const objects = {
    a: {key: 'root/things/a', data: 'data a\n'},
  };

  beforeAll(async () => {
    client = new S3Client({
      credentials: {
        accessKeyId: 'fake',
        secretAccessKey: 'fake',
      },
      endpoint: awsEndpointUrl,
      // localstack doesn't support domain name bucket addressing by default.
      // Without this, we get DNS errors trying to look up
      // <bucket-name>.localstack or <bucket-name>.localhost
      forcePathStyle: true,
      region: 'us-east-1',
    });
    bucketName = `tmp-bucket-${cryptoRandomString({length: 5})}`;
    await client.send(
      new CreateBucketCommand({
        Bucket: bucketName,
      })
    );

    for (const entry of Object.values(objects)) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: entry.key,
          Body: entry.data,
        })
      );
    }
  });

  afterAll(async () => {
    const keys = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
      })
    );
    assert(keys.NextContinuationToken === undefined);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: keys.Contents?.map(item => ({
            Key: item.Key,
          })),
        },
      })
    );
    await client.send(
      new DeleteBucketCommand({
        Bucket: bucketName,
      })
    );
  });

  describe('read()', () => {
    test('returns data at key', async () => {
      const store = new S3DataStore({
        client,
        bucket: bucketName,
      });
      const buffer = await store.read(objects.a.key);
      expect(buffer.toString()).toBe(objects.a.data);
    });

    test('returns data at key when a keyPrefix is specified', async () => {
      const store = new S3DataStore({
        client,
        bucket: bucketName,
        keyPrefix: 'root/',
      });
      const buffer = await store.read('things/a');
      expect(buffer.toString()).toBe(objects.a.data);
    });

    test('throws MetadataError if no key exists for location', async () => {
      const store = new S3DataStore({
        client,
        bucket: bucketName,
      });
      const response = store.read('missing/key');
      await expect(response).rejects.toThrow(
        new MetadataError(
          `Failed to load data from S3: NoSuchKey: NoSuchKey for bucket: ${bucketName} and key: missing/key`
        )
      );
      await expect(response).rejects.toThrowErrorTaggedWith(
        ErrorCategories.NotFound
      );
    });
  });
});
