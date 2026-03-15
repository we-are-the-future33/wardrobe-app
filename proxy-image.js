export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).end();
  try {
    const r = await fetch(decodeURIComponent(url), {
      headers: { 'Referer': 'https://www.musinsa.com' }
    });
    const contentType = r.headers.get('content-type') || 'image/jpeg';
    const buffer = await r.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(buffer));
  } catch(e) {
    res.status(500).end();
  }
}
