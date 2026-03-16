export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' });

  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Remove.bg API 키가 설정되지 않았어요. Vercel 환경변수에 REMOVEBG_API_KEY를 추가해주세요.' });

  try {
    let imageBase64;
    if (imageUrl.startsWith('data:')) {
      imageBase64 = imageUrl.split(',')[1];
    } else {
      const imgRes = await fetch(imageUrl, { headers: { 'Referer': 'https://www.musinsa.com' } });
      const buf = await imgRes.arrayBuffer();
      imageBase64 = Buffer.from(buf).toString('base64');
    }

    const formData = new FormData();
    formData.append('image_file_b64', imageBase64);
    formData.append('size', 'auto');

    const r = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData,
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Remove.bg 오류: ${r.status} ${errText}`);
    }

    const buf = await r.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    res.json({ base64 });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
