/**
 * 对校报告：把若干册的比对结果整理成一份 Markdown，方便人工逐处检查。
 * 纯函数，不读文件；命令行 `book-text-util report` 负责取数。
 */
import type { CompareItem, CompareResult } from './compare';
import type { DiffCat } from './classify';

export interface ReportChapter {
    /** 册文件 stem，如 "001" */
    file: string;
    result: CompareResult;
}

export interface ReportOptions {
    title: string;
    baseLabel: string;
    refLabel: string;
    /** 报告里逐条列出哪些类别；缺省 用字不同、对照本多、对照本少（异体、版式差异只计数） */
    list?: readonly DiffCat[];
}

const CAT_TITLE: Record<DiffCat, string> = {
    word: '用字不同',
    add: '对照本多',
    omit: '对照本少',
    glyph: '异体字',
    struct: '版式差异',
};

/** `页:列:序[子列]` → 「P页C列K字」；认不出原样返回 */
export function anchorText(anchor: string): string {
    const m = /^(\d+):(\d+):(-?\d+)/.exec(anchor);
    return m ? `${m[1]}页${m[2]}列${m[3]}字` : anchor;
}

const esc = (s: string) => s.replace(/\|/g, '\\|');

function row(it: CompareItem): string {
    const b = it.base || '（无）';
    const r = it.reading || '（无）';
    const [b0, b1] = it.ctx.base;
    const [r0, r1] = it.ctx.reading;
    return `| ${anchorText(it.anchor.start)} | ${esc(b0)}**${esc(b)}**${esc(b1)} | ${esc(r0)}**${esc(r)}**${esc(r1)} |`;
}

export function countByCat(items: readonly CompareItem[]): Record<DiffCat, number> {
    const out: Record<DiffCat, number> = { word: 0, add: 0, omit: 0, glyph: 0, struct: 0 };
    for (const it of items) out[it.cat]++;
    return out;
}

export function buildReport(chapters: readonly ReportChapter[], opts: ReportOptions): string {
    const list = opts.list ?? (['word', 'add', 'omit'] as const);
    const L: string[] = [];
    L.push(`# ${opts.title}`, '', `底本：${opts.baseLabel}　对照本：${opts.refLabel}`, '');
    L.push('类别：**用字不同**＝同位置两版字不同（含通假）；**对照本多**＝对照本有、底本没有；**对照本少**＝底本有、对照本没有；异体字（形近异体，如 葢／蓋）与版式差异只计数，不逐条列。', '');
    L.push('## 汇总', '', '| 册 | 底本字数 | 相似度 | 用字不同 | 对照本多 | 对照本少 | 异体字 | 版式 |', '|---|---:|---:|---:|---:|---:|---:|---:|');
    const total: Record<DiffCat, number> = { word: 0, add: 0, omit: 0, glyph: 0, struct: 0 };
    for (const ch of chapters) {
        const c = countByCat(ch.result.items);
        for (const k of Object.keys(total) as DiffCat[]) total[k] += c[k];
        const seg = ch.result.segments[0];
        const status = seg && seg.status !== 'ok' ? `（${seg.status}）` : '';
        const n = seg ? seg.to - seg.from : 0;
        L.push(`| ${ch.file} | ${n} | ${seg?.similarity !== undefined ? (seg.similarity * 100).toFixed(2) + '%' : '-'}${status} | ${c.word} | ${c.add} | ${c.omit} | ${c.glyph} | ${c.struct} |`);
    }
    L.push(`| **合计** | | | ${total.word} | ${total.add} | ${total.omit} | ${total.glyph} | ${total.struct} |`, '');
    for (const ch of chapters) {
        L.push(`## 第 ${ch.file} 册`, '');
        const seg = ch.result.segments[0];
        if (seg && seg.status !== 'ok') {
            L.push(`没有比出结果：${seg.status}。`, '');
            continue;
        }
        for (const cat of list) {
            const its = ch.result.items.filter((i) => i.cat === cat);
            if (!its.length) continue;
            L.push(`### ${CAT_TITLE[cat]}（${its.length}）`, '', `| 位置 | ${esc(opts.baseLabel)} | ${esc(opts.refLabel)} |`, '|---|---|---|');
            for (const it of its) L.push(row(it));
            L.push('');
        }
    }
    return L.join('\n');
}

/** 「001-005」「001,003,010-012」→ ['001','002',…]；保持位数 */
export function parseChapters(spec: string): string[] {
    const out: string[] = [];
    for (const part of spec.split(',').map((x) => x.trim()).filter(Boolean)) {
        const m = /^(\d+)-(\d+)$/.exec(part);
        if (!m) { out.push(part); continue; }
        const w = m[1].length;
        for (let n = +m[1]; n <= +m[2]; n++) out.push(String(n).padStart(w, '0'));
    }
    return out;
}
