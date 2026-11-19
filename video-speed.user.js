// ==UserScript==
// @name         视频倍速与电子科大自动连播
// @namespace    local.video-speed-only
// @author       yaoyuanArtemis
// @homepageURL  https://github.com/yaoyuanArtemis/video-speed-helper
// @supportURL   https://github.com/yaoyuanArtemis/video-speed-helper/issues
// @version      1.3.1
// @description  视频倍速面板、设置记忆及电子科大课程自动连播；默认 1.5 倍。
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// @license      GPL-3.0-only
// ==/UserScript==

// 学习参考：用户提供的 h5player 脚本，原项目 https://github.com/xxxily/h5player。
// 本版保留倍速、小面板和原脚本的电子科大自动连播，不依赖界面组件库。
(() => {
  'use strict';

  // 一、倍速设置：允许 0.25～16 倍，未设置过时默认 1.5 倍。
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 16;
  const STEP = 0.25;
  function isValidSpeed(value) {
    return Number.isFinite(value) && value >= MIN_SPEED && value <= MAX_SPEED;
  }
  let speed = GM_getValue('speed', 1.5);
  if (!isValidSpeed(speed)) speed = 1.5;
  const processedVideos = new WeakSet();

  // 二、控制面板：样式放入 Shadow DOM，减少网页样式对控件的影响。
  const panel = document.createElement('div');
  panel.hidden = true;
  panel.style.cssText = 'position:fixed!important;right:16px!important;bottom:24px!important;z-index:2147483647!important;';
  const root = panel.attachShadow({ mode: 'open' });
  // 此模板是固定内容，没有插入用户输入。
  root.innerHTML = `
    <style>
      :host { color-scheme: light; }
      :host([hidden]) { display: none !important; }
      .bar {
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px; box-sizing: border-box;
        max-width: calc(100vw - 32px); padding: 10px;
        color: #172d28; background: #f5f7ef; border: 1px solid #b9c8bb;
        border-radius: 10px; box-shadow: 0 3px 14px #0002;
        font: 14px/1.4 sans-serif;
      }
      label { white-space: nowrap; }
      button, input {
        box-sizing: border-box; height: 34px; border: 1px solid #9eafa4;
        border-radius: 5px; font: inherit; color: inherit; background: white;
      }
      input { width: 66px; padding: 4px; }
      button { padding: 0 10px; cursor: pointer; white-space: nowrap; }
      button:hover { background: #e5ede0; }
      button:focus-visible, input:focus-visible { outline: 2px solid #24704b; outline-offset: 2px; }
      button:disabled { opacity: .4; cursor: default; }
      @media (max-width: 360px) { .bar { gap: 4px; padding: 6px; } }
    </style>
    <div class="bar" role="group" aria-label="视频倍速控制面板">
      <label for="speed">倍速</label>
      <button id="slower" type="button" aria-label="降低 0.25 倍">−</button>
      <input id="speed" type="number" min="0.25" max="16" step="any" aria-label="视频倍速">
      <button id="faster" type="button" aria-label="增加 0.25 倍">＋</button>
      <button id="reset" type="button">1×</button>
      <button id="speed8" type="button">8×</button>
      <button id="speed16" type="button">16×</button>
    </div>
  `;
  document.body.appendChild(panel);
  const input = root.querySelector('#speed');
  const slower = root.querySelector('#slower');
  const faster = root.querySelector('#faster');

  function refreshPanel() {
    input.value = String(speed);
    slower.disabled = speed <= MIN_SPEED;
    faster.disabled = speed >= MAX_SPEED;
  }

  // 三、修改视频：调速最核心的操作只有这一句。
  function applySpeed(video) {
    video.playbackRate = speed;
  }

  function setSpeed(value) {
    if (!isValidSpeed(value)) return;
    speed = value;
    GM_setValue('speed', speed);
    document.querySelectorAll('video').forEach(applySpeed);
    refreshPanel();
  }

  // 四、面板事件：输入数字，或者点击加减、恢复正常速度。
  input.addEventListener('change', () => {
    if (!input.checkValidity() || !isValidSpeed(input.valueAsNumber)) {
      input.reportValidity();
      refreshPanel();
      return;
    }
    setSpeed(input.valueAsNumber);
  });
  slower.addEventListener('click', () => setSpeed(Math.max(MIN_SPEED, speed - STEP)));
  faster.addEventListener('click', () => setSpeed(Math.min(MAX_SPEED, speed + STEP)));
  root.querySelector('#reset').addEventListener('click', () => setSpeed(1));
  root.querySelector('#speed8').addEventListener('click', () => setSpeed(8));
  root.querySelector('#speed16').addEventListener('click', () => setSpeed(16));
  // 在输入框内操作时，避免按键继续冒泡到网页的播放器快捷键。
  root.addEventListener('keydown', event => event.stopPropagation());
  root.addEventListener('click', event => event.stopPropagation());

  // 五、课程连播：仅适配原脚本的电子科大课程页面。
  const boundCourseVideos = new WeakSet();
  function bindCourseVideo() {
    if (location.hostname !== 'dxpx.uestc.edu.cn' ||
        location.pathname !== '/jjfz/play' || window.top !== window.self) return;
    const video = document.querySelector('#player video');
    if (!video || boundCourseVideos.has(video)) return;
    boundCourseVideos.add(video);

    // 每个新视频只尝试启动一段时间，开始播放后就停止重试。
    let stopped = false;
    let busy = false;
    let clickedStart = false;
    let timer;
    let expiry;
    function stopStartup() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      clearTimeout(expiry);
      video.removeEventListener('loadedmetadata', tryStart);
      video.removeEventListener('canplay', tryStart);
      video.removeEventListener('playing', stopStartup);
      document.removeEventListener('click', onUserGesture, true);
      document.removeEventListener('keydown', onUserGesture, true);
    }
    function onUserGesture(event) {
      if (event.isTrusted) void tryStart();
    }
    async function tryStart() {
      if (stopped || busy) return;
      if (!video.isConnected || video.ended || !video.paused) return stopStartup();
      busy = true;
      try {
        // 优先触发网站播放器的启动按钮，再尝试原生 play()。
        const start = document.querySelector('#player .xgplayer-start');
        if (!clickedStart && start && start.getClientRects().length &&
            !start.classList.contains('hide')) {
          clickedStart = true;
          start.click();
        }
        if (!stopped && video.paused) await video.play();
      } catch (error) {
        // 自动播放被浏览器阻止时，等待一次真实的点击或按键。
        if (error.name === 'NotAllowedError') clearInterval(timer);
      } finally {
        busy = false;
      }
    }
    video.addEventListener('loadedmetadata', tryStart);
    video.addEventListener('canplay', tryStart);
    video.addEventListener('playing', stopStartup);
    document.addEventListener('click', onUserGesture, true);
    document.addEventListener('keydown', onUserGesture, true);
    timer = setInterval(tryStart, 750);
    expiry = setTimeout(stopStartup, 30000);
    void tryStart();

    // 自然结束 → 读取右侧课程列表 → 找到当前课的下一课 → 跳转。
    video.addEventListener('ended', () => {
      stopStartup();
      const links = [...document.querySelectorAll('.right-card a')]
        .filter(link => link.querySelector('.vitem'));
      const current = links.findIndex(link => link.querySelector('.vitem.active'));
      if (current < 0 || current + 1 >= links.length) return;
      const next = new URL(links[current + 1].href, location.href);
      if (next.origin !== location.origin || next.pathname !== '/jjfz/play') return;
      location.assign(next.href);
    }, { once: true });
  }

  // 六、视频发现：处理现有视频，也处理网页后来加载的视频。
  function findVideos() {
    const videos = document.querySelectorAll('video');
    panel.hidden = videos.length === 0;
    videos.forEach(video => {
      if (processedVideos.has(video)) return;
      processedVideos.add(video);
      applySpeed(video);
      // 同一 video 元素换源后，再应用当前倍速。
      video.addEventListener('loadedmetadata', () => applySpeed(video));
    });
    bindCourseVideo();
  }
  refreshPanel();
  findVideos();
  const observer = new MutationObserver(findVideos);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
