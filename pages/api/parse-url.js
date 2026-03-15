export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  let pageText = '';
  let mainImageUrl = null;
  let detailImageUrls = [];

  // 1단계: HTML fetch
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

    // OG 이미지 (대표 이미지)
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImage) mainImageUrl = ogImage[1];

    // OG 텍스트
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    // 상세 이미지 추출 (무신사 본문 이미지)
    const imgMatches = [...html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)];
    const baseUrl = new URL(url);
    detailImageUrls = imgMatches
      .map(m => m[1])
      .filter(src => {
        // 무신사 상품 상세 이미지 패턴
        return (
          src.includes('image.musinsa.com') ||
          src.includes('img.29cm.co.kr') ||
          src.includes('cdn') ||
          src.includes('product') ||
          src.includes('goods')
        ) && !src.includes('icon') && !src.includes('logo') && !src.includes('banner');
      })
      .slice(0, 5); // 최대 5장

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

  // 2단계: 상세 이미지 base64 변환
  const imageContents = [];
  for (const imgUrl of detailImageUrls) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      const imgRes = await fetch(imgUrl, {
        signal: controller.signal,
        headers: { 'Referer': url }
      });
      if (!imgRes.ok) continue;
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) continue;
      const buffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      if (base64.length > 100) {
        imageContents.push({ type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } });
      }
      if (imageContents.length >= 3) break; // 최대 3장
    } catch(e) { continue; }
  }

  // 3단계: Claude로 분석
  try {
    const textContent = pageText
      ? `쇼핑몰 상품 URL: ${url}\n\n페이지 텍스트:\n${pageText}`
      : `쇼핑몰 상품 URL: ${url}`;

    const messageContent = [
      ...imageContents,
      { type: 'text', text: `${textContent}\n\n위 정보(이미지 포함)에서 옷 정보를 추출해 JSON만 반환하세요. 이미지에서 소재, 디테일, 케어 방법을 최대한 추출하세요.` }
    ];

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: `쇼핑몰 상품 정보 추출 전문가. JSON만 반환. 다른 텍스트 절대 없음.
온도 기준표:
- 반팔/민소매: temp_min:23, temp_max:35
- 긴팔 티셔츠/얇은 셔츠: temp_min:17, temp_max:24
- 맨투맨/후드: temp_min:12, temp_max:20
- 얇은 가디건/니트: temp_min:10, temp_max:20
- 두꺼운 니트/스웨터: temp_min:3, temp_max:14
- 얇은 자켓/블레이저: temp_min:12, temp_max:20
- 트렌치코트/가을 아우터: temp_min:8, temp_max:18
- 두꺼운 코트: temp_min:-5, temp_max:10
- 패딩/점퍼: temp_min:-15, temp_max:5
- 반바지: temp_min:23, temp_max:35
- 슬랙스/치노: temp_min:10, temp_max:28
- 청바지: temp_min:5, temp_max:22

형식: {"name":"색상+상품명","category":"아우터/상의/하의/원피스/신발/액세서리","colors":["색상"],"material":["소재"],"style":["캐주얼/포멀/미니멀/스트릿/스포티/빈티지"],"temp_min":숫자,"temp_max":숫자,"brand":"브랜드","price":"가격","care":"세탁방법(있으면)","detail":"소재상세(있으면)"}`,
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    const data = await r.json();
    const text = data.content?.[0]?.text?.replace(/```json|```/g,'').trim()||'{}';
    const parsed = JSON.parse(text);
    res.json({ ...parsed, image_url: mainImageUrl, images_analyzed: imageContents.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
