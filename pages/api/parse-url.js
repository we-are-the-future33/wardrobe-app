export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  let pageText = '';
  let imageUrl = null;

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Referer': 'https://www.google.com/',
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const pageRes = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    const html = await pageRes.text();

    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImage) imageUrl = ogImage[1];

    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 1500);

    pageText = [ogTitle?.[1]||titleTag?.[1]||'', ogDesc?.[1]||'', cleanText].filter(Boolean).join('\n').slice(0, 2500);
  } catch(e) {
    pageText = '';
  }

  try {
    const userContent = pageText
      ? `쇼핑몰 상품 페이지에서 옷 정보를 추출해 JSON만 반환하세요.\nURL: ${url}\n페이지 내용:\n${pageText}`
      : `URL에서 상품 정보를 추정해 JSON만 반환하세요.\nURL: ${url}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: '쇼핑몰 상품 정보 추출 전문가. JSON만 반환. 다른 텍스트 없음. {"name":"색상+상품명","category":"아우터/상의/하의/원피스/신발/액세서리","colors":["색상"],"material":["소재"],"style":["캐주얼/포멀/미니멀/스트릿/스포티/빈티지"],"temp_min":숫자,"temp_max":숫자,"brand":"브랜드","price":"가격"}',
        messages: [{ role: 'user', content: userContent }]
      })
    });
    const data = await r.json();
    const text = data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}';
    const parsed = JSON.parse(text);
    res.json({ ...parsed, image_url: imageUrl, page_fetched: !!pageText });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
