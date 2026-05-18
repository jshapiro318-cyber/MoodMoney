import { WORLD1_LESSONS, WORLD2_LESSONS } from './lessons/w1-basics.js';
import { WORLD3_LESSONS, WORLD4_LESSONS } from './lessons/w3-budget.js';
import { WORLD5_LESSONS, WORLD6_LESSONS } from './lessons/w5-investing.js';
import { WORLD7_LESSONS, WORLD8_LESSONS } from './lessons/w7-realestate.js';
import { WORLD9_LESSONS, WORLD10_LESSONS } from './lessons/w9-economics.js';
import { WORLD11_LESSONS, WORLD12_LESSONS } from './lessons/w11-insurance.js';
import { WORLD13_LESSONS, WORLD14_LESSONS } from './lessons/w13-retirement.js';
import { WORLD15_LESSONS, WORLD16_LESSONS } from './lessons/w15-business.js';

export const LESSONS = [
  ...WORLD1_LESSONS,
  ...WORLD2_LESSONS,
  ...WORLD3_LESSONS,
  ...WORLD4_LESSONS,
  ...WORLD5_LESSONS,
  ...WORLD6_LESSONS,
  ...WORLD7_LESSONS,
  ...WORLD8_LESSONS,
  ...WORLD9_LESSONS,
  ...WORLD10_LESSONS,
  ...WORLD11_LESSONS,
  ...WORLD12_LESSONS,
  ...WORLD13_LESSONS,
  ...WORLD14_LESSONS,
  ...WORLD15_LESSONS,
  ...WORLD16_LESSONS,
];

export const CATEGORIES = [
  'All', 'Budgeting', 'Credit', 'Investing', 'Psychology',
  'Economics', 'Banking', 'Real Estate', 'Insurance', 'FinTech',
  'Career', 'Business', 'Wealth',
];

export const DIFFICULTIES = ['all', 'beginner', 'intermediate', 'advanced'];

// World exports for Learn.jsx
export {
  WORLD1_LESSONS, WORLD2_LESSONS,
  WORLD3_LESSONS, WORLD4_LESSONS,
  WORLD5_LESSONS, WORLD6_LESSONS,
  WORLD7_LESSONS, WORLD8_LESSONS,
  WORLD9_LESSONS, WORLD10_LESSONS,
  WORLD11_LESSONS, WORLD12_LESSONS,
  WORLD13_LESSONS, WORLD14_LESSONS,
  WORLD15_LESSONS, WORLD16_LESSONS,
};
