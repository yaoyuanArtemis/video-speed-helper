# 从哪里开始读代码

所有运行代码都在 `video-speed.user.js`，按六部分排列：

| 部分 | 职责 | 关键名称 |
|---|---|---|
| 一、倍速设置 | 限制范围，读取上次设置 | `MIN_SPEED`、`MAX_SPEED`、`speed` |
| 二、控制面板 | 创建页面控件和局部样式 | `panel`、`root`、`refreshPanel` |
| 三、修改视频 | 设置倍速，保存选择 | `applySpeed`、`setSpeed` |
| 四、面板事件 | 把输入和按钮连接到调速函数 | `change`、`click` |
| 五、课程连播 | 尝试开始播放，结束后定位下一课 | `bindCourseVideo`、`tryStart` |
| 六、视频发现 | 处理现有视频与后来加载的视频 | `findVideos`、`MutationObserver` |

## 倍速调用链

```text
输入数字 / 点击 8× 或 16×
  → setSpeed(value)
  → 保存设置
  → applySpeed(video)
  → video.playbackRate = speed
  → 更新面板显示
```

`GM_getValue` 和 `GM_setValue` 由油猴提供，负责持久保存设置。DOM 查询、事件监听和 `MutationObserver` 由浏览器提供。

## 连播调用链

```text
发现视频 → 判断电子科大域名、路径和顶层页面
         → 给视频绑定播放与结束事件
         → tryStart() 尝试播放
         → ended 自然结束
         → 读取右侧课程列表及当前项
         → 检查下一课地址
         → location.assign() 跳转
```

`WeakSet` 用来记住处理过的元素，避免重复绑定事件。定时重试只服务于新视频启动，播放成功或超时后会清理。

建议先看 `applySpeed`，再看 `setSpeed` 和面板按钮，最后读视频发现与课程连播；无需先研究完整的原 h5player 工程。
