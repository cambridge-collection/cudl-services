import assert from 'assert';
import {expectElementWithTag, NodeType} from '../dom';

export interface SimilaritySearch {
  queryTime?: number;
  totalDocs?: number;
  startDoc?: number;
  endDoc?: number;
  hits: Hit[];
}

export interface Hit {
  score: number | undefined;
  ID: string;
  structureNodeId: string;
}

/**
 * Javascript reimplementation of similarity.xsl.
 */
export function transform(docNode: Document): SimilaritySearch {
  assert.equal(docNode.nodeType, NodeType.DOCUMENT_NODE);

  const root = docNode.getElementsByTagName('crossQueryResult')[0];
  expectElementWithTag(root, null, 'crossQueryResult');

  return {
    queryTime: Number(root.getAttribute('queryTime')) || undefined,
    totalDocs: Number(root.getAttribute('totalDocs')) || undefined,
    startDoc: Number(root.getAttribute('startDoc')) || undefined,
    endDoc: Number(root.getAttribute('endDoc')) || undefined,
    hits: getHits(root),
  };
}

function getHits(root: Element) {
  expectElementWithTag(root, null, 'crossQueryResult');
  return Array.from(root.getElementsByTagName('docHit')).map(getHit);
}

function getHit(docHit: Element): Hit {
  expectElementWithTag(docHit, null, 'docHit');

  const meta = docHit.getElementsByTagName('meta')[0];
  expectElementWithTag(meta, null, 'meta');

  const itemId = meta.getElementsByTagName('itemId')[0];
  expectElementWithTag(itemId, null, 'itemId');
  if (
    typeof itemId.textContent !== 'string' ||
    itemId.textContent.length === 0
  ) {
    throw new Error('hit has no item ID');
  }

  const structureNodeId = meta.getElementsByTagName('structureNodeId')[0];
  expectElementWithTag(structureNodeId, null, 'structureNodeId');
  if (typeof structureNodeId.textContent !== 'string') {
    throw new Error('hit has no structureNodeId');
  }

  return {
    score: Number(docHit.getAttribute('score')) || undefined,
    ID: itemId.textContent,
    structureNodeId: structureNodeId.textContent,
  };
}
