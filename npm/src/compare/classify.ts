import type { Hunk } from './diff';

/** 差异类别：glyph 异体字（默认不显示）、word 用字不同、add 对照本多出、omit 底本有而对照本没有、struct 题名／卷端署题等版式差异（默认不显示） */
export type DiffCat = 'glyph' | 'word' | 'add' | 'omit' | 'struct';

export const ALL_CATS: readonly DiffCat[] = ['word', 'add', 'omit', 'glyph', 'struct'];

/** 判定两个字是不是异体字关系：由 glyph-variants.json 加载后给出（见 variants.ts）；null＝表还没载入，按「不是」算 */
export type VariantTest = ((a: string, b: string) => boolean) | null;

/**
 * 给一处差异定类别。
 * - 纯增：add；纯删：落在「卷端署题区」（structEnd 之前）算 struct，否则 omit；
 * - 等长替换且逐字都是异体：glyph；
 * - 对照本的整理痕迹算 struct：底本条目起首的「一」被对照本换成序号（一→十七，维基文库凡例常见），
 *   （前一字是 卷／第／年 等的不算，那是真的数字不同），或对照本以「無法顯示」之类占位代替原文；
 * - 其余（含通假，按/案）word。
 */
const NUMERAL = /^[一二三四五六七八九十百]+$/;
const PLACEHOLDER = /無法顯示|无法显示/;
const NUM_CTX = new Set([...'卷第年月日歲岁之十百千萬万二三四五六七八九']);

export function classify(h: Hunk, base: readonly string[], wiki: readonly string[], opts: { isVariant: VariantTest; structEnd?: number }): DiffCat {
    if (h.i1 === h.i2) return 'add';
    if (h.j1 === h.j2) return opts.structEnd !== undefined && h.i2 <= opts.structEnd ? 'struct' : 'omit';
    const b = base.slice(h.i1, h.i2).join('');
    const r = wiki.slice(h.j1, h.j2).join('');
    if ((b === '一' && r !== b && NUMERAL.test(r) && !NUM_CTX.has(base[h.i1 - 1] ?? '')) || PLACEHOLDER.test(r)) return 'struct';
    const len = h.i2 - h.i1;
    if (len === h.j2 - h.j1 && opts.isVariant) {
        let all = true;
        for (let k = 0; k < len; k++) {
            const x = base[h.i1 + k];
            const y = wiki[h.j1 + k];
            if (x !== y && !opts.isVariant(x, y)) {
                all = false;
                break;
            }
        }
        if (all) return 'glyph';
    }
    return 'word';
}
