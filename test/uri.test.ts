import {relativeResolve} from '../src/uri';

test.each<[string, string, string]>([
  ['../foo/', 'bar/baz', '../foo/bar/baz'],
  ['foo/', '../../baz', '../baz'],
  ['../../abc/def/', '../../foo', '../../foo'],
  ['../../abc/def/', '../../../foo', '../../../foo'],
  ['../foo/?b=2', 'bar?a=1', '../foo/bar?a=1'],
  ['../foo/', 'bar?a=1', '../foo/bar?a=1'],
  // non-relative inputs are handled as normal
  ['/', '/', '/'],
  ['../foo/', '/bar/baz', '/bar/baz'],
  ['http://example.com/a', '/b', 'http://example.com/b'],
])('relativeResolve(%s, %s) = %s', (base, relative, expected) => {
  expect(relativeResolve(base, relative)).toEqual(expected);
});
