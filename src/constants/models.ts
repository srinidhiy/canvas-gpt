import { Model } from '../types/canvas';

export const MODELS: Model[] = [
  {
    id: 'claude-3-5-sonnet-latest',
    name: 'Claude 3.5 Sonnet',
    short: 'Claude 3.5',
    description: 'Anthropic flagship reasoning',
    color: 'bg-purple-50 text-purple-700'
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    short: 'Claude Haiku',
    description: 'Fast, cost-effective responses',
    color: 'bg-amber-50 text-amber-700'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    short: 'GPT-4o',
    description: 'OpenAI omnidirectional model',
    color: 'bg-blue-50 text-blue-700'
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    short: 'GPT-4o mini',
    description: 'Fast and capable mini model',
    color: 'bg-emerald-50 text-emerald-700'
  }
];
