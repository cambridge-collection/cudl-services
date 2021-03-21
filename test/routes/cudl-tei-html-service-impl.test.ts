import {
  TeiHtmlServiceContent,
  teiHtmlServicePathGenerator,
} from '../../src/routes/cudl-tei-html-service-impl';
import {product} from '../utils';

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
