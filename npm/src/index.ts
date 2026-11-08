/**
 * book-text-util：古籍文本处理（网站与脚本共用）。
 *   - 导出：char/punct/entity 三层 → guji-markdown（分行本、标点本、专名本）
 *   - 对校：底本与对照本的现场字级比对（分类：异体、用字不同、增、脱、结构）
 *   - 字形：异体字归一、繁→简
 * 本入口无 DOM、无 Node 专有依赖；浏览器下载见 `book-text-util/browser`，本地文件见 `book-text-util/node`。
 */
export * from './guji-md';
export * from './export';
export * from './glyph';
export * from './id';
export * from './compare/index';
