import type { Activity } from './types';

/**
 * 配色按「类别」编码，与《交互与UI设计规范.md》§2.1 一致，共 6 类：
 *   进食 = 珊瑚橙  #F0997B → #D85A30
 *   睡眠 = 冷蓝    #85B7EB → #378ADD
 *   玩耍 = 草绿    #97C459 → #639922
 *   卫生 = 青      #5DCAA5 → #1D9E75
 *   学习 = 紫      #AFA9EC → #7F77DD
 *   外出 = 暖黄    #FAC775 → #BA7517   （原「天蓝」与睡眠冷蓝太接近，改暖黄；与进食珊瑚橙区分明显）
 */
export const activities: Record<string, Activity> = {
  play: {
    id: 'play',
    name: '自由时间',
    icon: '🧸',
    color: '#97C459',
    colorLight: '#C0DD97',
    gradient: 'linear-gradient(135deg, #97C459 0%, #639922 100%)'
  },
  dinner: {
    id: 'dinner',
    name: '吃晚饭',
    icon: '🍽️',
    color: '#F0997B',
    colorLight: '#F5C4B3',
    gradient: 'linear-gradient(135deg, #F0997B 0%, #D85A30 100%)'
  },
  bath: {
    id: 'bath',
    name: '洗澡',
    icon: '🛁',
    color: '#5DCAA5',
    colorLight: '#9FE1CB',
    gradient: 'linear-gradient(135deg, #5DCAA5 0%, #1D9E75 100%)'
  },
  story: {
    id: 'story',
    name: '故事',
    icon: '📚',
    color: '#AFA9EC',
    colorLight: '#CECBF6',
    gradient: 'linear-gradient(135deg, #AFA9EC 0%, #7F77DD 100%)'
  },
  sleep: {
    id: 'sleep',
    name: '睡觉',
    icon: '🌙',
    color: '#85B7EB',
    colorLight: '#B5D4F4',
    gradient: 'linear-gradient(135deg, #85B7EB 0%, #378ADD 100%)'
  },
  breakfast: {
    id: 'breakfast',
    name: '洗手+早饭',
    icon: '🥣',
    color: '#F0997B',
    colorLight: '#F5C4B3',
    gradient: 'linear-gradient(135deg, #F0997B 0%, #D85A30 100%)'
  },
  lunch: {
    id: 'lunch',
    name: '午饭',
    icon: '🥪',
    color: '#F0997B',
    colorLight: '#F5C4B3',
    gradient: 'linear-gradient(135deg, #F0997B 0%, #D85A30 100%)'
  },
  outside: {
    id: 'outside',
    name: '户外',
    icon: '🌳',
    color: '#97C459',
    colorLight: '#C0DD97',
    gradient: 'linear-gradient(135deg, #97C459 0%, #639922 100%)'
  },
  quiet: {
    id: 'quiet',
    name: '安静时间',
    icon: '🎨',
    color: '#5DCAA5',
    colorLight: '#9FE1CB',
    gradient: 'linear-gradient(135deg, #5DCAA5 0%, #1D9E75 100%)'
  },
  snack: {
    id: 'snack',
    name: '吃点心+玩',
    icon: '🍎',
    color: '#F0997B',
    colorLight: '#F5C4B3',
    gradient: 'linear-gradient(135deg, #F0997B 0%, #D85A30 100%)'
  },
  tv: {
    id: 'tv',
    name: '看动画',
    icon: '📺',
    color: '#97C459',
    colorLight: '#C0DD97',
    gradient: 'linear-gradient(135deg, #97C459 0%, #639922 100%)'
  },
  teeth: {
    id: 'teeth',
    name: '刷牙',
    icon: '🦷',
    color: '#5DCAA5',
    colorLight: '#9FE1CB',
    gradient: 'linear-gradient(135deg, #5DCAA5 0%, #1D9E75 100%)'
  },
  music: {
    id: 'music',
    name: '音乐',
    icon: '🎵',
    color: '#AFA9EC',
    colorLight: '#CECBF6',
    gradient: 'linear-gradient(135deg, #AFA9EC 0%, #7F77DD 100%)'
  },
  dress: {
    id: 'dress',
    name: '穿衣服',
    icon: '👕',
    color: '#AFA9EC',
    colorLight: '#CECBF6',
    gradient: 'linear-gradient(135deg, #AFA9EC 0%, #7F77DD 100%)'
  },
  nap: {
    id: 'nap',
    name: '午饭+午睡',
    icon: '😴',
    color: '#85B7EB',
    colorLight: '#B5D4F4',
    gradient: 'linear-gradient(135deg, #85B7EB 0%, #378ADD 100%)'
  },
  potty: {
    id: 'potty',
    name: '上厕所',
    icon: '🚽',
    color: '#5DCAA5',
    colorLight: '#9FE1CB',
    gradient: 'linear-gradient(135deg, #5DCAA5 0%, #1D9E75 100%)'
  },
  clean: {
    id: 'clean',
    name: '收拾',
    icon: '🧹',
    color: '#5DCAA5',
    colorLight: '#9FE1CB',
    gradient: 'linear-gradient(135deg, #5DCAA5 0%, #1D9E75 100%)'
  },
  reading: {
    id: 'reading',
    name: '念书',
    icon: '📖',
    color: '#AFA9EC',
    colorLight: '#CECBF6',
    gradient: 'linear-gradient(135deg, #AFA9EC 0%, #7F77DD 100%)'
  },
  wake: {
    id: 'wake',
    name: '起床',
    icon: '🛏️',
    color: '#85B7EB',
    colorLight: '#B5D4F4',
    gradient: 'linear-gradient(135deg, #85B7EB 0%, #378ADD 100%)'
  },
  school: {
    id: 'school',
    name: '去幼儿园',
    icon: '🎒',
    color: '#FAC775',
    colorLight: '#FAEEDA',
    gradient: 'linear-gradient(135deg, #FAC775 0%, #BA7517 100%)'
  },
  kindergarten: {
    id: 'kindergarten',
    name: '幼儿园',
    icon: '🏫',
    color: '#FAC775',
    colorLight: '#FAEEDA',
    gradient: 'linear-gradient(135deg, #FAC775 0%, #BA7517 100%)'
  },
  grandma: {
    id: 'grandma',
    name: '放学·接',
    icon: '👵',
    color: '#FAC775',
    colorLight: '#FAEEDA',
    gradient: 'linear-gradient(135deg, #FAC775 0%, #BA7517 100%)'
  },
  puzzle: {
    id: 'puzzle',
    name: '拼图',
    icon: '🧩',
    color: '#AFA9EC',
    colorLight: '#CECBF6',
    gradient: 'linear-gradient(135deg, #AFA9EC 0%, #7F77DD 100%)'
  }
};

// Get activity by ID with fallback
export function getActivity(id: string): Activity {
  return activities[id] ?? {
    id,
    name: id,
    icon: '❓',
    color: '#6b7280',
    colorLight: '#9ca3af',
    gradient: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
  };
}
