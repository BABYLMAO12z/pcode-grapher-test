/* PcodeCore — dựng lại object gộp (bản cũ dùng global scope, module thì không).
 * Giữ đúng tên field như js/core/colors.js + anchors.js cũ. */
import { lex } from './lexer.js';
import { parseFunction, fnNameOf } from './parser.js';
import { CfgBuilder } from './cfg.js';
import { classifyId, varColor, KEYWORDS, TYPE_WORDS } from './colors.js';
import {
  fnv1a, skeletonOf, nodeAnchors, buildAnchors, buildEdgeAnchors,
  jaccard, linesScore, matchBlocks, matchEdges,
} from './anchors.js';

export const PcodeCore = {
  lex, parseFunction, CfgBuilder, classifyId, varColor, KEYWORDS, TYPE_WORDS,
  fnv1a, skeletonOf, nodeAnchors, buildAnchors, buildEdgeAnchors,
  jaccard, linesScore, matchBlocks, matchEdges,
};

export * from './lexer.js';
export * from './parser.js';
export * from './cfg.js';
export * from './colors.js';
export * from './anchors.js';
export default PcodeCore;
