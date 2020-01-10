import { mocked } from 'ts-jest/utils';
import { CUDLMetadataRepository, ItemJSON } from '../../src/metadata';
import {
  embedMetadata,
  getReducedMetadata,
  indexDescriptiveMetadata,
  isMetadata,
  isMetadataArray,
  Metadata,
  MetadataEmbedLevel,
  nthStructureNode,
} from '../../src/routes/similarity-impl';

describe('similarity route implementation', () => {
  describe('embedMetadata()', () => {
    let mockMetadataRepository: CUDLMetadataRepository;
    const meta = {
      a: { id: 'a' },
      b: { id: 'b' },
    } as { [key: string]: ItemJSON };

    const getResults = () => ({
      hits: [
        {
          ID: 'a',
          score: 42,
          structureNodeId: '3',
        },
        {
          ID: 'b',
          score: 42,
          structureNodeId: '4',
        },
      ],
    });

    beforeEach(() => {
      mockMetadataRepository = {
        getJSON: jest.fn(async id => meta[id]),
        getBytes: jest.fn(),
        getPath: jest.fn(),
      };
    });

    test('embed level NONE returns hits unchanged', async () => {
      const getResults = () => ({
        hits: [
          {
            ID: 'foo',
            score: 42,
            structureNodeId: '3',
          },
        ],
      });

      const results = getResults();
      const maybeEmbedded = await embedMetadata(
        results,
        MetadataEmbedLevel.NONE,
        mockMetadataRepository
      );
      expect(mockMetadataRepository.getJSON).toBeCalledTimes(0);
      expect(maybeEmbedded).toBe(results);
      expect(maybeEmbedded).toEqual(getResults());
    });

    test('embed level FULL returns hits with complete metadata', async () => {
      expect(
        await embedMetadata(
          getResults(),
          MetadataEmbedLevel.FULL,
          mockMetadataRepository
        )
      ).toEqual({
        hits: [
          {
            ID: 'a',
            score: 42,
            structureNodeId: '3',
            metadata: meta['a'],
          },
          {
            ID: 'b',
            score: 42,
            structureNodeId: '4',
            metadata: meta['b'],
          },
        ],
      });
      expect(mocked(mockMetadataRepository).getJSON).toHaveBeenNthCalledWith(
        1,
        'a'
      );
      expect(mocked(mockMetadataRepository).getJSON).toHaveBeenNthCalledWith(
        2,
        'b'
      );
    });

    test('embed level PARTIAL returns hits with partial metadata', async () => {
      const reduceMetadata: typeof getReducedMetadata = jest.fn(
        (metadata, _) => ({ ...metadata, reduced: true })
      );

      expect(
        await embedMetadata(
          getResults(),
          MetadataEmbedLevel.PARTIAL,
          mockMetadataRepository,
          reduceMetadata
        )
      ).toEqual({
        hits: [
          {
            ID: 'a',
            score: 42,
            structureNodeId: '3',
            metadata: { ...meta['a'], reduced: true },
          },
          {
            ID: 'b',
            score: 42,
            structureNodeId: '4',
            metadata: { ...meta['b'], reduced: true },
          },
        ],
      });

      expect(reduceMetadata).toHaveBeenNthCalledWith(1, meta['a'], '3');
      expect(reduceMetadata).toHaveBeenNthCalledWith(2, meta['b'], '4');
      expect(mockMetadataRepository.getJSON).toHaveBeenCalledTimes(2);
    });
  });

  describe('getReducedMetadata()', () => {
    const meta: Metadata = {
      logicalStructures: [
        {
          id: 'a',
        },
        {
          id: 'b',
          descriptiveMetadataID: 'foo',
          children: [
            {
              id: 'c',
              startPagePosition: 1,
              descriptiveMetadataID: 'bar',
            },
            { id: 'd', children: [{ id: 'e' }] },
          ],
        },
      ],
      pages: [{ label: 'page-a' }, { label: 'page-b' }],
      descriptiveMetadata: [{ ID: 'foo' }, { ID: 'bar' }, { ID: 'baz' }],
    };

    test('getReducedMetadata()', () => {
      expect(getReducedMetadata(meta, '2')).toEqual({
        structurePath: [
          { id: 'b', descriptiveMetadataID: 'foo' },
          { id: 'c', startPagePosition: 1, descriptiveMetadataID: 'bar' },
        ],
        firstPage: { label: 'page-b' },
        descriptiveMetadata: {
          foo: { ID: 'foo' },
          bar: { ID: 'bar' },
        },
      });
    });
  });

  test('indexDescriptiveMetadata()', () => {
    const dmd = [
      { ID: 'a', thing: 1 },
      { ID: 'b', thing: 2 },
    ];

    const index = indexDescriptiveMetadata(dmd);
    expect(index.a).toBe(dmd[0]);
    expect(index.b).toBe(dmd[1]);
  });

  describe('isMetadata()', () => {
    test.each<[unknown, boolean]>([
      [{}, true],
      [{ a: 'abc' }, true],
      [[], false],
      [42, false],
      [undefined, false],
      [null, false],
    ])('isMetadata(%j) === %j', (obj, isMeta) => {
      expect(isMetadata(obj)).toBe(isMeta);
    });
  });

  describe('isMetadataArray()', () => {
    test.each<[unknown, boolean]>([
      [[], true],
      [[{}], true],
      [[{}, { a: 'abc' }], true],
      [{}, false],
      [42, false],
      [undefined, false],
      [null, false],
    ])('isMetadataArray(%j) === %j', (obj, isMeta) => {
      expect(isMetadataArray(obj)).toBe(isMeta);
    });
  });

  describe('nthStructureNode', () => {
    const meta: Metadata = {
      logicalStructures: [
        {
          id: 'a',
        },
        {
          id: 'b',
          children: [
            { id: 'c', children: [] },
            { id: 'd', children: [{ id: 'e' }] },
          ],
        },
        {
          id: 'f',
        },
      ],
    };

    test.each<[number, string]>([
      [-1, 'n was negative: -1'],
      [6, 'structure index out of range. structure count: 6, index: 6'],
    ])('error is raised when n is out of range', (n, msg) => {
      expect(() => nthStructureNode(meta, n)).toThrow(msg);
    });

    test.each<[number, string[]]>([
      [0, ['a']],
      [1, ['b']],
      [2, ['b', 'c']],
      [3, ['b', 'd']],
      [4, ['b', 'd', 'e']],
      [5, ['f']],
    ])('node %d is at path %j', (n, ids) => {
      expect(nthStructureNode(meta, n).map(node => node.id)).toEqual(ids);
    });
  });
});
