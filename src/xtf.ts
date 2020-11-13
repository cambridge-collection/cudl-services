import superagent from 'superagent';
import {URL} from 'url';
import {XTFConfig} from './config';
import {strictDOMParser} from './dom';
import {ValueError} from './errors';

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
    try {
      new URL(options.xtfBase);
    } catch (e) {
      throw new ValueError(`xtfBase is not a valid URL: ${options.xtfBase}`);
    }
    this.xtfBase = options.xtfBase;
    this.xtfIndexPath = options.xtfIndexPath;
  }

  private getUrl(relative: string): URL {
    const resolved = new URL(relative, this.xtfBase);
    // merge in the indexPath query param
    resolved.searchParams.set('indexPath', this.xtfIndexPath);
    return resolved;
  }

  async search(options: XTFSearchOptions): Promise<Document> {
    const searchUrl = this.getUrl('search');
    const searchOptions: XTFSearchOptions = {
      normalizeScores: true,
      ...options,
      // raw has to be true to get XML output
      raw: true,
    };
    Object.entries(searchOptions).forEach(([param, value]) =>
      searchUrl.searchParams.set(param, value)
    );

    const response = await superagent.get(searchUrl.toString());

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
