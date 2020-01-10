import xmldom from 'xmldom';
import util from 'util';

export enum NodeType {
  ELEMENT_NODE = 1,
  DOCUMENT_NODE = 9,
}

// DOM utility functions
export function childElements(node: Node): Element[] {
  return Array.from(node.childNodes).filter(
    child => child.nodeType === NodeType.ELEMENT_NODE
  ) as Element[];
}

export function expectNodeWithType(
  node: Node | null,
  type: NodeType.ELEMENT_NODE
): asserts node is Element;
export function expectNodeWithType(
  node: Node | null,
  type: NodeType.DOCUMENT_NODE
): asserts node is Document;
export function expectNodeWithType(node: Node | null, type: NodeType): void {
  if (node?.nodeType !== type) {
    throw new Error(
      `Expected a node of type ${type} but got: ${node?.nodeType}`
    );
  }
}

export function expectElementWithTag(
  el: Node,
  ns: string | null,
  tag: string
): asserts el is Element {
  expectNodeWithType(el, NodeType.ELEMENT_NODE);

  if (qualifiedName(el) !== qualifiedName(ns, tag)) {
    throw new Error(
      util.format(
        'Expected tag %s but got: %s',
        qualifiedName(ns, tag),
        qualifiedName(el)
      )
    );
  }
}

/**
 * Get a string representation of an element's tag name as {nsURI}tag.
 *
 * Arguments are (el) | (tagName) | (namespaceURI, tagName).
 */
export function qualifiedName(tagName: string): string;
export function qualifiedName(
  namespaceURI: string | null,
  tagName: string
): string;
export function qualifiedName(el: Element): string;
export function qualifiedName(arg1: unknown, tagName?: string) {
  let ns: string | null = null,
    name: string;
  if (typeof arg1 === 'object' && arg1 !== null) {
    const el = arg1 as Element;
    ns = el.namespaceURI;
    name = el.localName || el.tagName;
  } else {
    if (!tagName) {
      name = arg1 as string;
    } else {
      ns = arg1 as string;
      name = tagName;
    }
  }

  if (!ns) {
    return name;
  }
  return `{${ns}}${name}`;
}

export function strictDOMParser() {
  return new xmldom.DOMParser({
    errorHandler: {
      warning(msg) {
        throw new Error(`DOMParser reported a warning: ${msg}`);
      },
      error(msg) {
        throw new Error(`DOMParser reported an error: ${msg}`);
      },
      fatalError(msg) {
        throw new Error(`DOMParser reported a fatal error: ${msg}`);
      },
    },
  });
}
