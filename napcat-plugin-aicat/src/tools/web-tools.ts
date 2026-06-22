import type { Tool, ToolResult } from '../types';

const TIMEOUT = 15000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const WEB_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网获取实时信息',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          engine: { type: 'string', enum: ['auto', 'baidu', 'bing', 'sogou'], description: '搜索引擎' },
          count: { type: 'integer', description: '返回结果数量' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: '获取网页内容',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '网页URL' },
          max_length: { type: 'integer', description: '最大返回字符数' },
        },
        required: ['url'],
      },
    },
  },
];

async function fetchWithTimeout (url: string, headers?: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...headers,
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

function stripHtml (html: string): string {
  return html
    .replace(/<(script|style|nav|header|footer|aside|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function collectMatches (html: string, pattern: RegExp, count: number): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  for (const m of html.matchAll(pattern)) {
    matches.push(m as RegExpExecArray);
    if (matches.length >= count) break;
  }
  return matches;
}

function normalizeCount (count: number): number {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(Math.floor(n), 20);
}

async function searchBaidu (query: string, count: number): Promise<ToolResult> {
  try {
    const limit = normalizeCount(count);
    const html = await fetchWithTimeout(
      `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${Math.min(limit * 2, 20)}&ie=utf-8`
    );

    const results: { title: string; url: string; snippet: string; }[] = [];
    const containerPattern = /<div[^>]*class="[^"]*result[^"]*c-container[^"]*"[^>]*>[\s\S]*?<\/div>\s*(?=<div[^>]*class="[^"]*result|$)/g;

    for (const containerMatch of collectMatches(html, containerPattern, limit)) {
      const block = containerMatch[0];
      const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/);
      if (!titleMatch) continue;

      const title = stripHtml(titleMatch[2]);
      const url = titleMatch[1];
      if (!title || !url) continue;

      const snippetMatch =
        block.match(/<span[^>]*class="[^"]*content-right_[^"]*"[^>]*>([\s\S]*?)<\/span>/) ||
        block.match(/<div[^>]*class="[^"]*c-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/) ||
        block.match(/<div[^>]*class="[^"]*c-span-last[^"]*"[^>]*>([\s\S]*?)<\/div>/) ||
        block.match(/<span[^>]*class="[^"]*"[^>]*>([\s\S]{20,300}?)<\/span>/);

      const snippet = snippetMatch ? stripHtml(snippetMatch[1]).slice(0, 300) : '';
      results.push({ title, url, snippet });
    }

    if (results.length === 0) {
      const h3Pattern = /<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/g;
      for (const h3Match of collectMatches(html, h3Pattern, limit)) {
        const title = stripHtml(h3Match[2]);
        if (title && h3Match[1]) results.push({ title, url: h3Match[1], snippet: '' });
      }
    }

    return { success: true, data: { engine: 'baidu', query, results, total: results.length } };
  } catch (e) {
    return { success: false, error: `百度搜索失败: ${String(e)}` };
  }
}

async function searchBing (query: string, count: number): Promise<ToolResult> {
  try {
    const limit = normalizeCount(count);
    const html = await fetchWithTimeout(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.min(limit * 2, 20)}&setlang=zh-CN`
    );

    const results: { title: string; url: string; snippet: string; }[] = [];
    const algoPattern = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;

    for (const algoMatch of collectMatches(html, algoPattern, limit)) {
      const block = algoMatch[1];
      const linkMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;

      const title = stripHtml(linkMatch[2]);
      const url = linkMatch[1];
      if (!title || !url) continue;

      const pMatch =
        block.match(/<p[^>]*>([\s\S]*?)<\/p>/) ||
        block.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>([\s\S]*?)<\/div>/);

      const snippet = pMatch ? stripHtml(pMatch[1]).slice(0, 300) : '';
      results.push({ title, url, snippet });
    }

    if (results.length === 0) {
      const linkPattern = /<h2>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/g;
      for (const linkMatch of collectMatches(html, linkPattern, limit)) {
        const title = stripHtml(linkMatch[2]);
        if (title && linkMatch[1]) results.push({ title, url: linkMatch[1], snippet: '' });
      }
    }

    return { success: true, data: { engine: 'bing', query, results, total: results.length } };
  } catch (e) {
    return { success: false, error: `Bing搜索失败: ${String(e)}` };
  }
}

async function searchSogou (query: string, count: number): Promise<ToolResult> {
  try {
    const limit = normalizeCount(count);
    const html = await fetchWithTimeout(
      `https://www.sogou.com/web?query=${encodeURIComponent(query)}&num=${Math.min(limit * 2, 20)}`
    );

    const results: { title: string; url: string; snippet: string; }[] = [];
    const blockPattern = /<div[^>]*class="[^"]*vrwrap[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*vrwrap|$)/g;

    for (const blockMatch of collectMatches(html, blockPattern, limit)) {
      const block = blockMatch[1];
      const linkMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;

      const title = stripHtml(linkMatch[2]);
      if (!title) continue;

      const descMatch =
        block.match(/<p[^>]*class="[^"]*str_info[^"]*"[^>]*>([\s\S]*?)<\/p>/) ||
        block.match(/<div[^>]*class="[^"]*space-txt[^"]*"[^>]*>([\s\S]*?)<\/div>/);

      const snippet = descMatch ? stripHtml(descMatch[1]).slice(0, 300) : '';
      results.push({ title, url: linkMatch[1], snippet });
    }

    if (results.length === 0) {
      const h3Pattern = /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/g;
      for (const h3Match of collectMatches(html, h3Pattern, limit)) {
        const title = stripHtml(h3Match[2]);
        if (title && h3Match[1]) results.push({ title, url: h3Match[1], snippet: '' });
      }
    }

    return { success: true, data: { engine: 'sogou', query, results, total: results.length } };
  } catch (e) {
    return { success: false, error: `搜狗搜索失败: ${String(e)}` };
  }
}

async function fetchWebpage (url: string, maxLength: number): Promise<ToolResult> {
  try {
    if (!/^https?:\/\//i.test(url)) {
      return { success: false, error: 'URL 必须以 http:// 或 https:// 开头' };
    }

    const max = Number.isFinite(Number(maxLength)) ? Math.max(100, Math.floor(Number(maxLength))) : 3000;
    const html = await fetchWithTimeout(url);

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : '';

    const articleMatch =
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
      html.match(/<div[^>]*class="[^"]*(?:content|article|post|entry|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const raw = articleMatch ? articleMatch[1] : html;
    let content = stripHtml(raw);
    if (content.length > max) content = content.slice(0, max) + '...';

    return { success: true, data: { url, title, content, length: content.length } };
  } catch (e) {
    return { success: false, error: `获取网页失败: ${String(e)}` };
  }
}

export async function executeWebTool (toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (toolName === 'web_search') {
    const query = String(args.query || '').trim();
    if (!query) return { success: false, error: '缺少 query' };

    const engine = String(args.engine || 'auto');
    const count = normalizeCount(Number(args.count || 5));

    if (engine === 'baidu') return searchBaidu(query, count);
    if (engine === 'bing') return searchBing(query, count);
    if (engine === 'sogou') return searchSogou(query, count);

    const baiduResult = await searchBaidu(query, count);
    if (baiduResult.success && ((baiduResult.data as { results?: unknown[]; })?.results?.length ?? 0) > 0) return baiduResult;

    const bingResult = await searchBing(query, count);
    if (bingResult.success && ((bingResult.data as { results?: unknown[]; })?.results?.length ?? 0) > 0) return bingResult;

    return searchSogou(query, count);
  }

  if (toolName === 'fetch_url') {
    return fetchWebpage(String(args.url || ''), Number(args.max_length || 3000));
  }

  return { success: false, error: `未知工具: ${toolName}` };
}

export const getWebTools = (): Tool[] => WEB_TOOLS;
