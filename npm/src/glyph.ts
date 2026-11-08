/**
 * 字形转换（异体字归一、繁→简）。口径与网站全站一致，核心逻辑在 glyph-core.ts：
 * 转换器（opencc-js t2cn）与异体字表由调用方注入，本包不强依赖它们。
 */
import { createToSimplified, normalizeVariants as normalizeWith } from './glyph-core';
import type { GlyphConverters } from './export';

export { assertSameLength, codePointLength, createToSimplified, normalizeVariants } from './glyph-core';
export type { GlyphConverters } from './export';

/**
 * @param opencc  opencc-js/t2cn 的 `Converter`（`Converter({ from: 't', to: 'cn' })` 的工厂）
 * @param variants 异体字 → 正字表（book-index-ui/variant-chars.json，可再叠 variant-supplement）
 */
export function createGlyphConverters(opts: {
    opencc: (o: { from: 't'; to: 'cn' }) => (text: string) => string;
    variants: Readonly<Record<string, string>>;
    warn?: (msg: string) => void;
}): GlyphConverters {
    return {
        normalizeVariants: (text) => normalizeWith(text, opts.variants),
        toSimplified: createToSimplified({ createConverter: () => opts.opencc({ from: 't', to: 'cn' }), variants: opts.variants, warn: opts.warn }),
    };
}
