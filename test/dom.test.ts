import xmldom from 'xmldom';
import {childElements, qualifiedName} from '../src/dom';

const domImplementation = new xmldom.DOMImplementation();
const doc = domImplementation.createDocument(null, null, null);

test('childElements', () => {
  const doc = new xmldom.DOMParser().parseFromString(
    `<foo a="1">
    abc
    <a/>
    def
    <b/>
</foo>`,
    'text/xml'
  );
  const foo = doc.childNodes[0];
  const els = childElements(foo!);
  expect(els.length).toBe(2);
  expect(els.map(e => qualifiedName(e))).toEqual(['a', 'b']);
});

test('qualifiedName()', () => {
  expect(qualifiedName('abcd')).toBe('abcd');
  expect(qualifiedName('', 'abcd')).toBe('abcd');
  expect(qualifiedName(null, 'abcd')).toBe('abcd');
  expect(qualifiedName('', 'abcd')).toBe('abcd');
  expect(qualifiedName('foo', 'abcd')).toBe('{foo}abcd');
  expect(qualifiedName(doc.createElementNS('foo', 'abcd'))).toBe('{foo}abcd');
});
