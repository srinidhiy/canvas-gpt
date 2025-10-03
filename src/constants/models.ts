import { Model } from '../types/canvas';

export const MODELS: Model[] = [
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    short: 'Sonnet 4',
    description: 'Balanced performance',
    color: 'bg-blue-50 text-blue-700'
  },
  {
    id: 'claude-opus-4',
    name: 'Claude Opus 4',
    short: 'Opus 4',
    description: 'Most capable',
    color: 'bg-purple-50 text-purple-700'
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    short: 'GPT-4',
    description: 'OpenAI flagship',
    color: 'bg-green-50 text-green-700'
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    short: 'GPT-3.5',
    description: 'Fast and efficient',
    color: 'bg-orange-50 text-orange-700'
  }
];
