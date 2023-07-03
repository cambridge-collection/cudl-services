export const css = "a:link {\n" +
  "  color: #000;\n" +
  "  text-decoration: none;\n" +
  "}\n" +
  "\n" +
  "a:visited {\n" +
  "  color: #000;\n" +
  "  text-decoration: none;\n" +
  "}\n" +
  "\n" +
  "a:hover {\n" +
  "  color: #467287;\n" +
  "  text-decoration: underline;\n" +
  "}\n" +
  "\n" +
  "a:active {\n" +
  "  color: #467287;\n" +
  "  text-decoration: underline;\n" +
  "}";

export const js = "const paragraphs = document.querySelectorAll(\"p[data-points]\");\n" +
  "\n" +
  "paragraphs.forEach((paragraph) => {\n" +
  "\n" +
  "  let points = paragraph.attributes[\"data-points\"].nodeValue;\n" +
  "  for (let i = 0; i < paragraph.childNodes.length; i++) {\n" +
  "\n" +
  "      let node = paragraph.childNodes[i];\n" +
  "      // This assumes the format is <BR> and then the text for those points\n" +
  "      if (node.nodeName === \"#text\") {\n" +
  "        let temp_link = document.createElement(\"a\");\n" +
  "        temp_link.href = \"#\"\n" +
  "        temp_link.setAttribute(\"onclick\",\n" +
  "          \"window.parent.postMessage({ 'func': 'showPoints', 'message': '\"+points+\"'}, '*'); return false; \");\n" +
  "        temp_link.innerHTML = node.nodeValue;\n" +
  "        node.parentNode.replaceChild(temp_link, node);\n" +
  "\n" +
  "      } else if (node.nodeName === \"BR\" ) {\n" +
  "\n" +
  "        let isdatapointNode = false;\n" +
  "        if (node.hasAttributes()) {\n" +
  "              for (let j = 0; j < node.attributes.length; j++) {\n" +
  "                if (node.attributes[j].name === \"data-points\") {\n" +
  "                isdatapointNode=true;\n" +
  "              }\n" +
  "            }\n" +
  "          }\n" +
  "          if (isdatapointNode) {\n" +
  "            // This BR node has a data-point attribute\n" +
  "            points = node.attributes[\"data-points\"].nodeValue;\n" +
  "          }\n" +
  "      }\n" +
  "  }\n" +
  "});\n";
