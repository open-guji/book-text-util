#!/usr/bin/env node
/**
 * book-text-util 命令行。
 *   book-text-util export  --root <版本目录> --chapter 020 --format lines|punct|entity [--links] [--glyph original|traditional|simplified] [--title 书名] [--out 目录]
 *   book-text-util compare --base 底本.txt --ref 对照本.md [--variants glyph-variants.json] [--json]
 */
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildExport, availableFormats, type ExportChapter, type ExportFormat, type ExportGlyph, type GlyphConverters } from './export';
import { createGlyphConverters } from './glyph';
import { dirSource, writeExport } from './node';
import { compareWhole } from './compare/compare';
import { buildVariantTest } from './compare/variants';
import { chapterChars } from './compare/wikitext';

const HELP = `用法：
  book-text-util export  --root <版本目录> --chapter <册号> [--format lines|punct|entity] [--links]
                         [--glyph original|traditional|simplified] [--title 书名] [--id 条目id] [--out 目录]
  book-text-util compare --base <底本.txt> --ref <对照本.md> [--variants <glyph-variants.json>] [--json]

export：读版本目录里的 index.json 与 <册>.char.json 等，生成 guji-markdown；--glyph 非 original 需要安装 opencc-js 与 book-index-ui。
compare：把两份文本去标点后做字级比对，列出每处差异及分类。`;

function die(msg: string): never {
    process.stderr.write(msg + '\n');
    process.exit(2);
}

async function loadConverters(): Promise<GlyphConverters> {
    try {
        const [{ Converter }, variants, sup] = await Promise.all([
            import(/* @vite-ignore */ 'opencc-js/t2cn' as string),
            import(/* @vite-ignore */ 'book-index-ui/variant-chars.json' as string, { with: { type: 'json' } }),
            import(/* @vite-ignore */ 'book-index-ui/variant-supplement' as string),
        ]);
        return createGlyphConverters({ opencc: Converter, variants: { ...sup.VARIANT_SUPPLEMENT, ...variants.default } });
    } catch (e) {
        return die(`字形转换需要先安装 opencc-js 与 book-index-ui（${(e as Error).message}）`);
    }
}

async function cmdExport(argv: string[]) {
    const { values: v } = parseArgs({
        args: argv,
        options: {
            root: { type: 'string' }, chapter: { type: 'string' }, format: { type: 'string', default: 'lines' },
            links: { type: 'boolean', default: false }, glyph: { type: 'string', default: 'original' },
            title: { type: 'string' }, id: { type: 'string', default: 'local' }, key: { type: 'string', default: 'default' },
            out: { type: 'string', default: '.' },
        },
    });
    if (!v.root || !v.chapter) die('需要 --root 和 --chapter\n\n' + HELP);
    const index = JSON.parse(await readFile(join(v.root, 'index.json'), 'utf-8')) as { title?: string; chapters?: ExportChapter[] };
    const chapter = index.chapters?.find((c) => c.file === v.chapter);
    if (!chapter) die(`index.json 里没有册 ${v.chapter}`);
    const format = v.format as ExportFormat;
    if (!availableFormats(chapter).includes(format)) die(`本册不能出「${format}」（缺对应的层），可出：${availableFormats(chapter).join('、') || '无'}`);
    const glyph = v.glyph as ExportGlyph;
    const converters = glyph === 'original' ? undefined : await loadConverters();
    const r = await buildExport(
        { id: v.id!, versionKey: v.key!, chapter, format, links: v.links!, glyph, bookTitle: v.title ?? index.title ?? v.id! },
        dirSource(v.root),
        converters,
    );
    process.stdout.write((await writeExport(v.out!, r)) + '\n');
}

async function cmdCompare(argv: string[]) {
    const { values: v } = parseArgs({
        args: argv,
        options: { base: { type: 'string' }, ref: { type: 'string' }, variants: { type: 'string' }, json: { type: 'boolean', default: false } },
    });
    if (!v.base || !v.ref) die('需要 --base 和 --ref\n\n' + HELP);
    const baseChars = chapterChars(await readFile(v.base, 'utf-8'));
    const cells = baseChars.map((c, i) => ({ c, a: `1:1:${i + 1}` }));
    const table = v.variants ? JSON.parse(await readFile(v.variants, 'utf-8')) : null;
    const res = await compareWhole({
        cells, md: await readFile(v.ref, 'utf-8'), file: v.ref, label: v.base,
        isVariant: table ? buildVariantTest(table) : null,
    });
    if (v.json) return void process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    const seg = res.segments[0];
    process.stdout.write(`底本 ${cells.length} 字，相似度 ${seg.similarity?.toFixed(4) ?? '-'}，差异 ${res.items.length} 处（状态 ${seg.status}）\n`);
    for (const it of res.items) {
        process.stdout.write(`${it.id}\t${it.cat}\t${it.type}\t${it.ctx.base[0]}【${it.base}→${it.reading}】${it.ctx.base[1]}\n`);
    }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'export') await cmdExport(rest);
else if (cmd === 'compare') await cmdCompare(rest);
else process.stdout.write(HELP + '\n');
