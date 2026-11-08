/**
 * 「下载本冊」：取本册的 char／punct／entity（＋fig），在浏览器里生成 guji-markdown，存成 .md。
 * 不预生成、不缓存生成物：读的就是阅读页正在用的同一批文件，下载的和页面上的是同一版本（A33 下载方案，sheldon 11-02 定）。
 *
 * 三种格式：分行本（lines.md 规则）、标点本（rich.md，只留书名号）、专名本（rich.md，带或不带 book-index:// 链接）。
 * 三种字形：原书（不转）、通行繁体（异体字归一）、简体（异体字归一＋opencc t2cn，全站同一口径 lib/to-simplified-core.mjs）。
 * 文件开头写 YAML front matter（guji-format v0.4）：书名、册、格式、字形、各层版本号等。
 */
import { frontMatter, renderLines, renderRich, type CharDoc, type EntityDoc, type FigDoc, type PunctDoc } from './guji-md';

export type ExportFormat = 'lines' | 'punct' | 'entity';
export type ExportGlyph = 'original' | 'traditional' | 'simplified';

export const FORMAT_LABEL: Record<ExportFormat, string> = { lines: '分行本', punct: '標點本', entity: '專名本' };
export const GLYPH_LABEL: Record<ExportGlyph, string> = { original: '原書字形', traditional: '通行繁體', simplified: '簡體' };

/** guji-markdown 规范版本（front matter 从 v0.4 起） */
const GUJI_MARKDOWN = '0.4.0';

/** 章条目里与下载有关的字段（book-text 版本 index.json 的 chapters[]，打包后另有 reader_*_file） */
export interface ExportChapter {
    file?: string;
    title?: string;
    char_file?: string;
    reader_char_file?: string;
    punct_file?: string;
    reader_punct_file?: string;
    entity_file?: string;
    fig_file?: string;
    text_version?: string;
    punct_version?: string;
    entity_version?: string;
}

/** 本章能出哪几种：没有 char 什么都不出；没有标点层不出标点本、专名本；没有专名层不出专名本 */
export function availableFormats(ch: ExportChapter | null | undefined): ExportFormat[] {
    if (!ch || !safeFile(ch.char_file)) return [];
    const out: ExportFormat[] = ['lines'];
    if (safeFile(ch.punct_file)) out.push('punct');
    if (safeFile(ch.punct_file) && safeFile(ch.entity_file)) out.push('entity');
    return out;
}

function safeFile(v: unknown): string | null {
    return typeof v === 'string' && /^[\w.-]+$/.test(v) ? v : null;
}

/**
 * 取数来源：只要能按（条目、版本 key、文件名）取到 JSON。
 * 网站传 IndexStorage（有 getTextFile），脚本传 `dirSource()`（读本地 book-text 检出）或 `httpSource()`。
 * 取不到返回 null，也可以抛错（视作取不到）。
 */
export interface TextSource {
    getTextFile(id: string, key: string, file: string): Promise<unknown>;
}

async function getJson(source: TextSource, id: string, key: string, file: string): Promise<unknown> {
    try {
        return (await source.getTextFile(id, key, file)) ?? null;
    } catch {
        return null;
    }
}

async function getPreferred(source: TextSource, id: string, key: string, slim: unknown, original: unknown): Promise<unknown> {
    const s = safeFile(slim);
    if (s) {
        const v = await getJson(source, id, key, s);
        if (v != null) return v;
    }
    const o = safeFile(original);
    return o ? getJson(source, id, key, o) : null;
}

export interface ExportRequest {
    id: string;
    versionKey: string;
    chapter: ExportChapter;
    format: ExportFormat;
    /** 专名本：带 book-index:// 链接 */
    links: boolean;
    glyph: ExportGlyph;
    /** 元数据 */
    bookTitle: string;
    versionLabel?: string;
    edition?: string;
    license?: string;
    dataVersion?: string;
    pageUrl?: string;
    /** 生成时间（测试里固定；不给取当前时间） */
    now?: Date;
}

export interface ExportResult { filename: string; text: string }

/** 字形转换函数：original 不转；traditional = 异体字归一；simplified = 异体字归一 + opencc t2cn（口径见 glyph.ts） */
export interface GlyphConverters {
    normalizeVariants: (s: string) => string;
    toSimplified: (s: string) => string;
}

function glyphConverter(glyph: ExportGlyph, converters?: GlyphConverters): (s: string) => string {
    if (glyph === 'original') return (s) => s;
    if (!converters) throw new Error(`字形「${GLYPH_LABEL[glyph]}」需要传入 converters（见 createGlyphConverters）`);
    return glyph === 'traditional' ? converters.normalizeVariants : converters.toSimplified;
}

/** 生成本册文件（不触发下载，便于测试） */
export async function buildExport(req: ExportRequest, source: TextSource, converters?: GlyphConverters): Promise<ExportResult> {
    const ch = req.chapter;
    const { id, versionKey: key } = req;
    const needPunct = req.format !== 'lines';
    const [char, punct, entity, fig] = await Promise.all([
        getPreferred(source, id, key, ch.reader_char_file, ch.char_file),
        needPunct ? getPreferred(source, id, key, ch.reader_punct_file, ch.punct_file) : null,
        // 专名层取原文件：瘦身副本有 entity_id 时去掉了 href，而下载要原样写仓里的 book-index:// 链接
        needPunct && safeFile(ch.entity_file) ? getJson(source, id, key, ch.entity_file!) : null,
        safeFile(ch.fig_file) ? getJson(source, id, key, ch.fig_file!) : null,
    ]);
    if (!char) throw new Error('本冊文字取不到');
    if (needPunct && !punct) throw new Error('本冊標點取不到');
    if (req.format === 'entity' && !entity) throw new Error('本冊專名取不到');

    const body = req.format === 'lines'
        ? renderLines(char as CharDoc, fig as FigDoc | null)
        : renderRich(char as CharDoc, punct as PunctDoc, entity as EntityDoc | null, {
            entities: req.format === 'punct' ? 'works' : req.links ? 'linked' : 'plain',
            fig: fig as FigDoc | null,
        });

    const formatLabel = FORMAT_LABEL[req.format] + (req.format === 'entity' ? (req.links ? '（帶鏈接）' : '（不帶鏈接）') : '');
    const head = frontMatter([
        ['title', req.bookTitle],
        ['book_id', id],
        ['chapter', ch.file],
        ['chapter_title', ch.title],
        ['edition', [req.versionLabel, req.edition].filter(Boolean).join(' · ')],
        ['format', formatLabel],
        ['glyph', GLYPH_LABEL[req.glyph]],
        ['guji_markdown', GUJI_MARKDOWN],
        ['text_version', ch.text_version],
        ['punct_version', needPunct ? ch.punct_version : undefined],
        // 标点本的书名号也来自专名层（第 26 册起标点层不带《》）
        ['entity_version', needPunct ? ch.entity_version : undefined],
        ['data_version', req.dataVersion],
        ['generated', (req.now ?? new Date()).toISOString()],
        ['license', req.license],
        ['url', req.pageUrl],
        ['source', 'https://github.com/open-guji/book-text'],
    ]);
    const convert = glyphConverter(req.glyph, converters);
    const text = convert(head + body);
    const vol = ch.file ? `第${ch.file}冊` : '';
    const filename = convert([req.bookTitle, vol, FORMAT_LABEL[req.format]].filter(Boolean).join('-')).replace(/[\\/:*?"<>|\s]+/g, '_') + '.md';
    return { filename, text };
}
