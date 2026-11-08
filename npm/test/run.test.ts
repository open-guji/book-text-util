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
