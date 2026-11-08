import { createRequire } from 'node:module';
import { Converter } from 'opencc-js/t2cn';
import { createGlyphConverters } from '../src/glyph';

const require = createRequire(import.meta.url);
// 与网站 lib/server/simplify.ts 同口径：variant-chars.json 优先，查不到再用补漏表
const VARIANT_CHARS = require('book-index-ui/variant-chars.json');
const { VARIANT_SUPPLEMENT } = require('book-index-ui/variant-supplement');

export const converters = createGlyphConverters({
    opencc: Converter as unknown as Parameters<typeof createGlyphConverters>[0]['opencc'],
    variants: { ...VARIANT_SUPPLEMENT, ...VARIANT_CHARS },
});
