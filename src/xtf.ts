import xmldom from 'xmldom';
import superagent from 'superagent';
import url from 'url';
import { XTFConfig } from './config';
import { strictDOMParser } from './dom';

interface XTFSearchOptions {
  smode?: string;
  identifier?: string;
  config?: string;
  docsPerPage?: number;
  startDoc?: number; // 1-based
  normalizeScores?: boolean;
  raw?: boolean;
}

export interface XTF {
  search(options: XTFSearchOptions): Promise<Document>;
  getSimilarItems(
    classmark: string,
    similarityId: string,
    count?: number
  ): Promise<Document>;
}

export class DefaultXTF implements XTF {
  private readonly xtfBase: string;
  private readonly xtfIndexPath: string;

  constructor(options: XTFConfig) {
    this.xtfBase = options.xtfBase;
    this.xtfIndexPath = options.xtfIndexPath;
  }

  private getUrl(relative: string): string {
    const resolved = url.resolve(this.xtfBase, relative);

    // merge in the indexPath query param
    const parsed = url.parse(resolved, true);
    parsed.query.indexPath = this.xtfIndexPath;
    delete parsed.search;

    return url.format(parsed);
  }

  async search(options: XTFSearchOptions): Promise<Document> {
    const searchUrl = this.getUrl(
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

    return strictDOMParser().parseFromString(response.text);
  }

  /**
   * Query XTF for items similar to the specified descriptive metadata section of
   * a CUDL item identified by classmark.
   */
  async getSimilarItems(
    classmark: string,
    similarityId: string,
    count?: number
  ): Promise<Document> {
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

    return this.search({
      smode: 'moreLike',
      identifier,
      docsPerPage: count,
    });
  }
}
