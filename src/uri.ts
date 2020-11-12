import {parse, resolve} from 'uri-js';
import RelateUrl from 'relateurl';

/**
 * Resolve URI reference against another.
 *
 * Either or both URIs can be relative, including leading dot segments. It
 * behaves in the same way as `uri-js`'s `resolve()` function, except that
 * the result can start with dotted path segments.
 */
export function relativeResolve(base: string, other: string) {
  const baseParts = parse(base);
  const otherParts = parse(other);

  // We only need to perform special handling if both URIs are relative
  // references.
  if (
    baseParts.reference === 'relative' &&
    otherParts.reference === 'relative' &&
    baseParts.path &&
    !baseParts.path.startsWith('/') &&
    otherParts.path &&
    !otherParts.path.startsWith('/')
  ) {
    // The goal is to preserve parent (../) path segments after resolution. To
    // achieve this, we create a new absolute context URI which contains
    // sufficient path segments to resolve both the `base` and `other` paths
    // without referencing above the path root. We then resolve both base and
    // other against this context URI, and finally re-create a relative URI by
    // making the result relative to the original context.
    const contextSize = [baseParts.path, otherParts.path]
      .join('/')
      .split('/')
      .filter(seg => seg === '..').length;
    const resolutionContext = `a:/${'a/'.repeat(contextSize)}`;
    const resolvedBase = resolve(resolutionContext, base);
    const resolvedRelative = resolve(resolvedBase, other);
    return RelateUrl.relate(resolutionContext, resolvedRelative, {
      output: RelateUrl.PATH_RELATIVE,
    });
  }

  return resolve(base, other);
}
