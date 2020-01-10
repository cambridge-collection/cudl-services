import superagent from 'superagent';
import url from 'url';
import { XTFConfig } from './config';

export function getUrl(config: XTFConfig, relative: string): string {
  const resolved = url.resolve(config.xtfBase, relative);

  // merge in the indexPath query param
  const parsed = url.parse(resolved, true);
  parsed.query.indexPath = config.xtfIndexPath;
  delete parsed.search;

  return url.format(parsed);
}

interface XTFSearchOptions {
  smode?: string;
  identifier?: string;
  config?: string;
  docsPerPage?: number;
  startDoc?: number; // 1-based
  normalizeScores?: boolean;
  raw?: boolean;
}

export async function search(config: XTFConfig, options: XTFSearchOptions) {
  const searchUrl = getUrl(
    config,
    url.format({
      pathname: 'search',
      query: {
        normalizeScores: true,
        ...options,
        // raw has to be true to get XML output
        raw: true,
      },
    })
  );

  const response = await superagent.get(searchUrl);

  if (!response.ok) {
    throw new Error(
      `Non-200 status code received from XTF: ${response.status}`
    );
  }

  if (response.type !== 'text/xml') {
    throw new Error(
      `Unexpected content type received from XTF: ${response.type}`
    );
  }

  return response;
}

/**
 * Query XTF for items similar to the specified descriptive metadata section of
 * a CUDL item identified by classmark.
 */
export async function getSimilarItems(
  config: XTFConfig,
  classmark: string,
  similarityId: string,
  count?: number
) {
  if (typeof count === 'number' && count < 1) {
    throw new Error(`Count was negative: ${count}`);
  }
  count = count || 5;

  // In the XTF index we identify similarity subdocuments with an identifier
  // field containing classmark / similarity ID.
  // The similarity ID as far as services is concerned is an opaque
  // identifier, but clients and the index will need to know how to calculate
  // it to perform a relevant query.
  const identifier = `${classmark}/${similarityId}`;

  return search(config, {
    smode: 'moreLike',
    identifier,
    docsPerPage: count,
  });
}
