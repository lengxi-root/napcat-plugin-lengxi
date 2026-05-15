export function normalizeImageBaseUrl (url: string): string {
  let v = (url || '').trim().replace(/\/+$/, '');
  v = v.replace(/\/v1($|\/.*$)/i, '');
  v = v.replace(/\/images\/generations$/i, '');
  v = v.replace(/\/images\/edits$/i, '');
  return v;
}

export function aspectRatioToOpenAISize (aspect?: string): string {
  if (!aspect || aspect === '自动' || aspect === '1:1') return '1024x1024';
  if (['16:9', '3:2', '4:3', '5:4', '21:9'].includes(aspect)) return '1792x1024';
  return '1024x1792';
}
