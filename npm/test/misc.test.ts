import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { extractType } from '../src/id';
import { buildExport, entityHref } from '../src';
import { dirSource, writeExport } from '../src/node';
import { httpSource } from '../src/browser';
import { converters } from './helpers';

describe('extractType', () => {
    it('解类型位；非法字符抛错', () => {
        expect(extractType('96mid1ogzk')).toBe('book');
        expect(extractType('d59f1iqd854w')).toBe('work');
        expect(() => extractType('!!')).toThrow();
    });
    it('entityHref 用 id 类型段，没有 id 退回 href', () => {
        expect(entityHref({ type: 'work', target: { entity_id: 'd59f1iqd854w' } })).toBe('book-index://Work/d59f1iqd854w');
        expect(entityHref({ type: 'work', target: { href: 'book-index://Work/x' } })).toBe('book-index://Work/x');
    });
});

describe('glyph converters', () => {
    it('简体等长；异体字归一', () => {
        expect(converters.toSimplified('欽定四庫全書')).toBe('钦定四库全书');
        expect(converters.normalizeVariants('㕘')).toBe('參');
    });
    it('非 original 字形不给 converters 时报错', async () => {
        const src = { getTextFile: async () => ({ pages: [{ page: 1, columns: [{ cells: [{ a: '1:1:1', c: '天' }] }] }] }) };
        await expect(buildExport({ id: 'x', versionKey: 'k', chapter: { file: '001', char_file: 'a.json' }, format: 'lines', links: false, glyph: 'simplified', bookTitle: 'T' }, src)).rejects.toThrow('converters');
    });
});

describe('node 取数与 CLI', () => {
    it('dirSource 读目录；writeExport 写文件', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'btu-'));
        await writeFile(join(dir, 'a.json'), '{"x":1}');
        expect(await dirSource(dir).getTextFile('i', 'k', 'a.json')).toEqual({ x: 1 });
        expect(await dirSource(dir).getTextFile('i', 'k', 'none.json')).toBeNull();
        const p = await writeExport(dir, { filename: 'o.md', text: '好' });
        expect(await readFile(p, 'utf-8')).toBe('好');
    });
    it('httpSource 取不到返回 null', async () => {
        const f = (async (u: string) => ({ ok: u.endsWith('ok.json'), json: async () => ({ y: 2 }) })) as unknown as typeof fetch;
        expect(await httpSource('/data/items/', f).getTextFile('i', 'k', 'ok.json')).toEqual({ y: 2 });
        expect(await httpSource('/data/items', f).getTextFile('i', 'k', 'no.json')).toBeNull();
    });
    it('CLI compare 与 export（需先 npm run build）', async () => {
        const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
        const dir = await mkdtemp(join(tmpdir(), 'btu-cli-'));
        await writeFile(join(dir, 'base.txt'), '天地玄黃，宇宙洪荒。\n');
        await writeFile(join(dir, 'ref.md'), '## 標題\n天地玄黄宇宙洪荒\n');
        const out = execFileSync('node', [cli, 'compare', '--base', join(dir, 'base.txt'), '--ref', join(dir, 'ref.md')], { encoding: 'utf-8' });
        expect(out).toContain('差异');
        await writeFile(join(dir, 'index.json'), JSON.stringify({ title: '測試', chapters: [{ file: '001', char_file: '001.char.json' }] }));
        await writeFile(join(dir, '001.char.json'), JSON.stringify({ pages: [{ page: 1, columns: [{ cells: [{ a: '1:1:1', c: '天' }, { a: '1:1:2', c: '地' }] }] }] }));
        const p = execFileSync('node', [cli, 'export', '--root', dir, '--chapter', '001', '--out', join(dir, 'out')], { encoding: 'utf-8' }).trim();
        expect(await readFile(p, 'utf-8')).toContain('天地');
    }, 30000);
});
