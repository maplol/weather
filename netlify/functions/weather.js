const CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

exports.handler = async (event) => {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "API key not configured. Add OPENWEATHER_API_KEY in Netlify env." }),
    };
  }

  const city = event.queryStringParameters?.city;
  const lat = event.queryStringParameters?.lat;
  const lon = event.queryStringParameters?.lon;
  const type = event.queryStringParameters?.type || "current";
  const lang = event.queryStringParameters?.lang || "ru";

  if (!city && (!lat || !lon)) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "Missing city or lat/lon parameters" }),
    };
  }

  const base = "https://api.openweathermap.org/data/2.5";
  const path = type === "forecast" ? "forecast" : "weather";
  const forecastParams = type === "forecast" ? "&cnt=40" : "";
  const locationParam = city ? `q=${encodeURIComponent(city)}` : `lat=${lat}&lon=${lon}`;
  const url = `${base}/${path}?${locationParam}&APPID=${apiKey}&units=metric&lang=${lang}${forecastParams}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: CORS,
        body: JSON.stringify({ error: data.message || "Weather API error" }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message || "Network error" }),
    };
  }
};
