import {
  TeiHtmlServiceContent,
  teiHtmlServiceHandler,
  teiHtmlServicePathGenerator,
} from '../../src/routes/cudl-tei-html-service-impl';
import {product} from '../utils';
import express from 'express';
import request from 'supertest';
import {mockGetResponder} from '../mocking/superagent-mocking';
import {StatusCodes} from 'http-status-codes';

describe('teiTranscriptionPathGenerator', () => {
  test.each([
    [
      TeiHtmlServiceContent.TRANSCRIPTION,
      {id: 'MS-ADD-10067', start: 'i11'},
      'html/data/tei/MS-ADD-10067/MS-ADD-10067-i11.html',
    ],
    [
      TeiHtmlServiceContent.TRANSCRIPTION,
      {id: 'MS-ADD-10067', start: 'i11', end: 'i11'},
      'html/data/tei/MS-ADD-10067/MS-ADD-10067-i11.html',
    ],
    [
      TeiHtmlServiceContent.TRANSCRIPTION,
      {id: 'MS-DAR-00115-00078-A', start: 'i1', end: 'i8'},
      'html/data/tei/MS-DAR-00115-00078-A/MS-DAR-00115-00078-A-i1-i8.html',
    ],
    [
      TeiHtmlServiceContent.TRANSLATION,
      {id: 'MS-ADD-10067', start: 'i11'},
      'html/data/tei/MS-ADD-10067/MS-ADD-10067-i11-translation.html',
    ],
    [
      TeiHtmlServiceContent.TRANSLATION,
      {id: 'MS-ADD-10067', start: 'i11', end: 'i11'},
      'html/data/tei/MS-ADD-10067/MS-ADD-10067-i11-translation.html',
    ],
    [
      TeiHtmlServiceContent.TRANSLATION,
      {id: 'MS-DAR-00115-00078-A', start: 'i1', end: 'i8'},
      'html/data/tei/MS-DAR-00115-00078-A/MS-DAR-00115-00078-A-i1-i8-translation.html',
    ],
  ])(
    'for type %j and params %j generates path %j',
    (type, params, expected) => {
      expect(teiHtmlServicePathGenerator(type)({params})).toEqual(expected);
    }
  );

  test.each(
    Array.from(
      product<TeiHtmlServiceContent, Record<string, string>>(
        [
          TeiHtmlServiceContent.TRANSCRIPTION,
          TeiHtmlServiceContent.TRANSLATION,
        ],
        [{id: 'i', end: 'e'}, {id: 'i'}, {start: 's', end: 'e'}, {start: 's'}]
      )
    )
  )(
    'for type %j throws with missing param error when given params: %j',
    (type, params) => {
      expect(() =>
        teiHtmlServicePathGenerator(type)({params})
      ).toThrowErrorMatchingSnapshot();
    }
  );
});

describe('teiHtmlServiceHandler unreleased fallback', () => {
  beforeEach(() => {
    mockGetResponder.mockReset();
  });

  function getApp() {
    const app = express();
    app.use(
      teiHtmlServiceHandler(
        TeiHtmlServiceContent.TRANSCRIPTION,
        new URL('http://example.com/')
      )
    );
    return app;
  }

  function notFoundError() {
    const error: {status?: number} = new Error('Not Found');
    error.status = StatusCodes.NOT_FOUND;
    return error;
  }

  test('serves the response from the normal path when it is found there', async () => {
    mockGetResponder.mockResolvedValueOnce({
      status: 200,
      type: 'text/html',
      text: '<html><body>normal</body></html>',
      body: Buffer.from('<html><body>normal</body></html>', 'utf8'),
      ok: true,
      serverError: false,
    });

    const res = await request(getApp()).get(
      '/tei/diplomatic/internal/MS-FOO/i1'
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain('normal');
    expect(mockGetResponder.mock.calls).toEqual([
      ['http://example.com/html/data/tei/MS-FOO/MS-FOO-i1.html'],
    ]);
  });

  test('falls back to the unreleased path when not found at the normal path', async () => {
    mockGetResponder
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce({
        status: 200,
        type: 'text/html',
        text: '<html><body>unreleased</body></html>',
        body: Buffer.from('<html><body>unreleased</body></html>', 'utf8'),
        ok: true,
        serverError: false,
      });

    const res = await request(getApp()).get(
      '/tei/diplomatic/internal/MS-FOO/i1'
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain('unreleased');
    expect(mockGetResponder.mock.calls).toEqual([
      ['http://example.com/html/data/tei/MS-FOO/MS-FOO-i1.html'],
      ['http://example.com/unreleased/html/data/tei/MS-FOO/MS-FOO-i1.html'],
    ]);
  });

  test('responds 404 when the content is missing from both the normal and unreleased paths', async () => {
    mockGetResponder
      .mockRejectedValueOnce(notFoundError())
      .mockRejectedValueOnce(notFoundError());

    const res = await request(getApp()).get(
      '/tei/diplomatic/internal/MS-FOO/i1'
    );

    expect(res.status).toBe(StatusCodes.NOT_FOUND);
    expect(mockGetResponder.mock.calls).toEqual([
      ['http://example.com/html/data/tei/MS-FOO/MS-FOO-i1.html'],
      ['http://example.com/unreleased/html/data/tei/MS-FOO/MS-FOO-i1.html'],
    ]);
  });
});
