import util from 'util';
import {
  SimilaritySearch,
  transform as similarityTransform,
} from '../transforms/similarity';
import {CUDLMetadataRepository} from '../metadata/cudl';

/**
 * Map the XTF response XML to JSON in node.
 */
export function mapToJson(xtfResultXML: Document) {
  return similarityTransform(xtfResultXML);
}

export enum MetadataEmbedLevel {
  FULL = 'full',
  PARTIAL = 'partial',
  NONE = 'none',
}

/**
 * Get a function to embed metadata in a similarity hit.
 */
export async function embedMetadata(
  results: SimilaritySearch,
  level: MetadataEmbedLevel,
  metadataRepository: CUDLMetadataRepository,
  reduceMetadata?: typeof getReducedMetadata
) {
  const _reduceMetadata = reduceMetadata || getReducedMetadata;

  // Don't embed anything unless requested
  if (level === MetadataEmbedLevel.NONE) {
    return results;
  }

  const embeddedHits = await Promise.all(
    results.hits.map(async hit => {
      const metadata = await metadataRepository.getJSON(hit.ID);
      if (!isMetadata(metadata)) {
        throw new Error('Invalid item JSON: top-level is not an object');
      }

      const meta =
        level === 'full'
          ? {metadata}
          : _reduceMetadata(metadata, hit.structureNodeId);

      return {...hit, ...meta};
    })
  );

  return {
    ...results,
    hits: embeddedHits,
  };
}

export interface Metadata {
  [key: string]: unknown;
}

/**
 * Get a subset of the metadata applicable to the provided logical structure
 * node.
 */
export function getReducedMetadata(
  metadata: Metadata,
  structureNodeId: string
): Metadata {
  const structureIndex = Number(structureNodeId);
  if (isNaN(structureIndex)) {
    throw new Error(util.format('Invalid structureId: %s', structureNodeId));
  }

  let structurePath = nthStructureNode(metadata, structureIndex);
  // Strip children from the structure path nodes
  structurePath = structurePath.map(node => {
    node = {...node};
    delete node.children;
    return node;
  });

  // The first page of the most significant structure
  if (!isMetadataArray(metadata.pages)) {
    throw new Error('Invalid item JSON: pages is not an array of objects');
  }
  const targetStructureNode = structurePath[structurePath.length - 1];
  const targetNodeStartPage = targetStructureNode.startPagePosition;
  if (typeof targetNodeStartPage !== 'number') {
    throw new Error('Invalid item JSON: startPagePosition is not a number');
  }
  const firstPage = metadata.pages[targetNodeStartPage];

  // We should really change descriptiveMetadata to be an object not an
  // array...
  const descriptiveMetadata = metadata.descriptiveMetadata;
  if (!isMetadataArray(descriptiveMetadata)) {
    throw new Error(
      'Invalid item JSON: descriptiveMetadata is not an array of objects'
    );
  }

  const dmdIndex = indexDescriptiveMetadata(descriptiveMetadata);

  // The descriptive metadata related to the structure path nodes
  const relatedMetadata = Object.assign(
    {},
    ...structurePath.map(structure => {
      const dmdId = structure.descriptiveMetadataID;
      if (typeof dmdId !== 'string' || !(dmdId in dmdIndex)) {
        throw new Error(
          `Invalid item JSON: logicalStructure object contains an invalid descriptiveMetadataID: ${dmdId}`
        );
      }
      return {[dmdId]: dmdIndex[dmdId]};
    })
  ) as Metadata;

  return {
    structurePath,
    firstPage,
    descriptiveMetadata: relatedMetadata,
  };
}

export function indexDescriptiveMetadata(dmd: Metadata[]) {
  const index = {} as Metadata;
  for (const m of dmd) {
    if (typeof m.ID !== 'string') {
      throw new Error(
        'Invalid item JSON: descriptiveMetadata object has no ID'
      );
    }
    index[m.ID] = m;
  }
  return index;
}

export function isMetadata(value: unknown): value is Metadata {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isMetadataArray(value: unknown): value is Metadata[] {
  return Array.isArray(value) && value.every(isMetadata);
}

/**
 * Get the nth logical structure node, and its parents (ancestors).
 */
export function nthStructureNode(metadata: Metadata, n: number) {
  if (n < 0) {
    throw new Error(util.format('n was negative: %s', n));
  }

  const logicalStructures = metadata.logicalStructures;
  if (!isMetadataArray(logicalStructures)) {
    throw new Error(
      'Invalid item JSON: logicalStructures is not an array of objects'
    );
  }
  const result = _nthStructureNode(n, logicalStructures as Metadata[], 0, []);

  if (typeof result === 'number') {
    throw new Error(
      util.format(
        'structure index out of range. structure count: %d, index: %d',
        result,
        n
      )
    );
  }

  return result;
}

function _nthStructureNode(
  n: number,
  nodes: Metadata[],
  pos: number,
  context: Metadata[]
): Metadata[] | number {
  for (let i = 0; i < nodes.length; ++i) {
    const node = nodes[i];
    const newContext = context.concat([node]);

    if (pos === n) {
      return newContext;
    }

    pos++;

    if (isMetadataArray(node.children)) {
      const result = _nthStructureNode(n, node.children, pos, newContext);

      // Result is either the identified node (and parents) or the new
      // position to continue the search from
      if (Array.isArray(result)) {
        return result;
      } // node located

      pos = result;
    }
  }

  return pos;
}
