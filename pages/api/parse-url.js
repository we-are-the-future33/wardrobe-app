import { chromium } from 'playwright';

// Vercel 서버리스는 실행 시간 제한(60초)이 있음
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ko-KR',
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 무신사 상품 데이터 추출
    const result = await page.evaluate(() => {
      // 상품명
      const name =
        document.querySelector('.goods_name') ||
        document.querySelector('[class*="GoodsName"]') ||
        document.querySelector('h1') ||
        document.querySelector('[class*="product-name"]');

      // 브랜드
      const brand =
        document.querySelector('.brand_name') ||
        document.querySelector('[class*="BrandName"]') ||
        document.querySelector('[class*="brand"]');

      // 가격
      const price =
        document.querySelector('.sale_price') ||
        document.querySelector('[class*="Price"]') ||
        document.querySelector('[class*="price"]');

      // 소재 (상세 정보 테이블)
      const materialEl = Array.from(document.querySelectorAll('th, td, dt, dd')).find(el =>
        el.textContent.includes('소재') || el.textContent.includes('원단') || el.textContent.includes('재질')
      );
      const materialNext = materialEl?.nextElementSibling;

      // 대표 이미지
      const img =
        document.querySelector('.product_img img') ||
        document.querySelector('[class*="MainImage"] img') ||
        document.querySelector('[class*="product-image"] img') ||
        document.querySelector('meta[property="og:image"]');

      // OG 태그에서 추가 정보
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
      const ogImage = document.querySelector('meta[property="og:image"]')?.content;
      const ogDesc = document.querySelector('meta[property="og:description"]')?.content;

      return {
        name: name?.textContent?.trim() || ogTitle || '',
        brand: brand?.textContent?.trim() || '',
        price: price?.textContent?.trim() || '',
        material: materialNext?.textContent?.trim() || '',
        image_url: ogImage || img?.src || img?.content || '',
        description: ogDesc || document.body.innerText.slice(0, 2000),
      };
    });

    await browser.close();

    // Claude로 추가 분석
    const claudeKey = process.env.ANTHROPIC_API_KEY;
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: '쇼핑몰 상품 정보를 분석해 JSON만 반환. 다른 텍스트 없음. 형식: {"name":"상품명(색상+종류)","category":"아우터/상의/하의/원피스/신발/액세서리","colors":["색상"],"material":["소재"],"style":["캐주얼/포멀/미니멀/스트릿/스포티/빈티지"],"temp_min":숫자,"temp_max":숫자}',
        messages: [{
          role: 'user',
          content: `상품명: ${result.name}\n브랜드: ${result.brand}\n가격: ${result.price}\n소재: ${result.material}\n설명: ${result.description.slice(0, 500)}\n\n위 정보로 JSON 반환해주세요.`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '{}';
    const parsed = JSON.parse(text);

    res.json({
      ...parsed,
      image_url: result.image_url,
      brand: result.brand,
      price: result.price,
    });

  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error('parse-url error:', e);
    res.status(500).json({ error: e.message });
  }
}
