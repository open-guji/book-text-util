/** Node 端：从本地目录取数、把结果写成文件。 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExportResult, TextSource } from './export';

/**
 * 本地目录取数来源。`root` 指向某个版本目录（里面直接是 `020.char.json` 之类），
 * 此时 id、key 被忽略；传 `layout: 'item'` 则按 `<root>/<id>/<key>/<file>`（与网站 /data/items 一致）。
 */
export function dirSource(root: string, layout: 'flat' | 'item' = 'flat'): TextSource {
    return {
        async getTextFile(id, key, file) {
            const p = layout === 'flat' ? join(root, file) : join(root, id, key, file);
            try {
                return JSON.parse(await readFile(p, 'utf-8'));
            } catch {
                return null;
            }
        },
    };
}

/** 写到目录，返回完整路径 */
export async function writeExport(dir: string, r: ExportResult): Promise<string> {
    await mkdir(dir, { recursive: true });
    const p = join(dir, r.filename);
    await writeFile(p, r.text, 'utf-8');
    return p;
}
