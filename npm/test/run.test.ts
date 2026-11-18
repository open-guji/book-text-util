import { juanOf, resolveTargetKey, runCompare } from '../src/compare/run';

describe('runCompare', () => {
    const baseCells = Array.from('卷端天地玄黃').map((c, i) => ({ c, a: `1:1:${i + 1}` }));
    const transport = {
        getTextManifest: async () => ({ versions: [{ key: 'wikisource' }] }),
        getTextIndex: async (id: string) =>
            id === 'base'
                ? { chapters: [
                    { file: '001', headings: [{ level: 1, label: '卷一', anchor: '1:1:1' }] },
                    { file: '002', headings: [{ level: 1, label: '卷二', anchor: '1:1:1' }] },
                ] }
                : { chapters: [{ file: '005', title: '卷001' }, { file: '006', title: '卷002' }] },
        getChapter: async (_id: string, _k: string, f: string) => ({ md: f === '006' ? '## 卷002\n\n天地元黃\n' : null }),
    };
    it('取目录与对照本 md 比对', async () => {
        const r = await runCompare({ transport, base: { id: 'base', key: 'default', chapter: '002' }, target: { id: 'wiki' }, cells: baseCells, isVariant: null });
        expect(r.targetKey).toBe('wikisource');
        expect(r.segments[0]).toMatchObject({ no: 2, status: 'ok', wikiFile: '006' });
        expect(r.items.map((i) => [i.cat, i.base, i.reading])).toEqual([['omit', '卷端', ''], ['word', '玄', '元']]);
    });
    it('对照本目录取不到抛错', async () => {
        await expect(runCompare({ transport: { ...transport, getTextIndex: async (id: string) => (id === 'base' ? { chapters: [] } : null) }, base: { id: 'base', key: 'default', chapter: '002' }, target: { id: 'wiki' }, cells: baseCells, isVariant: null })).rejects.toThrow('no-target');
    });
});

describe('runCompare：册无卷标题，按章名取几卷（全唐文自校本对 Kanripo）', () => {
    const baseCells = Array.from('欽定全唐文卷七太宗天地玄黃卷八宇宙洪荒').map((c, i) => ({ c, a: `1:1:${i + 1}` }));
    const transport = {
        getTextManifest: async () => ({ versions: [{ key: 'default' }] }),
        getTextIndex: async (id: string) =>
            id === 'base'
                ? { chapters: [{ file: '005', title: '卷七至卷八' }] }
                : { chapters: [{ file: '007', title: '卷七' }, { file: '008', title: '卷八' }] },
        getChapter: async (_id: string, _k: string, f: string) => ({
            md: f === '007' ? '## 卷七\n\n欽定全唐文卷七\n\n　太宗<四>\n\n天地:zi[⿰亻尔]黃。\n' : f === '008' ? '## 卷八\n\n卷八宇宙洪荒。\n' : null,
        }),
    };
    it('拼两卷比对；拆字式记 □、小注标记不算字', async () => {
        const r = await runCompare({ transport, base: { id: 'base', key: 'default', chapter: '005' }, target: { id: 'kanripo' }, cells: baseCells, isVariant: null });
        expect(r.segments).toHaveLength(1);
        expect(r.segments[0]).toMatchObject({ no: 7, label: '卷七至卷八', status: 'ok', wikiFile: '007', wikiFiles: ['007', '008'] });
        expect(r.items.map((i) => [i.cat, i.base, i.reading])).toEqual([['add', '', '四'], ['word', '玄', '□']]);
    });
    it('册首一级标题是「欽定全唐文卷七目錄」认不出卷号：仍按章名取几卷', async () => {
        const t3 = { ...transport, getTextIndex: async (id: string) => (id === 'base' ? { chapters: [{ file: '005', title: '卷七至卷八', headings: [{ level: 1, label: '欽定全唐文卷七目錄', anchor: '1:1:1' }, { level: 2, label: '太宗', anchor: '1:1:8' }] }] } : { chapters: [{ file: '007', title: '卷七' }, { file: '008', title: '卷八' }] }) };
        const r = await runCompare({ transport: t3, base: { id: 'base', key: 'default', chapter: '005' }, target: { id: 'kanripo' }, cells: baseCells, isVariant: null });
        expect(r.segments).toHaveLength(1);
        expect(r.segments[0]).toMatchObject({ status: 'ok', wikiFiles: ['007', '008'] });
    });
    it('章条目有 juan 字段：不看章名与册内标题，按 [起,止] 取卷', async () => {
        const t4 = { ...transport, getTextIndex: async (id: string) => (id === 'base' ? { chapters: [{ file: '005', title: '随便什么名', juan: [7, 8], headings: [{ level: 1, label: '卷七', anchor: '1:1:6' }] }] } : { chapters: [{ file: '007', title: '卷七' }, { file: '008', title: '卷八' }] }) };
        const r = await runCompare({ transport: t4, base: { id: 'base', key: 'default', chapter: '005' }, target: { id: 'kanripo' }, cells: baseCells, isVariant: null });
        expect(r.segments).toHaveLength(1);
        expect(r.segments[0]).toMatchObject({ status: 'ok', wikiFiles: ['007', '008'] });
    });
    it('一卷占两册：前册 juan 止卷＝后册起卷，对照本按本册首尾裁，不把另一册的部分算成缺漏', async () => {
        const long = '欽定全唐文卷七太宗天地玄黃宇宙洪荒日月盈昃辰宿列張寒來暑往秋收冬藏閏餘成歲律呂調陽雲騰致雨露結為霜金生麗水玉出崑岡劍號巨闕珠稱夜光果珍李柰菜重芥薑海鹹河淡鱗潛羽翔';
        const cells = Array.from(long.slice(0, 40)).map((c, i) => ({ c, a: `1:1:${i + 1}` }));
        const t5 = {
            getTextManifest: async () => ({ versions: [{ key: 'default' }] }),
            getTextIndex: async (id: string) => (id === 'base' ? { chapters: [{ file: '005', title: 'x', juan: [7, 7] }, { file: '006', title: 'y', juan: [7, 8] }] } : { chapters: [{ file: '007', title: '卷七' }, { file: '008', title: '卷八' }] }),
            getChapter: async (_i: string, _k: string, f: string) => ({ md: f === '007' ? `## 卷七\n\n${long}\n` : '## 卷八\n\n卷八\n' }),
        };
        const r = await runCompare({ transport: t5, base: { id: 'base', key: 'default', chapter: '005' }, target: { id: 'kanripo' }, cells, isVariant: null });
        expect(r.segments[0].status).toBe('ok');
        expect(r.items).toEqual([]);
    });
    it('juan 格式不对当没有', () => {
        expect(juanOf({ juan: [3, 6] })).toEqual([3, 6]);
        expect(juanOf({ juan: [6, 3] })).toBeNull();
        expect(juanOf({ juan: ['3', 6] })).toBeNull();
        expect(juanOf({})).toBeNull();
    });
    it('有一卷取不到时记 no-wiki', async () => {
        const t2 = { ...transport, getTextIndex: async (id: string) => (id === 'base' ? { chapters: [{ file: '005', title: '卷七至卷九' }] } : { chapters: [{ file: '007', title: '卷七' }, { file: '008', title: '卷八' }] }) };
        const r = await runCompare({ transport: t2, base: { id: 'base', key: 'default', chapter: '005' }, target: { id: 'kanripo' }, cells: baseCells, isVariant: null });
        expect(r.segments[0].status).toBe('no-wiki');
        expect(r.items).toEqual([]);
    });
});

describe('resolveTargetKey', () => {
    const t = (versions: { key: string; kind?: string }[]) => ({ getTextManifest: async () => ({ versions }) });
    it('指明了 key 就用它', async () => {
        expect(await resolveTargetKey(t([{ key: 'default' }]), { id: 'w', key: 'kanripo' })).toBe('kanripo');
    });
    it('主版本不是整理本：取 default', async () => {
        expect(await resolveTargetKey(t([{ key: 'default', kind: 'transcription' }, { key: 'kanripo', kind: 'transcription' }]), { id: 'w' })).toBe('default');
    });
    it('主版本是整理本（md 只有篇目）：取第一份不是整理本的', async () => {
        expect(await resolveTargetKey(t([{ key: 'default', kind: 'collated' }, { key: 'wikisource', kind: 'transcription' }]), { id: 'w' })).toBe('wikisource');
    });
    it('都是整理本：仍取 default', async () => {
        expect(await resolveTargetKey(t([{ key: 'default', kind: 'collated' }]), { id: 'w' })).toBe('default');
    });
});
