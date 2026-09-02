<!--
  夜间星空装饰层（睡觉时段浮现）

  目标：在屏幕中央「睡觉」月亮（🌙 活动图标）的左右两侧空白区铺满星星，
        配合柔和月晕 + 角落淡星云，做出「深邃夜空 / 满天繁星」的氛围。
  设计约束（设计规范 §3.1 竖屏挂墙）：
    - 纯装饰，pointer-events: none，绝不拦截任何点击
    - 安静、助眠：只做轻微闪烁，不做流星/大动效（避免越看越精神）
    - 星星用固定种子生成，避免每秒 tick 重渲染造成闪烁/跳动
-->
<script lang="ts">
  interface Props {
    /** 是否睡觉时段（控制整层淡入淡出） */
    night: boolean;
  }

  let { night }: Props = $props();

  /** 固定种子 PRNG（mulberry32），保证星星位置/大小每次渲染一致、不抖动 */
  function mulberry32(seed: number) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 月亮中心（与 now-section 中 🌙 大致对齐：水平居中、偏上） */
  const MOON_X = 50;
  const MOON_Y = 40;

  type Star = {
    x: number;
    y: number;
    size: number;
    bright: boolean;
    delay: number;
    dur: number;
  };

  // 模块加载时一次性生成，之后恒定
  function buildStars(): Star[] {
    const rnd = mulberry32(20260822);
    const stars: Star[] = [];
    const perSide = 64; // 左右各 64 颗，集中在月亮两侧空白区
    // 左、右两侧空白带：避开月亮正中的窄带（MOON_X ± 6），让月亮"干净"
    const ranges: [number, number][] = [
      [2, MOON_X - 8],
      [MOON_X + 8, 98]
    ];
    for (const [x0, x1] of ranges) {
      for (let i = 0; i < perSide; i++) {
        const x = x0 + rnd() * (x1 - x0);
        const y = 4 + rnd() * 90; // 竖向铺满整屏
        const r = rnd();
        const bright = r > 0.88; // 约 12% 为亮星
        const size = bright ? 3 + rnd() * 2.4 : 1 + rnd() * 1.8;
        stars.push({
          x,
          y,
          size,
          bright,
          delay: rnd() * 4,
          dur: 2.4 + rnd() * 3.2
        });
      }
    }
    return stars;
  }

  const stars = buildStars();
</script>

<div class="night-sky" class:night aria-hidden="true">
  <!-- 深邃感：角落两团极淡星云 -->
  <div class="nebula nebula-a"></div>
  <div class="nebula nebula-b"></div>

  <!-- 月亮柔光晕（让中央 🌙 像发光月亮，营造层次） -->
  <div class="moon-halo" style="left: {MOON_X}%; top: {MOON_Y}%"></div>

  <!-- 偶尔划过的流星（不频繁、安静，助眠不刺激） -->
  <div class="shooting-star s1"><span class="tail"></span></div>
  <div class="shooting-star s2"><span class="tail"></span></div>
  <div class="shooting-star s3"><span class="tail"></span></div>

  <!-- 满天繁星：集中在月亮左右空白区 -->
  <div class="stars">
    {#each stars as s (s.x.toFixed(2) + '-' + s.y.toFixed(2))}
      <span
        class="star"
        class:bright={s.bright}
        style="left: {s.x}%; top: {s.y}%;
               width: {s.size}px; height: {s.size}px;
               animation-delay: {s.delay}s; animation-duration: {s.dur}s"
      ></span>
    {/each}
  </div>
</div>

<style>
  .night-sky {
    position: absolute;
    inset: 0;
    z-index: 0; /* 在内容(z2)与高光层(z1)之下，在渐变背景之上 */
    pointer-events: none;
    overflow: hidden;
    opacity: 0;
    transition: opacity 1.2s ease;
  }

  .night-sky.night {
    opacity: 1;
  }

  /* ---- 角落淡星云：增加纵深，不抢戏 ---- */
  .nebula {
    position: absolute;
    border-radius: 50%;
    filter: blur(40px);
    opacity: 0.5;
  }

  .nebula-a {
    width: 46vmax;
    height: 46vmax;
    left: -12vmax;
    top: -10vmax;
    background: radial-gradient(
      circle,
      rgba(86, 104, 178, 0.35) 0%,
      transparent 65%
    );
  }

  .nebula-b {
    width: 40vmax;
    height: 40vmax;
    right: -10vmax;
    bottom: -12vmax;
    background: radial-gradient(
      circle,
      rgba(120, 92, 168, 0.3) 0%,
      transparent 65%
    );
  }

  /* ---- 月亮柔光晕（缩小到 220px，避免压过星星）---- */
  .moon-halo {
    position: absolute;
    width: 220px;
    height: 220px;
    transform: translate(-50%, -50%);
    background: radial-gradient(
      circle,
      rgba(214, 230, 255, 0.2) 0%,
      rgba(180, 205, 245, 0.09) 38%,
      transparent 72%
    );
    filter: blur(5px);
  }

  /* ---- 流星：细尾 + 亮头，沿对角线掠过，长周期里只在极短窗口可见 ---- */
  .shooting-star {
    position: absolute;
    opacity: 0;
    will-change: transform, opacity;
  }

  .shooting-star .tail {
    display: block;
    width: 140px;
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.95) 100%
    );
    transform: rotate(24deg);
    transform-origin: right center;
    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.85));
  }

  .s1 {
    top: 6%;
    left: 22%;
    animation: shoot 16s ease-in 0s infinite;
  }

  .s2 {
    top: 4%;
    left: 58%;
    animation: shoot 21s ease-in 7s infinite;
  }

  .s3 {
    top: 10%;
    left: 72%;
    animation: shoot 26s ease-in 14s infinite;
  }

  @keyframes shoot {
    0% {
      opacity: 0;
      transform: translate(0, 0);
    }
    3% {
      opacity: 1;
    }
    7% {
      opacity: 1;
      transform: translate(240px, 120px);
    }
    9% {
      opacity: 0;
      transform: translate(260px, 130px);
    }
    100% {
      opacity: 0;
      transform: translate(260px, 130px);
    }
  }

  /* ---- 星星 ---- */
  .stars {
    position: absolute;
    inset: 0;
  }

  .star {
    position: absolute;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
    transform: translate(-50%, -50%);
    animation-name: twinkle;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: opacity, transform;
  }

  /* 亮星：更大更亮，带十字星芒感 */
  .star.bright {
    box-shadow:
      0 0 6px rgba(255, 255, 255, 0.95),
      0 0 12px rgba(190, 215, 255, 0.6);
  }

  @keyframes twinkle {
    0%,
    100% {
      opacity: 0.25;
      transform: translate(-50%, -50%) scale(0.85);
    }
    50% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.1);
    }
  }

  /* 尊重「减少动态效果」无障碍偏好 */
  @media (prefers-reduced-motion: reduce) {
    .star {
      animation: none;
      opacity: 0.85;
    }
    .shooting-star {
      animation: none;
      opacity: 0;
    }
  }
</style>
