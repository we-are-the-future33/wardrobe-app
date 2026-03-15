export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  let pageTitle = '';
  let mainImageUrl = null;
  let pageText = '';

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Referer': 'https://www.google.com/',
      'Cache-Control': 'no-cache',
    };
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const pageRes = await fetch(url, { headers, signal: controller.signal });
    const html = await pageRes.text();

    // OG 이미지
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImage) mainImageUrl = ogImage[1];

    // 타이틀 (가장 중요 - 상품명+브랜드+색상 포함)
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    pageTitle = ogTitle?.[1] || titleTag?.[1] || '';

    // OG description
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);

    // 가격 패턴 찾기 (무신사 특화)
    const priceMatch = html.match(/["']sale_price["'][^>]*>([^<]+)/i)
      || html.match(/(\d{1,3}(?:,\d{3})+)원/);

    // 텍스트 추출
    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 1500);

    pageText = [
      pageTitle,
      ogDesc?.[1] || '',
      priceMatch?.[1] ? priceMatch[1]+'원' : '',
      cleanText
    ].filter(Boolean).join('\n').slice(0, 2500);

  } catch(e) {
    pageText = '';
  }

  try {
    const userContent = pageTitle
      ? `상품 페이지 정보:\nURL: ${url}\n타이틀: ${pageTitle}\n\n페이지 내용:\n${pageText}\n\n타이틀에서 브랜드, 상품명, 색상을 최우선으로 추출하세요.`
      : `URL: ${url}\nURL 패턴에서 상품 정보를 추정하세요.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `쇼핑몰 상품 정보 추출 전문가. JSON만 반환. 다른 텍스트 없음.

타이틀 파싱 규칙:
- "브랜드명(영문) 상품명 (색상)" 형태가 많음
- 예: "로파이(LOFI) 루퍼스 빈티지 레더 벨트 (블랙/실버)" → brand:"로파이(LOFI)", name:"블랙/실버 루퍼스 빈티지 레더 벨트", colors:["블랙","실버"]
- 예: "무신사 스탠다드 크루 넥 티셔츠 (화이트)" → brand:"무신사 스탠다드", colors:["화이트"]
- 가격은 페이지에서 가장 낮은 판매가 기준

셋업/세트 상품(자켓+바지, 수트 등)은 items 배열로 각각 분리.
일반 단품은 items 배열에 하나만.

온도 기준:
- 반팔/민소매: 23~35 | 긴팔/셔츠: 17~24 | 맨투맨/후드: 12~20
- 얇은가디건/니트: 10~20 | 두꺼운니트: 3~14 | 자켓/블레이저: 12~20
- 트렌치/가을아우터: 8~18 | 코트: -5~10 | 패딩: -15~5
- 반바지: 23~35 | 슬랙스: 10~28 | 청바지: 5~22
- 벨트/액세서리: 0~35

형식: {"brand":"브랜드","price":"가격","items":[{"name":"색상+상품명","category":"아우터/상의/하의/원피스/신발/액세서리","colors":["색상"],"material":["소재"],"style":["캐주얼/포멀/미니멀/스트릿/스포티/빈티지"],"temp_min":숫자,"temp_max":숫자}]}`,
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
