import { runCompare } from '../src/compare/run';

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
    it('有一卷取不到时记 no-wiki', async () => {
        const t2 = { ...transport, getTextIndex: async (id: string) => (id === 'base' ? { chapters: [{ file: '005', title: '卷七至卷九' }] } : { chapters: [{ file: '007', title: '卷七' }, { file: '008', title: '卷八' }] }) };
        const r = await runCompare({ transport: t2, base: { id: 'base', key: 'default', chapter: '005' }, target: { id: 'kanripo' }, cells: baseCells, isVariant: null });
        expect(r.segments[0].status).toBe('no-wiki');
        expect(r.items).toEqual([]);
    });
});
