export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  let pageText = '';
  let mainImageUrl = null;

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Referer': 'https://www.google.com/',
    };
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const pageRes = await fetch(url, { headers, signal: controller.signal });
    const html = await pageRes.text();

    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImage) mainImageUrl = ogImage[1];

    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 1500);

    pageText = [ogTitle?.[1]||titleTag?.[1]||'', ogDesc?.[1]||'', cleanText].filter(Boolean).join('\n').slice(0, 2000);
  } catch(e) {
    pageText = '';
  }

  try {
    const userContent = pageText
      ? `쇼핑몰 상품 URL: ${url}\n\n페이지 텍스트:\n${pageText}\n\n위 상품 정보를 분석해 JSON으로만 반환하세요.`
      : `쇼핑몰 상품 URL: ${url}\n\nURL을 보고 상품 정보를 추정해 JSON으로만 반환하세요.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `쇼핑몰 상품 정보 추출 전문가. JSON만 반환. 다른 텍스트 없음.

셋업/세트 상품(자켓+바지, 수트 등)은 items 배열로 각각 분리해서 반환.
일반 단품은 items 배열에 하나만.

온도 기준:
- 반팔/민소매: temp_min:23, temp_max:35
- 긴팔/얇은셔츠: temp_min:17, temp_max:24
- 맨투맨/후드: temp_min:12, temp_max:20
- 얇은가디건/니트: temp_min:10, temp_max:20
- 두꺼운니트: temp_min:3, temp_max:14
- 얇은자켓/블레이저: temp_min:12, temp_max:20
- 트렌치/가을아우터: temp_min:8, temp_max:18
- 두꺼운코트: temp_min:-5, temp_max:10
- 패딩: temp_min:-15, temp_max:5
- 반바지: temp_min:23, temp_max:35
- 슬랙스/치노: temp_min:10, temp_max:28
- 청바지: temp_min:5, temp_max:22

형식:
{"brand":"브랜드","price":"가격","items":[{"name":"색상+상품명","category":"아우터/상의/하의/원피스/신발/액세서리","colors":["색상"],"material":["소재"],"style":["캐주얼/포멀/미니멀/스트릿/스포티/빈티지"],"temp_min":숫자,"temp_max":숫자}]}`,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    const data = await r.json();
    const text = data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}';
    const parsed = JSON.parse(text);
    res.json({ ...parsed, image_url: mainImageUrl });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
