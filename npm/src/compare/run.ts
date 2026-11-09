/**
 * 对校的取数：底本的册目录（各册 headings）、对照本的目录与各卷 md，经阅读页的传输层（getTextManifest / getTextIndex / getChapter）取。
 * 不依赖 React，传输层传进来，便于单测。
 */
import { compareChapter, compareWhole, type CompareResult } from './compare';
import type { VariantTest } from './classify';
import { loadVariantTest } from './variants';
import { nextContinues, volumeNo, volumeRangeOf, type BaseCell, type Heading, type WikiChapter } from './volumes';
import type { CompareTarget } from './url';

interface TextTransport {
    getTextManifest?(id: string): Promise<{ versions: { key: string; kind?: string; label?: string; name?: string }[] } | null>;
    getTextIndex?(id: string, key: string): Promise<{ chapters: Record<string, unknown>[] } | null>;
    getChapter?(id: string, key: string, chapter: string, opts?: { json?: boolean }): Promise<{ md: string | null } | null>;
}

const headingsOf = (ch: Record<string, unknown> | undefined): Heading[] =>
    Array.isArray(ch?.headings) ? (ch!.headings as Heading[]).filter((h) => h && typeof h.anchor === 'string' && typeof h.label === 'string' && typeof h.level === 'number') : [];

/**
 * 对照本没指明版本时取哪一份：有 default 取它，否则第一份（与阅读页同规则）；
 * 但整理本（kind=collated）的 md 只有篇目、正文在 json 里，拿来逐字比没有意义，
 * 这时改取第一份不是整理本的版本（如四庫總目维基条目的 wikisource）。都是整理本就仍取 default。
 */
export async function resolveTargetKey(transport: TextTransport, target: CompareTarget): Promise<string | null> {
    if (target.key) return target.key;
    const m = await transport.getTextManifest?.(target.id);
    const vs = m?.versions;
    if (!Array.isArray(vs) || vs.length === 0) return null;
    const main = vs.find((v) => v.key === 'default') ?? vs[0];
    if (main.kind !== 'collated') return main.key;
    return vs.find((v) => v.kind !== 'collated')?.key ?? main.key;
}

export interface RunInput {
    /** 阅读页的传输层（IndexStorage）；只用到 getTextManifest／getTextIndex／getChapter */
    transport: object;
    /** 底本：条目、版本 key、本册文件 stem（chapters[].file，如 "002"） */
    base: { id: string; key: string; chapter: string };
    target: CompareTarget;
    /** 本册字格序列（阅读顺序，每格 {c, a}）：由阅读器（插件接口 api.cells）给 */
    cells: readonly BaseCell[];
    /** 异体字判定；不给则按浏览器环境取 `/compare/glyph-variants.json`（Node 里请自己传，null = 不判异体） */
    isVariant?: VariantTest;
}

export type RunError = 'no-target' | 'no-base-index';

/** 取齐输入并比对一册。对照本或底本目录取不到时抛 Error(RunError)，调用方静默退回普通阅读 */
export async function runCompare(input: RunInput): Promise<CompareResult & { targetKey: string; wikiChapters: WikiChapter[] }> {
    const { base, target, cells } = input;
    const transport = input.transport as TextTransport;
    // 对照本是同一本书的另一个版本（光盘本等）：章文件与底本同名，整章对整章
    if (target.id === base.id && target.key) {
        const [r, isVariant] = await Promise.all([transport.getChapter?.(base.id, target.key, base.chapter), (input.isVariant !== undefined ? Promise.resolve(input.isVariant) : loadVariantTest())]);
        if (!r || r.md === null) throw new Error('no-target' satisfies RunError);
        const res = await compareWhole({ cells, md: r.md, file: base.chapter, label: '本册', isVariant });
        return { ...res, targetKey: target.key, wikiChapters: [] };
    }
    const targetKey = await resolveTargetKey(transport, target);
    if (!targetKey) throw new Error('no-target' satisfies RunError);
    const [baseIndex, targetIndex, isVariant] = await Promise.all([
        transport.getTextIndex?.(base.id, base.key),
        transport.getTextIndex?.(target.id, targetKey),
        input.isVariant !== undefined ? Promise.resolve(input.isVariant) : loadVariantTest(),
    ]);
    if (!baseIndex) throw new Error('no-base-index' satisfies RunError);
    if (!targetIndex) throw new Error('no-target' satisfies RunError);
    const chapters = baseIndex.chapters;
    const at = chapters.findIndex((c) => c.file === base.chapter);
    // 本册首个一级标题之前的字属于上一册末尾所在的卷：往前找最近一个有一级标题的册，取它最后一个一级标题
    let prevVolNo: number | null = null;
    for (let k = at - 1; k >= 0 && prevVolNo === null; k--) {
        const hs = headingsOf(chapters[k]).filter((h) => h.level === 1);
        if (hs.length) prevVolNo = volumeNo(hs[hs.length - 1].label);
    }
    const wikiChapters: WikiChapter[] = targetIndex.chapters
        .filter((c) => typeof c.file === 'string' && typeof c.title === 'string')
        .map((c) => ({ file: c.file as string, title: c.title as string }));
    const mdCache = new Map<string, Promise<string | null>>();
    const getWikiMd = (file: string) => {
        let p = mdCache.get(file);
        if (!p) {
            p = (transport.getChapter?.(target.id, targetKey, file) ?? Promise.resolve(null)).then((r) => r?.md ?? null).catch(() => null);
            mdCache.set(file, p);
        }
        return p;
    };
    const result = await compareChapter({
        cells,
        headings: headingsOf(chapters[at]),
        prevVolNo,
        lastContinues: nextContinues(at >= 0 && at + 1 < chapters.length ? headingsOf(chapters[at + 1]) : undefined),
        wikiChapters,
        getWikiMd,
        isVariant,
        // 册无卷标题（如全唐文自校本一册一章、章名「卷七至卷十」）：按章名取对照本的几卷
        volumeRange: typeof chapters[at]?.title === 'string' ? volumeRangeOf(chapters[at].title as string) : null,
        volumeLabel: typeof chapters[at]?.title === 'string' ? (chapters[at].title as string) : undefined,
    });
    return { ...result, targetKey, wikiChapters };
}
