# 法语语法查询（Raycast Extension）

基于欧路词典法语语法内容的本地检索扩展。支持全文搜索，内容以 Markdown 形式直接在 Raycast 的 Detail 视图中展示（含表格）。

## 功能

- 按标题、分类、正文内容快速搜索
- 左侧列表 + 右侧详情同步预览（`isShowingDetail`）
- 无搜索时按大类分组展示
- 一键复制 Markdown 内容或标题
- 表格以 Markdown 表格渲染（复杂合并单元格会展平，但内容完整）

## 安装与开发

1. 确保已安装 [Raycast](https://www.raycast.com/) 和 Node.js。
2. 在本目录执行：

```bash
npm install
npm run dev
```

3. 在 Raycast 中导入该扩展（Develop 模式会自动出现）。

## 数据

`src/data.json` 包含全部语法条目（标题、分类、Markdown 内容）。如需更新数据，可重新生成该文件。

## 说明

Raycast 的 Detail 视图原生支持 CommonMark + GFM 表格，因此无需将表格转为图片即可直接渲染。
