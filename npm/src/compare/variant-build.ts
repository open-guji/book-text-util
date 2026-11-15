/**
 * 从 open-guji-cv 的 config/hanzi/core/edges.tsv 生成对校用的异体字表（glyph-variants.json）。
 * 纯函数，不读文件：调用方把 edges.tsv 的文本和（可选的）繁→简转换函数传进来。命令行见 `book-text-util variants`。
 *
 * 判法分三种 mode：
 * - open／trusted：与网站原先的 scripts/build-glyph-variants.mjs 相同。两字之间有 variant／variant_partial／simp／z 边，
 *   而且来源在 open（Unihan、本项目自有、yi-bai）或 trusted（再加 yitizi、twedu、dypytz、hydzd、cjkvi-simplified）之内；
 *   有 distinct（人审定永不并）或 borrow（通假）边的不算。
 * - collate（默认，2026-11-14 殿本参校查漏用过、用户认可）：在 trusted 之上再加三条，
 *   1. 强证据压过通假：Unihan kSemanticVariant／kZVariant 或教育部异体字字典（twedu）认定是异体的，即使另有 borrow 边也算异体
 *      （辨/辯、奕/弈、筭/算、寖/浸）；distinct 仍然一票否决。
 *   2. 僻字放宽：两字中有一个是扩展区字（CJK 扩展 A 或 BMP 以外），任何来源的 variant 边都算（𠉀/候、𭧂/暴、𨒪/速）。
 *      常用字之间只靠宽松来源（zi:link、charcomp 等）的不算，如 令/命、壁/璧、宇/字 都留作「用字不同」。
 *   3. 繁简同形：给了 toSimplified 时，转简后相同的两个字也算（範/范、乾/幹、閒/閑、捜/蒐），放在表的 `simp` 栏，
 *      用的时候可以选择要不要并进异体（对照本是简繁转换来的，比如维基文库，就该并）。
 */

export type VariantMode = 'open' | 'trusted' | 'collate';

export interface BuiltVariantTable {
    version: string;
    mode: VariantMode;
    sources: string[];
    /** 每行一对，两个码点；判为异体 */
    pairs: string;
    /** 每行一对；仅「转简后相同」（collate 且给了 toSimplified 时才有） */
    simp?: string;
}

const VARIANT_REL = new Set(['variant', 'variant_partial', 'simp', 'z']);
const isOpen = (src: string) => src.startsWith('unihan') || src.startsWith('local:keben') || src.startsWith('yibai');
const TRUSTED_EXTRA = new Set(['yitizi', 'twedu', 'dypytz', 'hydzd', 'cjkvi-simplified']);
const isTrusted = (src: string) => isOpen(src) || TRUSTED_EXTRA.has(src);
/** 压过通假的强证据 */
const isStrong = (rel: string, src: string) => rel === 'z' || src === 'unihan:kSemanticVariant' || src === 'unihan:kZVariant' || src === 'twedu';

/** 扩展区字：CJK 扩展 A（U+3400–4DBF）或 BMP 以外 */
export function isRareHan(ch: string): boolean {
    const cp = ch.codePointAt(0) ?? 0;
    return cp > 0xffff || (cp >= 0x3400 && cp <= 0x4dbf);
}

const key = (a: string, b: string) => (a < b ? a + b : b + a);

export function buildVariantTable(edgesTsv: string, opts: { mode?: VariantMode; toSimplified?: (s: string) => string; version?: string } = {}): BuiltVariantTable {
    const mode = opts.mode ?? 'collate';
    const pickSrc = mode === 'open' ? isOpen : isTrusted;
    const yes = new Set<string>();
    const strong = new Set<string>();
    const loose = new Set<string>();
    const no = new Set<string>(); // distinct：一票否决
    const borrow = new Set<string>();
    const used = new Set<string>();
    const chars = new Set<string>();
    for (const line of edgesTsv.split('\n')) {
        if (!line) continue;
        const [a, b, rel, , src = ''] = line.split('\t');
        if (!a || !b || a === b || [...a].length !== 1 || [...b].length !== 1) continue;
        const k = key(a, b);
        chars.add(a);
        chars.add(b);
        if (rel === 'distinct') no.add(k);
        else if (rel === 'borrow') borrow.add(k);
        else if (VARIANT_REL.has(rel)) {
            if (pickSrc(src)) {
                yes.add(k);
                used.add(src);
            }
            if (isStrong(rel, src)) strong.add(k);
            if (rel !== 'simp') loose.add(k);
        }
    }
    const out = new Set<string>();
    for (const k of yes) if (!no.has(k) && !borrow.has(k)) out.add(k);
    let simp: string[] | undefined;
    if (mode === 'collate') {
        for (const k of strong) if (!no.has(k)) out.add(k);
        for (const k of loose) {
            if (no.has(k)) continue;
            const [a, b] = [...k];
            if (isRareHan(a) || isRareHan(b)) out.add(k);
        }
        if (opts.toSimplified) {
            const groups = new Map<string, string[]>();
            for (let cp = 0x4e00; cp <= 0x9fff; cp++) chars.add(String.fromCodePoint(cp)); // 基本区全过一遍，edges 里没有的字（捜）也照顾到
            for (const c of chars) {
                const s = opts.toSimplified(c);
                if ([...s].length !== 1) continue;
                const g = groups.get(s) ?? [];
                g.push(c);
                groups.set(s, g);
            }
            const sp = new Set<string>();
            for (const [s, g] of groups) {
                const all = g.includes(s) ? g : [...g, s];
                if (all.length < 2 || all.length > 12) continue;
                for (let i = 0; i < all.length; i++)
                    for (let j = i + 1; j < all.length; j++) {
                        const k = key(all[i], all[j]);
                        if (!no.has(k) && !out.has(k)) sp.add(k);
                    }
            }
            simp = [...sp].sort();
        }
    }
    const table: BuiltVariantTable = {
        version: opts.version ?? new Date().toISOString().slice(0, 10),
        mode,
        sources: [...used].sort(),
        pairs: [...out].sort().join('\n'),
    };
    if (simp) table.simp = simp.join('\n');
    return table;
}
