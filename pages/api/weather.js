export default async function handler(req, res) {
  const { city, time } = req.query;
  if (!city) return res.status(400).json({ error: 'city required' });

  const key = process.env.WEATHER_API_KEY;
  const today = new Date().toISOString().split('T')[0];
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${encodeURIComponent(city)}&dt=${today}&lang=ko`;

  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `WeatherAPI error: ${r.status}` });
    const data = await r.json();
    const hour = time ? parseInt(time.split(':')[0]) : new Date().getHours();
    const hourData = data.forecast.forecastday[0].hour.find(h => new Date(h.time).getHours() === hour) || data.current;

    res.json({
      city: data.location.name,
      temp: Math.round(hourData.temp_c || data.current.temp_c),
      feels_like: Math.round(hourData.feelslike_c || data.current.feelslike_c),
      condition: hourData.condition?.text || data.current.condition.text,
      humidity: hourData.humidity || data.current.humidity,
      wind_kph: Math.round(hourData.wind_kph || data.current.wind_kph),
      chance_of_rain: hourData.chance_of_rain || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
