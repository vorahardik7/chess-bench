import type { Key } from '@lichess-org/chessground/types';

export function asKey(square: string): Key {
  return square as Key;
}

export function uciLineToSan(fen: string, uciLine: string): string {
  void fen;
  if (!uciLine.trim()) return '';
  return uciLine;
}

export function getModelLogoPath(modelId: string): string | null {
  const provider = modelId.split('/')[0];
  
  const logoMap: Record<string, string> = {
    'x-ai': 'xai',
    'google': 'google',
    'openai': 'openai',
    'anthropic': 'anthropic',
    'mistralai': 'mistral',
    'nex-agi': 'deepseek',
    'deepseek': 'deepseek',
    'xiaomi': 'ai2-color',
    'allenai': 'ai2-color',
    'z-ai': 'zai',
    'qwen': 'qwen',
  };
  
  const logoName = logoMap[provider];
  if (!logoName) return null;
  
  return `/model_icons/${logoName}.svg`;
}
