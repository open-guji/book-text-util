/** 浏览器端：把生成好的文件存成下载（Blob + 临时 <a download>）。需要 DOM。 */
import type { ExportResult } from './export';

export function saveText({ filename, text }: ExportResult): void {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 同域/远端 HTTP 取数来源：`<base>/<id>/<key>/<file>`（网站是 `/data/items`）。取不到返回 null */
export function httpSource(base: string, fetchImpl: typeof fetch = fetch) {
    return {
        async getTextFile(id: string, key: string, file: string): Promise<unknown> {
            const res = await fetchImpl(`${base.replace(/\/$/, '')}/${id}/${key}/${file}`);
            return res.ok ? res.json() : null;
        },
    };
}
