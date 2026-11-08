# book-text-util

古籍文本处理工具，供 [开源古籍网站](https://github.com/open-guji/kaiyuanguji-web) 与命令行脚本共用。npm 包在 [`npm/`](npm/)。

- 下载导出：char／punct／entity 三层 → guji-markdown（分行本、标点本、专名本）
- 版本对校：底本与对照本的现场字级比对与分类
- 字形转换：异体字归一、繁→简

文档见 [npm/README.md](npm/README.md)。`tools/export-golden.py` 用 book-text 的 Python 生成器重出导出测试的标准答案。
