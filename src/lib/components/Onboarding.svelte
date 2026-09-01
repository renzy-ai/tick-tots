<!--
  首次使用引导（D15）：三步向导
  首次打开自动弹出，讲清"怎么看时间轴"和"家长入口在哪"。
  看完点"开始使用"写入本地标记，下次不再弹。
-->
<script lang="ts">
  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();

  let step = $state(0);

  const steps = [
    {
      icon: '⏰',
      title: '这是给宝贝看的时间轴',
      desc: '把一天要做的事变成一条彩色长条。\n宝贝看一眼就知道：现在在做什么、还剩多久。'
    },
    {
      icon: '🌈',
      title: '颜色代表时间',
      desc: '浅黄色的长条是白天，蓝色弯弯的弧是睡觉。\n灰色=已经过去，亮色=还没到，当前活动会一闪一闪提醒你。'
    },
    {
      icon: '⚙️',
      title: '家长怎么改',
      desc: '长按屏幕左上角的半透明小齿轮 2 秒，\n就能调整起床睡觉时间、增删活动。孩子平时看不到它。'
    }
  ];

  function next() {
    if (step < steps.length - 1) {
      step = step + 1;
    } else {
      onClose();
    }
  }

  function skip() {
    onClose();
  }
</script>

{#if visible}
  <div class="onboarding" role="dialog" aria-modal="true">
    <div class="card">
      <div class="dots">
        {#each steps as _, i (i)}
          <span class="dot" class:active={i === step} class:done={i < step}></span>
        {/each}
      </div>

      <div class="step-icon">{steps[step].icon}</div>
      <h2 class="step-title">{steps[step].title}</h2>
      <p class="step-desc">{steps[step].desc}</p>

      <div class="actions">
        {#if step < steps.length - 1}
          <button class="btn ghost" onclick={skip}>跳过</button>
          <button class="btn primary" onclick={next}>下一步</button>
        {:else}
          <button class="btn primary wide" onclick={next}>开始使用 🎉</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .onboarding {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(ellipse at center, rgba(20, 30, 60, 0.78) 0%, rgba(10, 15, 30, 0.92) 100%);
    backdrop-filter: blur(4px);
    padding: 24px;
    animation: fade-in 0.3s ease;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .card {
    width: 100%;
    max-width: 420px;
    background: linear-gradient(180deg, #ffffff 0%, #f3f6ff 100%);
    border-radius: 28px;
    padding: 32px 28px 26px;
    text-align: center;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
    animation: pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes pop {
    from {
      transform: scale(0.85);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 18px;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #d6def0;
    transition: all 0.3s;
  }

  .dot.active {
    background: #4a90e2;
    width: 26px;
    border-radius: 5px;
  }

  .dot.done {
    background: #9ec5f5;
  }

  .step-icon {
    font-size: 76px;
    line-height: 1;
    margin: 6px 0 14px;
    animation: gentle-bob 2.4s ease-in-out infinite;
  }

  @keyframes gentle-bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-7px);
    }
  }

  .step-title {
    font-size: 22px;
    font-weight: 800;
    color: #1e293b;
    margin-bottom: 12px;
  }

  .step-desc {
    font-size: 15px;
    line-height: 1.7;
    color: #51607a;
    white-space: pre-line;
    margin-bottom: 24px;
    min-height: 84px;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .btn {
    border: none;
    border-radius: 14px;
    font-size: 16px;
    font-weight: 700;
    padding: 14px 22px;
    cursor: pointer;
    transition: transform 0.15s;
  }

  .btn:active {
    transform: scale(0.96);
  }

  .btn.primary {
    background: linear-gradient(135deg, #4a90e2 0%, #2f6fb5 100%);
    color: white;
    flex: 1;
  }

  .btn.ghost {
    background: #eef2fb;
    color: #6b7a99;
  }

  .btn.wide {
    width: 100%;
    flex: none;
  }
</style>
