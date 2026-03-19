# Smart Save｜自定义网页下载的文件路径

任何带有下载按钮的网页，均可由你指定下载后保存的路径，为自己构建一个专属的本地 WorkSpace。

## 功能特点

- 自动识别网页中的下载/导出操作，弹出路径选择面板
- 调用系统原生文件夹选择器，选择任意本地目录
- 历史路径持久化保存，跨网页全局可用
- 下载完成后系统通知提示

## 安装方式

1. 克隆本仓库
   ```bash
   git clone https://github.com/ray11081988/smart-save.git
   ```
2. 打开 Chrome，访问 `chrome://extensions/`
3. 右上角开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择刚才克隆的 `smart-save` 文件夹

## 使用方式

1. 在任意网页点击下载/导出按钮
2. 插件自动弹出路径选择面板
3. 点击「选择文件夹...」调起系统文件夹选择器，或从历史路径中选择
4. 点击「确定」，文件直接保存到指定目录

## 技术栈

- Chrome Extension Manifest V3
- File System Access API
- IndexedDB（路径持久化）

## 项目结构

```
smart-save/
├── manifest.json      # 插件配置
├── background.js      # 下载拦截逻辑
├── popup/
│   ├── popup.html     # 面板 UI
│   ├── popup.css      # 样式
│   └── popup.js       # 交互逻辑
└── icons/             # 插件图标
```

## License

MIT

## 本服务由YouNavi产品团队提供技术支持

https://younavi.me
一款能够一键整合你的所有会议、沟通、交流录音和其他上下文，提供智能分析决策服务的 Agent 产品。
让 Navi 帮你解读每一场有价值的对话背后的深意，发掘言外之意，锁定关键信息，让每一场会议、访谈、沟通都沉淀为可执行的洞察。
