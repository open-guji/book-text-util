# book-text-util

古籍文本处理：**下载导出（guji-markdown）**、**版本对校**、**字形转换**。纯 TypeScript，ESM + CJS 双发，网站与 Node 脚本通用。需要 Node ≥ 18。

```bash
npm i book-text-util
```

## 模块与入口

| 入口 | 内容 | 环境 |
|---|---|---|
| `book-text-util` | 导出、对校、字形、id 解码 | 任意（无 DOM、无 Node 专有 API） |
| `book-text-util/browser` | `saveText`（Blob 下载）、`httpSource`（fetch 取数） | 浏览器 |
| `book-text-util/node` | `dirSource`（读本地目录）、`writeExport`（写文件） | Node |
| `book-text-util`（bin） | 命令行 `book-text-util export / compare` | Node |

## 一、导出 guji-markdown

规则照 guji-format spec/03，测试与 book-text 的 Python 生成器（`original_char.py`）逐字节比对（`tools/export-golden.py` 出标准答案）。

```ts
import { buildExport, availableFormats, createGlyphConverters } from 'book-text-util';
import { saveText } from 'book-text-util/browser';

// source：能按 (条目 id, 版本 key, 文件名) 取到 JSON 的对象；网站的 IndexStorage 本身就满足
const result = await buildExport({
  id, versionKey: 'default', chapter,           // chapter 是 index.json 的 chapters[] 一项
  format: 'entity', links: true, glyph: 'simplified',   // lines | punct | entity；original | traditional | simplified
  bookTitle: '欽定四庫全書總目',
}, source, converters);                          // converters 仅 glyph≠original 需要
saveText(result);                                // { filename, text }
```

- `availableFormats(chapter)`：本册能出哪几种。
- `converters = createGlyphConverters({ opencc: Converter /* opencc-js/t2cn */, variants /* 异体字→正字表 */ })`。opencc-js、异体字表（`book-index-ui/variant-chars.json`）由调用方提供，本包不强依赖。
- 低层：`renderLines` / `renderRich` / `frontMatter`（纯函数，不取数）。

Node 脚本：

```ts
import { buildExport } from 'book-text-util';
import { dirSource, writeExport } from 'book-text-util/node';
const r = await buildExport(req, dirSource('/path/to/book-text/.../version-dir'));
await writeExport('out', r);
```

## 二、版本对校

底本字格序列与对照本（维基文庫整理出的 md，或同书另一版本）现场比对，不入库。

```ts
import { compareWhole, buildVariantTest, runCompare } from 'book-text-util';
const cells = [{ c: '天', a: '1:1:1' }, /* … */];       // 阅读顺序，a = 页:列:序
const { items, segments } = await compareWhole({ cells, md, file: '001', label: '本册', isVariant: buildVariantTest(table) });
// item.cat: glyph 异体 | word 用字不同 | add 增 | omit 脱 | struct 结构
```

- `compareChapter`：按卷分段（册↔卷对应）；`runCompare`：连取数一起做（传 `transport`，不给 `isVariant` 时按浏览器环境取 `/compare/glyph-variants.json`，Node 请自己传）。
- **异体字组**：给了 `isVariant` 时，`diffChars` 按「异体＝同字」对齐，逐字互为异体的等长一段单独成一处（`hunk.variant`，类别 glyph），不再和旁边真正的用字不同粘成一条 word。判定只认表里的直接配对，不做传递（葢≈蓋、蓋≈盖 不推出 葢≈盖，避免 干／乾／幹 之类并成一组）。
- 异体字判定用 open-guji-cv 的 `edges.tsv` 抽出的表（`{ pairs: "葢蓋\n畧略…" }`）。
- 其余：`diffChars`、`classify`、`wikiChars`/`chapterChars`、`parseCmp`/`formatCmp`（`?cmp=` 链接）。
- 界面相关（标记装饰 `decorate`、偏好存储 `prefs`、React 钩子）留在网站，不在本包。

## 三、命令行

```bash
npx book-text-util export  --root <版本目录> --chapter 020 --format entity --links --glyph simplified --out out/
npx book-text-util compare --base 底本.txt --ref 对照本.md [--variants glyph-variants.json] [--json]
```

`--glyph` 非 original 需额外安装 `opencc-js` 与 `book-index-ui`。

## 开发

```bash
cd npm && npm ci && npm run typecheck && npm test && npm run build
```

改导出规则须与 book-text 的 Python 生成器一起改：`python3 tools/export-golden.py --book-text <book-text 检出>` 重出正文答案，`UPDATE_GOLDEN=1 npm test` 重出整文件答案。

## 发布

Actions →「Publish book-text-util」→ Run workflow（`dry_run` 可先试）。走 npm Trusted Publishing，不存 token；发布前把 `npm/package.json` 的 version 升好（默认只升 patch）。首次需在 npmjs.com 的包设置里登记 Trusted Publisher：`open-guji / book-text-util / publish.yml`。

## 三、对校报告（命令行）

```bash
book-text-util report --base-root <底本版本目录> --ref-root <对照版本目录> --chapters 001-005 \
  --variants glyph-variants.json --base-label 开源古籍自校本 --ref-label 殆知阁 --out report.md
```

逐册整章对整章，输出 Markdown：汇总表（字数、相似度、各类条数）＋每册「用字不同／对照本多／对照本少」逐条（位置、前后文，差异字加粗）；`--list word,add,omit,glyph` 可改列哪几类。库内对应 `buildReport`、`parseChapters`。
