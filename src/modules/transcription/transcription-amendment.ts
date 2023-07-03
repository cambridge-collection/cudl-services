export interface TranscriptionAmendment {
  css: string;
  js: string;
  headerHtml: string;
  footerHtml: string;
}

export function appendAdditionalContent(doc:Document, amendment:TranscriptionAmendment) {

  const style = doc.createElement(`style`);
  style.textContent = amendment.css;
  doc.head.appendChild(style);

  const script = doc.createElement(`script`);
  script.textContent = amendment.js;
  doc.body.appendChild(script);

  doc.head.append(amendment.headerHtml);
  doc.body.append(amendment.footerHtml);
}
