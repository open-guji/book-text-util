import { describe, expect, it } from 'vitest';
import { buildVariantTable, buildVariantTest, classify, isRareHan } from '../src/index';

const EDGES = [
    ['辨', '辯', 'variant', '0', 'unihan:kSemanticVariant'],
    ['辨', '辯', 'borrow', '0', 'hydzd-borrowed'],
    ['葢', '蓋', 'variant', '0', 'yitizi'],
    ['令', '命', 'variant', '0', 'charcomp:rt'],
    ['𠉀', '候', 'variant', '0', 'zi:link'],
    ['刺', '剌', 'variant', '0', 'twedu'],
    ['刺', '剌', 'distinct', '0', 'local:human'],
    ['按', '案', 'variant', '0', 'yitizi'],
    ['按', '案', 'borrow', '0', 'hydzd-borrowed'],
].map((r) => r.join('\t')).join('\n');

describe('buildVariantTable', () => {
    const t2s = (s: string) => s.replace(/[範乾幹]/g, (c) => ({ 範: '范', 乾: '干', 幹: '干' })[c]!);
    it('trusted：通假、distinct 不算，宽松来源不算', () => {
        const isV = buildVariantTest(buildVariantTable(EDGES, { mode: 'trusted' }));
        expect(isV('葢', '蓋')).toBe(true);
        expect(isV('辨', '辯')).toBe(false);
        expect(isV('𠉀', '候')).toBe(false);
    });
    it('collate：强证据压过通假、僻字放宽、繁简同形另栏', () => {
        const t = buildVariantTable(EDGES, { mode: 'collate', toSimplified: t2s });
        const isV = buildVariantTest(t);
        expect(isV('辨', '辯')).toBe(true);
        expect(isV('𠉀', '候')).toBe(true);
        expect(isV('令', '命')).toBe(false);
        expect(isV('刺', '剌')).toBe(false);
        expect(isV('按', '案')).toBe(false);
        expect(isV('乾', '幹')).toBe(true);
        expect(buildVariantTest(t, { simp: false })('乾', '幹')).toBe(false);
        expect(isRareHan('𠉀')).toBe(true);
        expect(isRareHan('候')).toBe(false);
    });
});

describe('classify：对照本整理痕迹算 struct', () => {
    const base = [...'一凡例'];
    it('「一」换成序号', () => {
        const wiki = [...'十七凡例'];
        expect(classify({ i1: 0, i2: 1, j1: 0, j2: 2 }, base, wiki, { isVariant: null })).toBe('struct');
    });
    it('「無法顯示」占位', () => {
        const wiki = [...'字位元過密無法顯示'];
        expect(classify({ i1: 0, i2: 3, j1: 0, j2: 9 }, base, wiki, { isVariant: null })).toBe('struct');
    });
});
