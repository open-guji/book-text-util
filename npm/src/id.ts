/**
 * 条目 id 的类型位解码（与 book-index-ui 的 extractType 同口径，抄在这里免得引入整个 React 组件库）。
 * id 是 64 位整数的 base36（小写）或 base58（含大写）文本，第 59–61 位是类型。
 */
export type IndexType = 'book' | 'collection' | 'work' | 'entity';

const TYPE_BY_CODE: Record<number, IndexType> = { 0: 'book', 2: 'collection', 3: 'work', 4: 'entity' };
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decode(s: string, alphabet: string): bigint {
    const base = BigInt(alphabet.length);
    let n = 0n;
    for (const ch of s) {
        const d = alphabet.indexOf(ch);
        if (d < 0) throw new Error(`Invalid character in id: ${ch}`);
        n = n * base + BigInt(d);
    }
    return n;
}

/** 解不出（含非法字符）时抛错；类型位不认识的按 'book'（与组件库一致） */
export function extractType(encoded: string): IndexType {
    const n = /[A-Z]/.test(encoded) ? decode(encoded, B58) : decode(encoded, B36);
    return TYPE_BY_CODE[Number((n >> 59n) & 7n)] ?? 'book';
}
