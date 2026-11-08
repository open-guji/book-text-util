import { defineConfig } from 'tsup';

export default defineConfig([
    { entry: ['src/index.ts', 'src/browser.ts', 'src/node.ts'], format: ['esm', 'cjs'], dts: true, clean: true, target: 'es2022' },
    // 源文件自带 shebang；字形转换用的 opencc-js、book-index-ui 是可选依赖，运行时才 import，不打进包
    { entry: ['src/cli.ts'], format: ['esm'], target: 'node18', external: ['opencc-js', 'book-index-ui'] },
]);
