import path from 'path';
import { URL } from 'url';

export const PROJECT_PATH = path.resolve(__dirname, '..');
export const STATIC_FILES = path.resolve(PROJECT_PATH, './public');
export const TEST_PATH = path.resolve(PROJECT_PATH, './test');
export const TEST_DATA_PATH = path.resolve(TEST_PATH, './data');

export const EXAMPLE_STATIC_FILES = {
  TEXTS_STYLESHEET: { path: 'stylesheets/texts.css', type: 'text/css' },
  NEWTON_SANS_FONT: {
    path: 'fonts/NewtonSans.eot',
    type: 'application/vnd.ms-fontobject',
  },
  NEWTON_CSS: { path: 'newton/css/cookiecuttr.css', type: 'text/css' },
  NEWTON_FONT: { path: 'newton/fonts/newton.woff', type: 'font/woff' },
  MATHJAX_JS: { path: 'newton/js/MathJax.js', type: 'application/javascript' },
};

export const EXAMPLE_ZACYNTHIUS_URL = new URL(
  'http://codex-zacynthius-transcription.example.com/some/path/'
);
