import {
  cudlComponents,
  CudlOptions,
} from '../../../src/components/cudl/cudl-components';

import {
  collectionMembershipComponents,
  metadataComponents,
  similarityComponents,
  tagsComponents,
  transcriptionComponents,
  translationComponents,
} from '../../../src/components/cudl';
import {mocked} from 'ts-jest/utils';
import {
  MockComponent,
  MockDataStore,
  MockPostgresDatabasePool,
  MockXTF,
} from '../../mocking/local';
import {URL} from 'url';
import {unNest} from '../../../src/util';
import {darwinProxyComponents} from '../../../src/components/darwin-correspondence-project';

jest.mock('../../../src/components/cudl');
jest.mock('../../../src/components/darwin-correspondence-project');
jest.mock('@lib.cam/xslt-nailgun');

describe('cudlComponents', () => {
  let options: CudlOptions;

  beforeEach(() => {
    options = {
      cudlDataDataStore: new MockDataStore(),
      xtf: new MockXTF(),
      darwin: {darwinXtfUrl: new URL('http://darwin.example.com')},
      zacynthiusServiceURL: new URL('http://zacynthius.example.com'),
      dbPool: new MockPostgresDatabasePool(),
    };
  });

  type Fn = (...args: unknown[]) => unknown;

  test.each(
    [
      tagsComponents,
      transcriptionComponents,
      translationComponents,
      metadataComponents,
      collectionMembershipComponents,
      similarityComponents,
      darwinProxyComponents,
    ].map<[string, Fn]>(fn => [fn.name, fn as Fn])
  )('includes %s', async (name, componentFn) => {
    const component = new MockComponent();
    mocked(componentFn).mockReturnValueOnce(component);

    const components = await cudlComponents(options);

    expect(unNest([components])).toContain(component);
  });
});
