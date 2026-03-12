(function () {
  const t = {
    mapLoading: "Загрузка…",
    forecast: "Прогноз",
    forecastNext10: "Прогноз на следующие 10 дней",
    hourlyToday: "Почасовой прогноз на сегодня",
    hourlyNext24: "Ближайшие 24 часа",
    feelsLike: "Ощущается",
    humidity: "Влажность",
    pressure: "Давление",
    wind: "Ветер",
    precipitation: "Осадки",
    close: "Закрыть",
    loading: "загрузка…",
    error: "Ошибка",
    serviceUnavailable: "Сервис недоступен",
    mmHg: "мм рт.ст.",
    mps: "м/с",
    regions: {
      BY: { brest: "Брест", vitebsk: "Витебск", gomel: "Гомель", grodno: "Гродно", minsk: "Минск", mogilev: "Могилёв" },
    },
  };

  const API_URL = "/.netlify/functions/weather";
  const OWM_URL = "https://api.openweathermap.org/data/2.5";
  const OWM_ICON = "https://openweathermap.org/img/wn";
  const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

  const BY_BOUNDS = { minLng: 23.1, maxLng: 32.8, minLat: 51.25, maxLat: 56.2 };
  const SVG_WIDTH = 400;
  const SVG_HEIGHT = 320;
  const PADDING = 8;

  const CACHE_TTL = 5 * 60 * 1000;
  const weatherCache = new Map();

  function cachedFetch(key, fetcher) {
    const entry = weatherCache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return Promise.resolve(entry.data);
    return fetcher().then((data) => {
      weatherCache.set(key, { data, ts: Date.now() });
      return data;
    });
  }

  const currentCountry = "BY";
  const countries = window.WEATHER_COUNTRIES || {};

  function tr(key) {
    const keys = key.split(".");
    let v = t;
    for (const k of keys) v = v?.[k];
    return v ?? key;
  }

  function regionName(countryCode, regionId) {
    return t.regions?.[countryCode]?.[regionId] ?? regionId;
  }

  function esc(str) {
    const el = document.createElement("span");
    el.textContent = String(str);
    return el.innerHTML;
  }

  let _currentCityId = null;
  let _currentCitySecret = null;

  let _photosIndex = null;
  const PHOTOS_PER_DAY = 5;

  async function _loadPhotosIndex() {
    if (_photosIndex) return _photosIndex;
    try {
      const res = await fetch("data/photos.json");
      if (res.ok) _photosIndex = await res.json();
    } catch { /* no photos available */ }
    return _photosIndex || {};
  }

  const _slider = { photos: [], idx: 0, timer: null };
  const SLIDE_INTERVAL = 8000;

  const _themeCls = {
    city:  { on: ["text-white", "text-photo-shadow"], off: ["text-teal-500"] },
    temp:  { on: ["text-white", "text-photo-shadow"], off: ["text-gray-900"] },
    desc:  { on: ["text-white/90", "text-photo-shadow"], off: ["text-gray-500"] },
    extra: { on: ["bg-white/20", "text-white", "backdrop-blur-sm", "text-photo-shadow"], off: ["bg-[#e8f8f5]", "text-gray-700"] },
  };

  function _applyPhotoTheme(mode) {
    const header = document.getElementById("detail-header");
    const city = document.getElementById("detail-city");
    const temp = document.getElementById("detail-temp");
    const desc = document.getElementById("detail-desc");
    const fallback = document.getElementById("detail-header-fallback");
    const hasVisual = mode === "photo" || mode === "fallback";

    const swap = (el, key) => {
      if (!el) return;
      const { on, off } = _themeCls[key];
      if (hasVisual) { el.classList.remove(...off); el.classList.add(...on); }
      else           { el.classList.remove(...on);  el.classList.add(...off); }
    };

    if (hasVisual) {
      header?.classList.add("min-h-[220px]", "sm:min-h-[260px]");
    } else {
      header?.classList.remove("min-h-[220px]", "sm:min-h-[260px]");
    }

    swap(city, "city");
    swap(temp, "temp");
    swap(desc, "desc");
    document.querySelectorAll("#detail-extra .detail-extra-item").forEach((el) => swap(el, "extra"));

    if (fallback) fallback.classList.toggle("hidden", mode !== "fallback");
  }

  function _stopAutoSlide() {
    if (_slider.timer) { clearInterval(_slider.timer); _slider.timer = null; }
  }

  function _crossfadeTo(idx) {
    const cur = document.getElementById("photo-slide");
    const next = document.getElementById("photo-slide-next");
    const src = _slider.photos[idx];
    if (!cur || !next || !src) return;

    next.style.backgroundImage = `url(${src})`;
    next.style.opacity = "1";
    cur.style.opacity = "0";

    setTimeout(() => {
      cur.style.backgroundImage = `url(${src})`;
      cur.style.opacity = "1";
      next.style.opacity = "0";
    }, 1600);
  }

  function _startAutoSlide() {
    _stopAutoSlide();
    if (_slider.photos.length < 2) return;
    _slider.timer = setInterval(() => {
      _slider.idx = (_slider.idx + 1) % _slider.photos.length;
      _crossfadeTo(_slider.idx);
    }, SLIDE_INTERVAL);
  }

  function showPhotoSlider(photos) {
    _stopAutoSlide();
    const slider = document.getElementById("photo-slider");
    const slide = document.getElementById("photo-slide");
    const slideNext = document.getElementById("photo-slide-next");

    _slider.photos = photos;
    _slider.idx = 0;

    if (!photos.length) {
      if (slider) slider.classList.add("hidden");
      if (slide) slide.style.backgroundImage = "";
      if (slideNext) { slideNext.style.backgroundImage = ""; slideNext.style.opacity = "0"; }
      return;
    }

    if (slider) slider.classList.remove("hidden");
    if (slide) { slide.style.backgroundImage = `url(${photos[0]})`; slide.style.opacity = "1"; }
    if (slideNext) slideNext.style.opacity = "0";
    _startAutoSlide();
  }

  async function fetchCityPhotos(cityId) {
    const index = await _loadPhotosIndex();
    const all = index[cityId] || [];
    if (!all.length) return [];

    const day = new Date().getDay();
    if (all.length >= PHOTOS_PER_DAY * 7) {
      return all.slice(day * PHOTOS_PER_DAY, day * PHOTOS_PER_DAY + PHOTOS_PER_DAY);
    }
    const result = [];
    for (let i = 0; i < Math.min(PHOTOS_PER_DAY, all.length); i++) {
      result.push(all[(day * PHOTOS_PER_DAY + i) % all.length]);
    }
    return result;
  }

  function iconUrl(code) {
    return code ? `${OWM_ICON}/${code}@2x.png` : "";
  }

  function animatedIcon(code, size = 72) {
    const s = size;
    const half = s / 2;
    const isNight = code?.endsWith("n");
    const base = code?.replace(/[dn]$/, "");
    const sun = `<circle cx="${half * 0.92}" cy="${half * 0.85}" r="${s * 0.18}" fill="#FBBF24" class="anim-sun"><animate attributeName="r" values="${s * 0.18};${s * 0.21};${s * 0.18}" dur="3s" repeatCount="indefinite"/></circle>`;
    const moon = `<circle cx="${half * 0.92}" cy="${half * 0.8}" r="${s * 0.15}" fill="#CBD5E1" class="anim-moon"/>`;
    const star = isNight ? sun.replace(/#FBBF24/, "#CBD5E1") : "";
    const celestial = isNight ? moon : sun;
    const cloud = (x, y, sc, op = 1) => `<g transform="translate(${x},${y}) scale(${sc})" opacity="${op}"><ellipse cx="0" cy="0" rx="${s * 0.22}" ry="${s * 0.13}" fill="#94A3B8"/><ellipse cx="${-s * 0.1}" cy="${s * 0.02}" rx="${s * 0.15}" ry="${s * 0.1}" fill="#CBD5E1"/><ellipse cx="${s * 0.12}" cy="${s * 0.02}" rx="${s * 0.16}" ry="${s * 0.11}" fill="#E2E8F0"/></g>`;
    const rain = (cx, dy) => `<line x1="${cx}" y1="${half + dy}" x2="${cx - 2}" y2="${half + dy + s * 0.1}" stroke="#60A5FA" stroke-width="1.5" stroke-linecap="round"><animate attributeName="y1" values="${half + dy};${half + dy + 3};${half + dy}" dur="0.8s" repeatCount="indefinite"/><animate attributeName="y2" values="${half + dy + s * 0.1};${half + dy + s * 0.1 + 3};${half + dy + s * 0.1}" dur="0.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite"/></line>`;
    const snow = (cx, dy) => `<circle cx="${cx}" cy="${half + dy}" r="1.5" fill="#E2E8F0"><animate attributeName="cy" values="${half + dy};${half + dy + 6};${half + dy}" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/></circle>`;
    const bolt = `<polygon points="${half - 2},${half - 2} ${half + 1},${half + 4} ${half - 1},${half + 4} ${half + 2},${half + 10}" fill="#FBBF24"><animate attributeName="opacity" values="1;0;1;1;0;1" dur="2s" repeatCount="indefinite"/></polygon>`;

    let content = "";
    switch (base) {
      case "01": content = isNight
        ? `${moon}<animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite"/>`
        : `${sun}`; break;
      case "02": content = `${celestial}${cloud(half * 1.1, half * 1.05, 0.9)}`; break;
      case "03": content = `${cloud(half * 0.8, half * 0.7, 0.8, 0.6)}${cloud(half * 1.1, half * 1.0, 1)}`; break;
      case "04": content = `${cloud(half * 0.7, half * 0.65, 0.7, 0.5)}${cloud(half * 1.05, half * 0.85, 1)}${cloud(half * 0.5, half * 1.1, 0.8, 0.7)}`; break;
      case "09": content = `${cloud(half, half * 0.7, 1)}${rain(half - 6, 6)}${rain(half, 4)}${rain(half + 6, 8)}`; break;
      case "10": content = `${celestial}${cloud(half * 1.05, half * 0.9, 0.95)}${rain(half - 4, 10)}${rain(half + 4, 12)}`; break;
      case "11": content = `${cloud(half, half * 0.7, 1)}${bolt}${rain(half - 7, 6)}${rain(half + 7, 8)}`; break;
      case "13": content = `${cloud(half, half * 0.7, 1)}${snow(half - 6, 6)}${snow(half, 10)}${snow(half + 6, 4)}${snow(half + 3, 14)}`; break;
      case "50": content = `${[0.3, 0.45, 0.6, 0.75].map((f, i) => `<line x1="${s * 0.2}" y1="${s * f}" x2="${s * 0.8}" y2="${s * f}" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" opacity="${0.3 + i * 0.15}"><animate attributeName="x1" values="${s * 0.2};${s * 0.25};${s * 0.2}" dur="${2 + i * 0.3}s" repeatCount="indefinite"/></line>`).join("")}`; break;
      default: content = sun;
    }

    return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg" class="drop-shadow-lg">${content}</svg>`;
  }

  function locale() {
    return "ru-RU";
  }

  function apiLang() {
    return "ru";
  }

  function owmIconFromWeatherCode(code, isDay) {
    if (code === 0) return isDay ? "01d" : "01n";
    if ([1, 2].includes(code)) return isDay ? "02d" : "02n";
    if (code === 3) return "04d";
    if ([45, 48].includes(code)) return "50d";
    if ([51, 53, 55, 56, 57].includes(code)) return "09d";
    if ([61, 63, 65, 80, 81, 82].includes(code)) return "10d";
    if ([66, 67, 71, 73, 75, 77, 85, 86].includes(code)) return "13d";
    if ([95, 96, 99].includes(code)) return "11d";
    return "01d";
  }

  function weatherTextFromCode(code) {
    if (code === 0) return "Ясно";
    if ([1, 2].includes(code)) return "Переменная облачность";
    if (code === 3) return "Пасмурно";
    if ([45, 48].includes(code)) return "Туман";
    if ([51, 53, 55, 56, 57].includes(code)) return "Морось";
    if ([61, 63, 65, 80, 81, 82].includes(code)) return "Дождь";
    if ([66, 67].includes(code)) return "Ледяной дождь";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "Снег";
    if ([95, 96, 99].includes(code)) return "Гроза";
    return "Без осадков";
  }

  function project([lng, lat]) {
    const x = PADDING + ((lng - BY_BOUNDS.minLng) / (BY_BOUNDS.maxLng - BY_BOUNDS.minLng)) * (SVG_WIDTH - 2 * PADDING);
    const y = PADDING + ((BY_BOUNDS.maxLat - lat) / (BY_BOUNDS.maxLat - BY_BOUNDS.minLat)) * (SVG_HEIGHT - 2 * PADDING);
    return [x, y];
  }

  function ringsToPath(rings) {
    return rings
      .map((ring) => {
        const pts = ring.map((c) => project(c));
        return "M" + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L") + " Z";
      })
      .join(" ");
  }

  function geoToPath(geom) {
    if (geom.type === "Polygon") return ringsToPath(geom.coordinates);
    if (geom.type === "MultiPolygon") return geom.coordinates.map(ringsToPath).join(" ");
    return "";
  }

  function parseCurrent(data) {
    const w = data.weather?.[0];
    const m = data.main;
    return {
      temp: m?.temp != null ? Math.round(m.temp) : null,
      feels: m?.feels_like != null ? Math.round(m.feels_like) : null,
      desc: w?.description ?? "—",
      icon: w?.icon ?? "",
      humidity: m?.humidity ?? null,
      pressure: m?.pressure ?? null,
      wind: data.wind?.speed ?? null,
    };
  }

  function parseHourlyToday(forecastData) {
    const hourly = forecastData?.hourly;
    if (!hourly?.time?.length) return { isFallback: true, items: [] };
    const now = new Date();
    const todayKey = now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toDateString();

    const all = hourly.time.map((iso, i) => {
      const dt = new Date(iso);
      return {
        dt,
        time: dt.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }),
        temp: Math.round(hourly.temperature_2m?.[i] ?? 0),
        pop: hourly.precipitation_probability?.[i] ?? 0,
        dayKey: dt.toDateString(),
      };
    });

    const todayItems = all.filter((h) => h.dayKey === todayKey && h.dt >= now && h.dt.getHours() % 3 === 0);
    if (todayItems.length >= 4) return { isFallback: false, items: todayItems.slice(0, 8) };

    const tomorrowItems = all.filter((h) => h.dayKey === tomorrowKey && h.dt.getHours() % 3 === 0);
    const combined = [...todayItems];
    if (tomorrowItems.length && todayItems.length > 0) {
      combined.push({ separator: true, label: "завтра" });
    }
    combined.push(...tomorrowItems);
    const total = combined.filter((h) => !h.separator).length;
    if (total === 0) {
      const fallback = all.filter((h) => h.dt >= now && h.dt.getHours() % 3 === 0).slice(0, 8);
      return { isFallback: true, items: fallback };
    }

    const limited = [];
    let count = 0;
    for (const item of combined) {
      if (item.separator) { limited.push(item); continue; }
      if (count >= 8) break;
      limited.push(item);
      count++;
    }
    return { isFallback: false, items: limited };
  }

  function parseForecast(data) {
    const daily = data?.daily;
    const hourly = data?.hourly;
    if (!daily?.time?.length || !hourly?.time?.length) return { days: [], byDate: new Map() };

    const now = new Date();
    const todayKey = now.toDateString();
    const byDate = new Map();

    hourly.time.forEach((iso, i) => {
      const dt = new Date(iso);
      const key = dt.toDateString();
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push({
        dt,
        time: dt.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }),
        temp: Math.round(hourly.temperature_2m?.[i] ?? 0),
        pop: Math.round(hourly.precipitation_probability?.[i] ?? 0),
        wind: hourly.windspeed_10m?.[i] ?? 0,
        humidity: hourly.relative_humidity_2m?.[i] ?? 0,
      });
    });

    const days = daily.time
      .map((iso, i) => {
        const dt = new Date(iso);
        const key = dt.toDateString();
        const code = daily.weather_code?.[i] ?? 0;
        return {
          dateKey: key,
          day: dt.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }),
          temp: Math.round(daily.temperature_2m_max?.[i] ?? 0),
          icon: owmIconFromWeatherCode(code, true),
          desc: weatherTextFromCode(code),
        };
      })
      .filter((d) => d.dateKey !== todayKey)
      .slice(0, 10);

    return { days, byDate };
  }

  async function _fetchCurrent(apiName) {
    const lang = `&lang=${apiLang()}`;
    let res;
    if (window.__OW_API_KEY) {
      res = await fetch(`${OWM_URL}/weather?q=${encodeURIComponent(apiName)}&APPID=${window.__OW_API_KEY}&units=metric${lang}`);
    } else {
      res = await fetch(`${API_URL}?city=${encodeURIComponent(apiName)}${lang}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error(tr("serviceUnavailable"));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  }

  async function _fetchForecast10d(region) {
    if (region?.lat == null || region?.lon == null) throw new Error("Координаты региона не заданы");
    const url =
      `${OPEN_METEO_URL}?latitude=${encodeURIComponent(region.lat)}&longitude=${encodeURIComponent(region.lon)}` +
      "&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,windspeed_10m,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
      "&forecast_days=11&timezone=auto";
    const res = await fetch(url);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error(tr("serviceUnavailable"));
    const data = await res.json();
    if (!res.ok) throw new Error(data.reason || `HTTP ${res.status}`);
    return data;
  }

  async function _fetchCurrentByCoords(lat, lon) {
    const lang = `&lang=${apiLang()}`;
    let res;
    if (window.__OW_API_KEY) {
      res = await fetch(`${OWM_URL}/weather?lat=${lat}&lon=${lon}&APPID=${window.__OW_API_KEY}&units=metric${lang}`);
    } else {
      res = await fetch(`${API_URL}?lat=${lat}&lon=${lon}${lang}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error(tr("serviceUnavailable"));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  }

  function fetchCurrent(apiName) {
    return cachedFetch(`current:${apiName}`, () => _fetchCurrent(apiName));
  }

  function fetchCurrentCoords(lat, lon) {
    return cachedFetch(`current:${lat},${lon}`, () => _fetchCurrentByCoords(lat, lon));
  }

  function fetchForecast(region) {
    return cachedFetch(`forecast:${region?.id ?? region?.apiName}`, () => _fetchForecast10d(region));
  }

  function getAllCities() {
    const all = [];
    for (const region of (countries[currentCountry]?.regions || [])) {
      for (const city of (region.cities || [])) all.push(city);
    }
    return all;
  }

  function getPlaces() {
    return countries[currentCountry]?.places || [];
  }

  function updateVisitedUI() {
    const section = document.getElementById("visited-section");
    const btn = document.getElementById("visited-btn");
    const unvisitBtn = document.getElementById("unvisit-btn");
    const secretWrap = document.getElementById("secret-fact");
    const secretText = document.getElementById("secret-fact-text");
    if (!section || !btn) return;

    if (!_currentCityId) {
      section.classList.add("hidden");
      secretWrap?.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    const app = window.wbApp;
    const visited = app?.isVisited(_currentCityId);
    const count = app?.getVisitedCount(_currentCityId) || 0;

    if (visited) {
      btn.className = "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all active:scale-[0.97] bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10";
      btn.innerHTML = `
        <svg class="w-4 h-4 text-teal-500" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        <span>Посещено${count > 1 ? " (" + count + ")" : ""}</span>
      `;
      unvisitBtn?.classList.remove("hidden");
      unvisitBtn?.classList.add("flex");
      if (_currentCitySecret && secretWrap && secretText) {
        secretText.textContent = _currentCitySecret;
        secretWrap.classList.remove("hidden");
      }
    } else {
      btn.className = "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all active:scale-[0.97] bg-teal-500 hover:bg-teal-600 text-white shadow-md shadow-teal-500/20";
      btn.innerHTML = `
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        <span>Я тут был</span>
      `;
      unvisitBtn?.classList.add("hidden");
      unvisitBtn?.classList.remove("flex");
      secretWrap?.classList.add("hidden");
    }
  }

  function lngLatToSvg(lng, lat) {
    const x = PADDING + ((lng - BY_BOUNDS.minLng) / (BY_BOUNDS.maxLng - BY_BOUNDS.minLng)) * (SVG_WIDTH - PADDING * 2);
    const y = PADDING + ((BY_BOUNDS.maxLat - lat) / (BY_BOUNDS.maxLat - BY_BOUNDS.minLat)) * (SVG_HEIGHT - PADDING * 2);
    return [x, y];
  }

  function renderPOIMarkers() {
    const g = document.getElementById("poi-markers");
    if (!g) return;
    g.innerHTML = "";
    const places = getPlaces();
    for (const p of places) {
      const [cx, cy] = lngLatToSvg(p.lon, p.lat);
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
      marker.setAttribute("class", "poi-marker");
      marker.setAttribute("data-place-id", p.id);
      marker.style.cursor = "pointer";
      marker.innerHTML = `
        <circle cx="${cx}" cy="${cy}" r="3.5" fill="#8b5cf6" stroke="#fff" stroke-width="0.8" opacity="0.7"/>
        <text x="${cx}" y="${cy - 5}" text-anchor="middle" fill="#6d28d9" font-size="2.8" font-weight="600" stroke="#fff" stroke-width="0.3" paint-order="stroke" pointer-events="none">${esc(p.name)}</text>
      `;
      marker.addEventListener("click", (e) => {
        e.stopPropagation();
        focusOnPlace(p.id);
      });
      g.appendChild(marker);
    }
  }

  function renderVisitedMarkers() {
    const g = document.getElementById("visited-markers");
    if (!g) return;
    g.innerHTML = "";
    const app = window.wbApp;
    if (!app) return;
    const data = app.getData();
    const visited = data?.visited || {};
    const allCities = getAllCities();
    const allPlaces = getPlaces();
    const lookup = [...allCities, ...allPlaces];

    for (const [cityId, info] of Object.entries(visited)) {
      const item = lookup.find((c) => c.id === cityId);
      if (!item) continue;
      const [cx, cy] = lngLatToSvg(item.lon, item.lat);
      const count = info.count || 1;
      const isPlace = allPlaces.some((p) => p.id === cityId);
      const r = count > 1 ? 5 : 4;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", r);
      circle.setAttribute("fill", isPlace ? "#8b5cf6" : "#f59e0b");
      circle.setAttribute("stroke", "#fff");
      circle.setAttribute("stroke-width", "1.2");
      circle.setAttribute("opacity", "0.9");
      circle.classList.add("visited-pin");
      g.appendChild(circle);

      if (count > 1) {
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", cx);
        txt.setAttribute("y", cy);
        txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("dominant-baseline", "central");
        txt.setAttribute("fill", "#fff");
        txt.setAttribute("font-size", "4");
        txt.setAttribute("font-weight", "700");
        txt.setAttribute("pointer-events", "none");
        txt.textContent = count;
        g.appendChild(txt);
      }
    }
  }

  function fillPlacePanel(place) {
    openPanel();
    hideSkeletons();
    _currentCityId = place.id;
    _currentCitySecret = place.secret || null;

    const cityEl = document.getElementById("detail-city");
    if (cityEl) cityEl.textContent = place.name;

    showPhotoSlider([]);
    _applyPhotoTheme("fallback");

    const iconWrap = document.querySelector(".detail-icon-wrap");
    if (iconWrap) iconWrap.innerHTML = `<svg class="w-16 h-16 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17.657 16.657L13.414 20.9a2 2 0 0 1-2.828 0l-4.243-4.243a8 8 0 1 1 11.314 0z"/><circle cx="12" cy="11" r="3"/></svg>`;
    const tempEl = document.getElementById("detail-temp");
    if (tempEl) tempEl.textContent = "";
    const descEl = document.getElementById("detail-desc");
    if (descEl) descEl.textContent = "";

    const extra = document.getElementById("detail-extra");
    if (extra) extra.innerHTML = "";

    const aboutWrap = document.getElementById("city-about");
    if (aboutWrap) {
      aboutWrap.classList.remove("hidden");
      const aboutText = document.getElementById("city-about-text");
      if (aboutText) aboutText.textContent = place.desc || "";
    }

    const hourly = document.getElementById("hourly-chart");
    if (hourly) { hourly.innerHTML = ""; hourly.classList.add("hidden"); hourly.setAttribute("aria-hidden", "true"); }

    const ft = document.getElementById("detail-forecast-title");
    if (ft) ft.textContent = "";
    const list = document.getElementById("forecast-list");
    if (list) list.innerHTML = "";

    updateVisitedUI();
  }

  let _currentRoute = null;
  let _routeRoundTrip = false;

  function renderRouteLine() {
    const g = document.getElementById("route-line-layer");
    if (!g) return;
    g.innerHTML = "";
    if (!_currentRoute || _currentRoute.length < 2) return;

    const app = window.wbApp;
    const home = app?.getHome();
    const startLat = home?.lat ?? 53.9;
    const startLon = home?.lon ?? 27.56;

    const points = [[startLon, startLat], ..._currentRoute.map((c) => [c.lon, c.lat])];
    if (_routeRoundTrip) points.push([startLon, startLat]);
    const svgPoints = points.map(([lon, lat]) => lngLatToSvg(lon, lat));

    const d = svgPoints.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#3b82f6");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-dasharray", "4 2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("opacity", "0.7");
    path.classList.add("route-path");
    g.appendChild(path);

    svgPoints.forEach((p, i) => {
      if (i === 0) return;
      if (_routeRoundTrip && i === svgPoints.length - 1) return;
      const num = document.createElementNS("http://www.w3.org/2000/svg", "g");
      num.innerHTML = `
        <circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#3b82f6" stroke="#fff" stroke-width="0.8"/>
        <text x="${p[0]}" y="${p[1]}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="3.5" font-weight="700" pointer-events="none">${i}</text>
      `;
      g.appendChild(num);
    });
  }

  function focusOnPlace(placeId) {
    const allCities = getAllCities();
    const allPlaces = getPlaces();
    const item = [...allCities, ...allPlaces].find((c) => c.id === placeId);
    if (!item) return;

    closeProfile();

    const city = allCities.find((c) => c.id === placeId);
    if (city) {
      const regions = countries[currentCountry]?.regions || [];
      for (const region of regions) {
        if (region.cities?.some((c) => c.id === placeId)) {
          onCityClick(city, region.id);
          requestAnimationFrame(() => {
            const pathEl = document.querySelector(`path.city-district[data-city-id="${placeId}"]`);
            if (pathEl && _zoomToPath) _zoomToPath(pathEl);
          });
          return;
        }
      }
    }

    if (_zoomCtrl) _zoomCtrl.resetView();
    requestAnimationFrame(() => {
      const [cx, cy] = lngLatToSvg(item.lon, item.lat);
      if (_zoomCtrl) {
        const [elX, elY] = svgToElGlobal(cx, cy);
        _zoomCtrl.focusOnPoint(elX, elY, 4);
      }
    });
    fillPlacePanel(item);
  }

  function svgToElGlobal(svgX, svgY) {
    const svg = document.getElementById("belarus-svg");
    const wrap = document.getElementById("svg-wrap");
    if (!svg || !wrap) return [0, 0];
    const vb = svg.viewBox.baseVal;
    const svgRect = svg.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const scaleX = svgRect.width / vb.width;
    const px = svgRect.left + (svgX - vb.x) * scaleX - wrapRect.left - wrapRect.width / 2;
    const py = svgRect.top + (svgY - vb.y) * scaleX - wrapRect.top - wrapRect.height / 2;
    return [px, py];
  }

  function renderHomeMarker() {
    const g = document.getElementById("home-marker");
    if (!g) return;
    g.innerHTML = "";
    const app = window.wbApp;
    const home = app?.getHome();
    if (!home) return;
    const [cx, cy] = lngLatToSvg(home.lon, home.lat);
    const pin = document.createElementNS("http://www.w3.org/2000/svg", "g");
    pin.innerHTML = `
      <circle cx="${cx}" cy="${cy}" r="5" fill="#3b82f6" stroke="#fff" stroke-width="1.5" opacity="0.9"/>
      <circle cx="${cx}" cy="${cy}" r="2" fill="#fff"/>
    `;
    g.appendChild(pin);
  }

  function openProfile() {
    const panel = document.getElementById("profile-panel");
    const overlay = document.getElementById("profile-overlay");
    panel?.setAttribute("data-visible", "true");
    panel?.setAttribute("aria-hidden", "false");
    overlay?.setAttribute("data-visible", "true");
    overlay?.setAttribute("aria-hidden", "false");
    fillProfile();
  }

  function closeProfile() {
    const panel = document.getElementById("profile-panel");
    const overlay = document.getElementById("profile-overlay");
    panel?.setAttribute("data-visible", "false");
    panel?.setAttribute("aria-hidden", "true");
    overlay?.setAttribute("data-visible", "false");
    overlay?.setAttribute("aria-hidden", "true");
  }

  function fillProfile() {
    const app = window.wbApp;
    if (!app) return;
    const user = app.getUser();
    const data = app.getData();
    const visited = data?.visited || {};

    if (user) {
      const photo = document.getElementById("profile-photo");
      const name = document.getElementById("profile-name");
      const email = document.getElementById("profile-email");
      if (photo) photo.src = user.photoURL || "";
      if (name) name.textContent = user.displayName || "Путешественник";
      if (email) email.textContent = user.email || "";
    }

    const allCities = getAllCities();
    const allPlaces = getPlaces();
    const lookup = [...allCities, ...allPlaces];
    const visitedIds = Object.keys(visited);
    const totalItems = allCities.length + allPlaces.length;

    document.getElementById("stat-visited").textContent = visitedIds.length;
    document.getElementById("stat-total").textContent = totalItems;

    const list = document.getElementById("profile-visited-list");
    const empty = document.getElementById("profile-empty");
    if (!list) return;

    if (visitedIds.length === 0) {
      list.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");

    list.innerHTML = visitedIds.map((id) => {
      const item = lookup.find((c) => c.id === id);
      const info = visited[id];
      const name = item?.name || id;
      const count = info?.count || 1;
      const date = info?.lastVisit || "";
      const isPlace = allPlaces.some((p) => p.id === id);
      return `
        <div class="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 group">
          <div class="w-3 h-3 rounded-full shrink-0 ${isPlace ? "bg-violet-500" : "bg-amber-500"}"></div>
          <div class="flex flex-col gap-0.5 min-w-0 flex-1">
            <span class="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">${esc(name)}</span>
            <span class="text-[0.65rem] text-gray-400">${count > 1 ? count + " раз" : "1 раз"}${date ? " · " + date : ""}</span>
          </div>
          <button class="profile-remove-btn opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all" data-city-id="${esc(id)}" title="Убрать">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>`;
    }).join("");

    list.querySelectorAll(".profile-remove-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const cityId = btn.getAttribute("data-city-id");
        if (!cityId) return;
        await app.toggleVisited(cityId);
        renderVisitedMarkers();
        updateVisitedUI();
        fillProfile();
      });
    });
  }

  async function buildRoute() {
    const app = window.wbApp;
    if (!app) return;
    const data = app.getData();
    const visited = data?.visited || {};
    const home = app.getHome();

    const allCities = getAllCities();
    const allPlaces = getPlaces();
    const lookup = [...allCities, ...allPlaces];

    const unvisited = lookup.filter((c) => !visited[c.id]);
    if (unvisited.length === 0) {
      document.getElementById("route-result").innerHTML = `<p class="text-xs text-gray-500 dark:text-gray-400 italic">Вы посетили все места!</p>`;
      document.getElementById("route-result").classList.remove("hidden");
      return;
    }

    const startLat = home?.lat ?? 53.9;
    const startLon = home?.lon ?? 27.56;

    const remaining = [...unvisited];
    const route = [];
    let curLat = startLat;
    let curLon = startLon;

    while (remaining.length > 0 && route.length < 10) {
      let minDist = Infinity;
      let nearest = 0;
      for (let i = 0; i < remaining.length; i++) {
        const d = Math.hypot(remaining[i].lat - curLat, remaining[i].lon - curLon);
        if (d < minDist) { minDist = d; nearest = i; }
      }
      const city = remaining.splice(nearest, 1)[0];
      route.push(city);
      curLat = city.lat;
      curLon = city.lon;
    }

    _currentRoute = route;
    await app.saveRoute(route.map((c) => c.id));
    renderRouteLine();
    renderRouteUI(route, startLat, startLon, allPlaces);

    const cancelBtn = document.getElementById("cancel-route-btn");
    cancelBtn?.classList.remove("hidden");
    cancelBtn?.classList.add("flex");
  }

  function _fmtDist(km) {
    const h = Math.floor(km / 70);
    const m = Math.round((km % 70) / 70 * 60);
    if (h === 0) return `~${Math.round(km)} км · ~${m} мин`;
    return `~${Math.round(km)} км · ~${h}ч ${m}мин`;
  }

  function _segmentHTML(fromName, toName, km) {
    const from = encodeURIComponent(fromName);
    const to = encodeURIComponent(toName);
    return `<div class="flex items-center gap-1.5 py-1 px-2 text-[0.6rem] text-gray-400 dark:text-gray-500">
      <svg class="w-3 h-3 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      <span>${_fmtDist(km)}</span>
      <a href="https://atlasbus.by/%D0%9C%D0%B0%D1%80%D1%88%D1%80%D1%83%D1%82%D1%8B/${from}/${to}" target="_blank" rel="noopener" class="text-blue-400 hover:text-blue-500 underline underline-offset-2">расписание</a>
    </div>`;
  }

  function renderRouteUI(route, startLat, startLon, allPlaces) {
    const resultEl = document.getElementById("route-result");
    if (!resultEl) return;
    resultEl.classList.remove("hidden");

    let totalDist = route.reduce((sum, c, i) => {
      const prevLat = i === 0 ? startLat : route[i - 1].lat;
      const prevLon = i === 0 ? startLon : route[i - 1].lon;
      return sum + haversine(prevLat, prevLon, c.lat, c.lon);
    }, 0);

    if (_routeRoundTrip && route.length > 0) {
      const last = route[route.length - 1];
      totalDist += haversine(last.lat, last.lon, startLat, startLon);
    }

    const homeName = "Дом";
    let html = `<div class="flex items-center gap-2 mb-2">
      <span class="text-xs text-gray-500 dark:text-gray-400">${route.length} мест · ~${Math.round(totalDist)} км${_routeRoundTrip ? " (туда-обратно)" : ""}</span>
    </div><div class="flex flex-col">`;

    route.forEach((c, i) => {
      const prevLat = i === 0 ? startLat : route[i - 1].lat;
      const prevLon = i === 0 ? startLon : route[i - 1].lon;
      const prevName = i === 0 ? homeName : route[i - 1].name;
      const segKm = haversine(prevLat, prevLon, c.lat, c.lon);
      html += _segmentHTML(prevName, c.name, segKm);

      const isPlace = allPlaces.some((p) => p.id === c.id);
      const desc = c.desc || c.about || "";
      html += `<div class="route-item flex items-start gap-2.5 p-2 rounded-lg bg-gray-50 dark:bg-white/5 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" data-place-id="${esc(c.id)}">
        <div class="flex flex-col items-center gap-0.5 pt-0.5">
          <span class="text-[0.6rem] font-bold text-blue-500">${i + 1}</span>
          ${i < route.length - 1 || _routeRoundTrip ? '<div class="w-px h-3 bg-blue-300 dark:bg-blue-600"></div>' : ""}
        </div>
        <div class="flex flex-col gap-0.5 min-w-0 flex-1">
          <span class="text-xs font-semibold text-gray-700 dark:text-gray-200">${esc(c.name)}</span>
          ${desc ? `<span class="text-[0.6rem] text-gray-400 leading-tight">${esc(desc.slice(0, 80))}${desc.length > 80 ? "…" : ""}</span>` : ""}
        </div>
        <div class="w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${isPlace ? "bg-violet-500" : "bg-amber-500"}"></div>
      </div>`;
    });

    if (_routeRoundTrip && route.length > 0) {
      const last = route[route.length - 1];
      const retKm = haversine(last.lat, last.lon, startLat, startLon);
      html += _segmentHTML(last.name, homeName, retKm);
      html += `<div class="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10">
        <svg class="w-3.5 h-3.5 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg>
        <span class="text-xs font-semibold text-blue-600 dark:text-blue-400">Возвращение домой</span>
      </div>`;
    }

    html += "</div>";
    resultEl.innerHTML = html;

    resultEl.querySelectorAll(".route-item").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-place-id");
        if (id) focusOnPlace(id);
      });
    });
  }

  async function cancelRoute() {
    const app = window.wbApp;
    if (app) await app.clearRoute();
    _currentRoute = null;
    renderRouteLine();
    const resultEl = document.getElementById("route-result");
    if (resultEl) { resultEl.innerHTML = ""; resultEl.classList.add("hidden"); }
    const cancelBtn = document.getElementById("cancel-route-btn");
    cancelBtn?.classList.add("hidden");
    cancelBtn?.classList.remove("flex");
  }

  function restoreSavedRoute() {
    const app = window.wbApp;
    if (!app) return;
    const routeIds = app.getRoute();
    if (!routeIds || !routeIds.length) return;

    const allCities = getAllCities();
    const allPlaces = getPlaces();
    const lookup = [...allCities, ...allPlaces];
    const route = routeIds.map((id) => lookup.find((c) => c.id === id)).filter(Boolean);
    if (!route.length) return;

    _currentRoute = route;
    renderRouteLine();

    const home = app.getHome();
    renderRouteUI(route, home?.lat ?? 53.9, home?.lon ?? 27.56, allPlaces);

    const cancelBtn = document.getElementById("cancel-route-btn");
    cancelBtn?.classList.remove("hidden");
    cancelBtn?.classList.add("flex");
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function setupAuthUI() {
    const authWrap = document.getElementById("auth-wrap");
    const authBtn = document.getElementById("auth-btn");
    const authLabel = document.getElementById("auth-label");
    const authAvatar = document.getElementById("auth-avatar");
    if (!authBtn || !authWrap) return;

    const app = window.wbApp;
    if (!app) {
      authWrap.classList.add("hidden");
      return;
    }

    let firstCall = true;
    app.onStateChange((user, data) => {
      if (user) {
        authBtn.classList.add("hidden");
        authBtn.classList.remove("flex");
        authAvatar.src = user.photoURL || "";
        authAvatar.classList.remove("hidden");
      } else {
        authBtn.classList.remove("hidden");
        authBtn.classList.add("flex");
        authAvatar.classList.add("hidden");
      }
      if (firstCall) {
        requestAnimationFrame(() => authWrap.style.opacity = "1");
        firstCall = false;
      }
      renderVisitedMarkers();
      renderHomeMarker();
      updateVisitedUI();
      restoreSavedRoute();
    });

    authBtn.addEventListener("click", () => app.signIn());
    authAvatar.addEventListener("click", () => openProfile());
  }

  function setupVisitedBtn() {
    const btn = document.getElementById("visited-btn");
    const unvisitBtn = document.getElementById("unvisit-btn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (!_currentCityId) return;
      const app = window.wbApp;
      if (!app) return;
      if (app.isVisited(_currentCityId)) {
        await app.incrementVisited(_currentCityId);
      } else {
        await app.toggleVisited(_currentCityId);
      }
      updateVisitedUI();
      renderVisitedMarkers();
    });

    unvisitBtn?.addEventListener("click", async () => {
      if (!_currentCityId) return;
      const app = window.wbApp;
      if (!app || !app.isVisited(_currentCityId)) return;
      await app.toggleVisited(_currentCityId);
      updateVisitedUI();
      renderVisitedMarkers();
    });
  }

  function setupProfile() {
    document.getElementById("profile-close")?.addEventListener("click", closeProfile);
    document.getElementById("profile-overlay")?.addEventListener("click", closeProfile);
    document.getElementById("profile-logout")?.addEventListener("click", async () => {
      const app = window.wbApp;
      if (app) await app.signOut();
      closeProfile();
    });
    document.getElementById("build-route-btn")?.addEventListener("click", buildRoute);
    document.getElementById("cancel-route-btn")?.addEventListener("click", cancelRoute);

    document.querySelectorAll("#route-type-toggle button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.getAttribute("data-route-type");
        _routeRoundTrip = type === "round";
        document.querySelectorAll("#route-type-toggle button").forEach((b) => {
          const active = b.getAttribute("data-route-type") === type;
          b.classList.toggle("bg-blue-500", active);
          b.classList.toggle("text-white", active);
          b.classList.toggle("bg-gray-100", !active);
          b.classList.toggle("dark:bg-gray-700", !active);
          b.classList.toggle("text-gray-600", !active);
          b.classList.toggle("dark:text-gray-300", !active);
        });
        if (_currentRoute) {
          const app = window.wbApp;
          const home = app?.getHome();
          renderRouteLine();
          renderRouteUI(_currentRoute, home?.lat ?? 53.9, home?.lon ?? 27.56, getPlaces());
        }
      });
    });
  }

  async function setupGeolocation() {
    const app = window.wbApp;
    if (!app || app.getHome()) return;
    const pos = await app.requestGeolocation();
    if (!pos) return;
    const { lat, lon } = pos;
    if (lat < BY_BOUNDS.minLat || lat > BY_BOUNDS.maxLat || lon < BY_BOUNDS.minLng || lon > BY_BOUNDS.maxLng) return;
    const allCities = getAllCities();
    let closest = null;
    let minDist = Infinity;
    for (const city of allCities) {
      const d = Math.hypot(city.lat - lat, city.lon - lon);
      if (d < minDist) { minDist = d; closest = city; }
    }
    const name = closest ? closest.name : "Дом";
    await app.setHome(lat, lon, name);
    renderHomeMarker();
  }

  let _lastFocused = null;
  let _zoomCtrl = null;
  let _clearMapFocus = null;
  let _zoomToPath = null;

  function openPanel() {
    _lastFocused = document.activeElement;
    const panel = document.getElementById("detail-panel");
    const overlay = document.getElementById("detail-overlay");
    panel?.setAttribute("data-visible", "true");
    panel?.setAttribute("aria-hidden", "false");
    overlay?.setAttribute("data-visible", "true");
    overlay?.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      panel?.querySelector(".detail-close")?.focus();
    });
  }

  function closePanel() {
    const panel = document.getElementById("detail-panel");
    const overlay = document.getElementById("detail-overlay");
    panel?.setAttribute("data-visible", "false");
    panel?.setAttribute("aria-hidden", "true");
    overlay?.setAttribute("data-visible", "false");
    overlay?.setAttribute("aria-hidden", "true");
    showPhotoSlider([]);
    _applyPhotoTheme("none");
    document.getElementById("city-about")?.classList.add("hidden");
    document.getElementById("visited-section")?.classList.add("hidden");
    document.getElementById("secret-fact")?.classList.add("hidden");
    _currentCityId = null;
    _currentCitySecret = null;
    if (_clearMapFocus) _clearMapFocus();
    if (_lastFocused && typeof _lastFocused.focus === "function") {
      _lastFocused.focus();
      _lastFocused = null;
    }
  }

  function trapFocus(e) {
    const panel = document.getElementById("detail-panel");
    if (!panel || panel.getAttribute("data-visible") !== "true") return;
    const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function showSkeletons() {
    showPhotoSlider([]);
    _applyPhotoTheme("none");
    document.getElementById("city-about")?.classList.add("hidden");
    const header = document.getElementById("detail-header");
    const extra = document.getElementById("detail-extra");
    const list = document.getElementById("forecast-list");
    const hourly = document.getElementById("hourly-chart");
    if (header) {
      header.classList.add("loading");
      header.querySelector(".detail-current")?.classList.add("loading");
    }
    if (extra) {
      extra.className = "grid grid-cols-2 gap-2.5 text-sm";
      extra.innerHTML = "<div class='skeleton-box h-11 rounded-xl'></div><div class='skeleton-box h-11 rounded-xl'></div><div class='skeleton-box h-11 rounded-xl'></div><div class='skeleton-box h-11 rounded-xl'></div>";
    }
    if (hourly) {
      hourly.className = "mb-6 py-4 flex items-end gap-1 min-h-[140px] skeleton-mode";
      hourly.innerHTML = Array(8).fill("<div class='skeleton-box flex-1 min-h-10 rounded-md'></div>").join("");
      hourly.classList.remove("hidden");
      hourly.removeAttribute("aria-hidden");
    }
    if (list) {
      list.className = "flex flex-col gap-2";
      list.innerHTML = Array(5)
        .fill(
          '<div class="flex items-center gap-4 p-3"><div class="skeleton-box h-10 flex-1 rounded-lg"></div><div class="skeleton-box h-10 flex-1 rounded-lg"></div><div class="skeleton-box h-10 w-12 rounded-lg shrink-0"></div></div>'
        )
        .join("");
    }
  }

  function hideSkeletons() {
    const header = document.getElementById("detail-header");
    if (header) {
      header.classList.remove("loading");
      header.querySelector(".detail-current")?.classList.remove("loading");
    }
  }

  function fillPanel(current, forecast, displayName, regionId, aboutText, cityId, secretText) {
    hideSkeletons();
    _currentCityId = cityId || null;
    _currentCitySecret = secretText || null;
    const cur = parseCurrent(current);
    const set = (id, v) => document.getElementById(id) && (document.getElementById(id).textContent = v);
    set("detail-city", displayName);

    const aboutWrap = document.getElementById("city-about");
    const aboutEl = document.getElementById("city-about-text");
    if (aboutWrap && aboutEl) {
      if (aboutText) {
        aboutEl.textContent = aboutText;
        aboutWrap.classList.remove("hidden");
      } else {
        aboutWrap.classList.add("hidden");
      }
    }
    updateVisitedUI();
    set("detail-temp", cur.temp != null ? cur.temp + "°" : "—");
    set("detail-desc", cur.desc);
    const iconWrap = document.querySelector(".detail-icon-wrap");
    if (iconWrap) {
      iconWrap.innerHTML = animatedIcon(cur.icon, 72);
    }

    const extra = document.getElementById("detail-extra");
    if (extra) {
      extra.className = "grid grid-cols-2 gap-2 sm:gap-2.5 text-sm";
      const parts = [];
      if (cur.feels != null) parts.push(`${tr("feelsLike")}: ${cur.feels}°`);
      if (cur.humidity != null) parts.push(`${tr("humidity")}: ${cur.humidity}%`);
      if (cur.pressure != null) parts.push(`${tr("pressure")}: ${Math.round(cur.pressure * 0.75)} ${tr("mmHg")}`);
      if (cur.wind != null) parts.push(`${tr("wind")}: ${cur.wind} ${tr("mps")}`);
      extra.innerHTML = parts.map((p) => `<span class="detail-extra-item p-2.5 rounded-xl bg-[#e8f8f5] dark:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors duration-300">${esc(p)}</span>`).join("");
    }

    fetchCityPhotos(regionId).then((photos) => {
      if (photos.length) {
        showPhotoSlider(photos);
        _applyPhotoTheme("photo");
      } else {
        showPhotoSlider([]);
        _applyPhotoTheme("fallback");
      }
    });

    function renderBars(data, barMaxH) {
      const realData = data.filter((h) => !h.separator);
      if (!realData.length) return "";
      const minT = Math.min(...realData.map((h) => h.temp));
      const maxT = Math.max(...realData.map((h) => h.temp));
      const range = Math.max(maxT - minT, 1);
      return `
        <div class="flex items-end gap-1">
          ${data
            .map((h) => {
              if (h.separator) return `
                <div class="flex flex-col items-center justify-end gap-1 px-0.5">
                  <span class="text-[0.55rem] text-gray-400 font-semibold whitespace-nowrap -rotate-90 origin-center mb-2">${esc(h.label)}</span>
                  <div class="w-px bg-gray-300 dark:bg-gray-600" style="height:${barMaxH}px"></div>
                </div>`;
              const h_px = 16 + ((h.temp - minT) / range) * (barMaxH - 16);
              return `
              <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span class="text-[0.65rem] font-bold text-teal leading-none">${esc(h.temp)}°</span>
                <div class="self-stretch rounded-t-md bg-linear-to-t from-blue to-teal" style="height:${Math.round(h_px)}px"></div>
                <span class="text-[0.6rem] leading-tight text-gray-400 text-center truncate max-w-full">${esc(h.time)}</span>
              </div>`;
            })
            .join("")}
        </div>
      `;
    }

    const hourly = document.getElementById("hourly-chart");
    const { items: hourlyData, isFallback } = parseHourlyToday(forecast);
    if (hourly && hourlyData.length > 0) {
      hourly.className = "flex flex-col gap-3";
      hourly.innerHTML = `
        <div class="text-sm font-semibold text-gray-600 dark:text-gray-300">${esc(isFallback ? tr("hourlyNext24") : tr("hourlyToday"))}</div>
        ${renderBars(hourlyData.slice(0, 8), 72)}
      `;
      hourly.classList.remove("hidden");
      hourly.removeAttribute("aria-hidden");
    } else if (hourly) {
      hourly.className = "hidden";
      hourly.innerHTML = "";
      hourly.setAttribute("aria-hidden", "true");
    }

    const ft = document.getElementById("detail-forecast-title");
    if (ft) ft.textContent = tr("forecastNext10");
    const { days, byDate } = parseForecast(forecast);
    const list = document.getElementById("forecast-list");
    if (list) {
      list.className = "flex flex-col gap-2";
      list.innerHTML = days
        .map(
          (d) => {
            const icon = d.icon;
            const desc = d.desc;
            const descCap = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : "";
            const hours = byDate.get(d.dateKey) ?? [];
            const graphHours = hours.filter((h) => h.dt.getHours() % 3 === 0).slice(0, 8);
            const midHour = hours.find((h) => h.dt.getHours() >= 10 && h.dt.getHours() <= 14) || hours[0];
            const details = hours.length
              ? `
              <div class="forecast-item-details col-span-full max-h-0 overflow-hidden transition-[max-height] duration-300 ease-out">
                <div class="pt-4 mt-0 border-t border-teal-500/20 grid grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-300">
                  <span class="flex items-center gap-2"><strong>${esc(tr("humidity"))}:</strong> ${esc(midHour?.humidity ?? "—")}%</span>
                  <span class="flex items-center gap-2"><strong>${esc(tr("wind"))}:</strong> ${esc((midHour?.wind ?? 0).toFixed(1))} ${esc(tr("mps"))}</span>
                  <span class="flex items-center gap-2"><strong>${esc(tr("precipitation"))}:</strong> до ${esc(Math.max(...hours.map((h) => h.pop)))}%</span>
                  <div class="col-span-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-700">
                    ${renderBars(graphHours, 60)}
                  </div>
                </div>
              </div>
            `
              : "";
            return `
              <div class="forecast-item grid grid-cols-[auto_1fr_auto] items-center gap-4 p-3 sm:p-3.5 bg-white dark:bg-white/5 rounded-xl shadow-sm transition-all cursor-pointer select-none hover:translate-x-1 hover:shadow-lg hover:shadow-teal-500/15" role="button" tabindex="0" aria-expanded="false" data-expanded="false">
                <div class="w-10 h-10" title="${esc(descCap)}">${animatedIcon(icon, 40)}</div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-gray-600 dark:text-gray-200">${esc(d.day)}</span>
                  <span class="text-sm text-gray-500 dark:text-gray-400 capitalize">${esc(descCap)}</span>
                </div>
                <span class="font-bold text-teal">${esc(d.temp)}°</span>
                ${details}
              </div>
            `;
          }
        )
        .join("");

      list.querySelectorAll(".forecast-item").forEach((el) => {
        function toggle() {
          const expanded = el.getAttribute("data-expanded") === "true";
          list.querySelectorAll(".forecast-item").forEach((i) => {
            i.setAttribute("data-expanded", "false");
            i.setAttribute("aria-expanded", "false");
          });
          if (!expanded) {
            el.setAttribute("data-expanded", "true");
            el.setAttribute("aria-expanded", "true");
          }
        }
        el.addEventListener("click", toggle);
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        });
      });
    }
  }

  function _showError(displayName, err) {
    hideSkeletons();
    showPhotoSlider([]);
    _applyPhotoTheme("fallback");
    const cityEl = document.getElementById("detail-city");
    const tempEl = document.getElementById("detail-temp");
    const descEl = document.getElementById("detail-desc");
    if (cityEl) cityEl.textContent = displayName;
    if (tempEl) tempEl.textContent = "—";
    if (descEl) descEl.textContent = tr("error") + ": " + err.message;
    document.getElementById("detail-extra").innerHTML = "";
    document.getElementById("forecast-list").innerHTML = "";
    const errHourly = document.getElementById("hourly-chart");
    if (errHourly) {
      errHourly.innerHTML = "";
      errHourly.classList.add("hidden");
      errHourly.setAttribute("aria-hidden", "true");
    }
  }

  async function onRegionClick(region) {
    const { id, apiName } = region;
    const displayName = regionName(currentCountry, id);
    openPanel();
    const cityEl = document.getElementById("detail-city");
    if (cityEl) cityEl.textContent = displayName + " — " + tr("loading");
    showSkeletons();

    try {
      const [current, forecast] = await Promise.all([
        fetchCurrent(apiName),
        fetchForecast(region),
      ]);
      fillPanel(current, forecast, displayName, region.id, null, region.id, null);
    } catch (err) {
      _showError(displayName, err);
    }
  }

  async function onCityClick(city, regionId) {
    const displayName = city.name;
    openPanel();
    const cityEl = document.getElementById("detail-city");
    if (cityEl) cityEl.textContent = displayName + " — " + tr("loading");
    showSkeletons();

    try {
      const [current, forecast] = await Promise.all([
        fetchCurrentCoords(city.lat, city.lon),
        fetchForecast(city),
      ]);
      fillPanel(current, forecast, displayName, regionId, city.about, city.id, city.secret);
    } catch (err) {
      _showError(displayName, err);
    }
  }

  function getRegionByShapeName(shapeName) {
    if (!shapeName) return null;
    const s = String(shapeName).toLowerCase();
    return countries[currentCountry]?.regions?.find((r) => {
      if (r.shapeName?.toLowerCase() === s) return true;
      return Array.isArray(r.altNames) && r.altNames.some((a) => a?.toLowerCase() === s);
    }) ?? null;
  }

  function getCityByDistrict(district, regionName1) {
    if (!district) return null;
    const d = String(district).toLowerCase();
    const r1 = regionName1 ? String(regionName1).toLowerCase() : null;
    const regions = countries[currentCountry]?.regions || [];
    for (const region of regions) {
      if (r1 && region.shapeName?.toLowerCase() !== r1 &&
          !(region.altNames || []).some((a) => a?.toLowerCase() === r1)) continue;
      for (const city of (region.cities || [])) {
        if (city.district?.toLowerCase() === d) return { city, region };
      }
    }
    return null;
  }

  function setupZoomPan(wrap, transformEl) {
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let isDown = false;
    let startX, startY, startTx, startTy;
    let hasMoved = false;

    let touchMode = null;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let lastTouchCenterX = 0;
    let lastTouchCenterY = 0;
    let touchStartTime = 0;
    let lastTapTime = 0;

    const PAN_THRESHOLD = 6;

    function tdist(a, b) {
      return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    }
    function tcenter(touches) {
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      };
    }

    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const isDark = document.documentElement.classList.toggle("dark");
        localStorage.setItem("theme", isDark ? "dark" : "light");
      });
    }

    const resetBtn = document.getElementById("zoom-reset");
    const hintEl = document.getElementById("map-hint");
    let hintHidden = false;

    const focusTransform = document.getElementById("focus-transform-wrap");

    function updateTransform() {
      const t = `translate(${tx}px, ${ty}px) scale(${scale})`;
      transformEl.style.transform = t;
      if (focusTransform) focusTransform.style.transform = t;
      const isZoomed = Math.abs(scale - 1) > 0.05 || Math.abs(tx) > 2 || Math.abs(ty) > 2;
      if (resetBtn) resetBtn.classList.toggle("hidden", !isZoomed);
      if (resetBtn) resetBtn.classList.toggle("flex", isZoomed);
    }

    function resetView() {
      scale = 1; tx = 0; ty = 0;
      updateTransform();
    }

    if (resetBtn) resetBtn.addEventListener("click", resetView);

    function hideHint() {
      if (hintHidden || !hintEl) return;
      hintHidden = true;
      hintEl.style.opacity = "0";
      setTimeout(() => hintEl.remove(), 500);
    }
    setTimeout(hideHint, 5000);

    wrap.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      const newScale = Math.min(6, Math.max(0.5, scale * factor));
      const ratio = newScale / scale;
      tx = mx - ratio * (mx - tx);
      ty = my - ratio * (my - ty);
      scale = newScale;
      updateTransform();
    }, { passive: false });

    wrap.addEventListener("mousedown", (e) => {
      hideHint();
      isDown = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      startTx = tx;
      startTy = ty;
    });

    wrap.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!hasMoved && Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      hasMoved = true;
      e.preventDefault();
      tx = startTx + dx;
      ty = startTy + dy;
      updateTransform();
    });

    wrap.addEventListener("mouseup", () => (isDown = false));
    wrap.addEventListener("mouseleave", () => (isDown = false));

    wrap.addEventListener("touchstart", (e) => {
      hideHint();
      if (e.touches.length === 2) {
        touchMode = "pinch";
        pinchStartDist = tdist(e.touches[0], e.touches[1]);
        pinchStartScale = scale;
        const c = tcenter(e.touches);
        lastTouchCenterX = c.x;
        lastTouchCenterY = c.y;
      } else if (e.touches.length === 1) {
        touchMode = "pending";
        hasMoved = false;
        touchStartTime = Date.now();
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTx = tx;
        startTy = ty;
      }
    }, { passive: true });

    wrap.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && touchMode === "pinch") {
        e.preventDefault();
        const d = tdist(e.touches[0], e.touches[1]);
        const newScale = Math.min(6, Math.max(0.5, pinchStartScale * (d / pinchStartDist)));
        const c = tcenter(e.touches);
        tx += c.x - lastTouchCenterX;
        ty += c.y - lastTouchCenterY;
        lastTouchCenterX = c.x;
        lastTouchCenterY = c.y;
        scale = newScale;
        updateTransform();
      } else if (e.touches.length === 1 && (touchMode === "pending" || touchMode === "pan")) {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (touchMode === "pending" && Math.hypot(dx, dy) >= PAN_THRESHOLD) {
          touchMode = "pan";
        }
        if (touchMode === "pan") {
          e.preventDefault();
          tx = startTx + dx;
          ty = startTy + dy;
          updateTransform();
        }
      }
    }, { passive: false });

    wrap.addEventListener("touchend", (e) => {
      if (e.touches.length === 0 && touchMode === "pending") {
        const now = Date.now();
        if (now - lastTapTime < 300) {
          scale = 1; tx = 0; ty = 0;
          updateTransform();
          lastTapTime = 0;
        } else {
          lastTapTime = now;
        }
      }
      if (e.touches.length < 2) touchMode = null;
      if (e.touches.length < 1) { touchMode = null; isDown = false; }
    }, { passive: true });

    wrap.addEventListener("touchcancel", () => {
      touchMode = null;
      isDown = false;
    }, { passive: true });

    let savedState = null;
    let animId = 0;

    function animateTo(targetTx, targetTy, targetScale, duration = 500) {
      const id = ++animId;
      const fromTx = tx, fromTy = ty, fromScale = scale;
      const start = performance.now();
      function step(now) {
        if (id !== animId) return;
        const t = Math.min(1, (now - start) / duration);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        tx = fromTx + (targetTx - fromTx) * ease;
        ty = fromTy + (targetTy - fromTy) * ease;
        scale = fromScale + (targetScale - fromScale) * ease;
        updateTransform();
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function focusOnPoint(elX, elY, targetScale) {
      savedState = { tx, ty, scale };
      const rect = wrap.getBoundingClientRect();
      const panelW = Math.min(420, rect.width * 0.42);
      const availW = rect.width - panelW;
      const targetX = availW / 2;
      const targetY = rect.height / 2;
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;
      const newTx = targetX - halfW - (elX - halfW) * targetScale;
      const newTy = targetY - halfH - (elY - halfH) * targetScale;
      animateTo(newTx, newTy, targetScale, 600);
    }

    function unfocus() {
      if (!savedState) return;
      animateTo(savedState.tx, savedState.ty, savedState.scale, 500);
      savedState = null;
    }

    return {
      wasPan: () => hasMoved,
      focusOnPoint, unfocus, resetView,
      _scale: () => scale, _tx: () => tx, _ty: () => ty,
    };
  }

  function init() {
    document.documentElement.lang = "ru";
    document.querySelector(".detail-close")?.setAttribute("aria-label", tr("close"));
    const ftInit = document.getElementById("detail-forecast-title");
    if (ftInit) ftInit.textContent = tr("forecastNext10");

    const country = countries[currentCountry];
    if (!country) return;

    const loadingEl = document.getElementById("map-loading");
    const regionsEl = document.getElementById("regions");
    const citiesLayer = document.getElementById("cities-layer");
    const wrap = document.getElementById("svg-wrap");
    const transformWrap = document.getElementById("svg-transform-wrap");

    loadingEl.textContent = tr("mapLoading");
    loadingEl.setAttribute("data-visible", "true");

    const geoPromises = [fetch(country.geojson).then((r) => r.json())];
    if (country.geojson2) {
      geoPromises.push(fetch(country.geojson2).then((r) => r.json()));
    }

    Promise.all(geoPromises)
      .then(([geojson1, geojson2]) => {
        loadingEl.setAttribute("data-visible", "false");

        let hoveredPath = null;
        const tip = document.getElementById("region-tooltip");

        geojson1.features?.forEach((f) => {
          const name = f.properties?.NAME_1 ?? f.properties?.shapeName;
          const region = getRegionByShapeName(name);
          if (!region) return;

          const path = geoToPath(f.geometry);
          if (!path) return;

          const rName = regionName(currentCountry, region.id);
          const displayLabel = rName + " обл.";

          const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
          pathEl.setAttribute("d", path);
          pathEl.setAttribute("class", "region");
          pathEl.setAttribute("data-region-id", region.id);
          pathEl.setAttribute("data-region-name", displayLabel);
          regionsEl.appendChild(pathEl);
        });

        if (geojson2 && citiesLayer) {
          geojson2.features?.forEach((f) => {
            const districtName = f.properties?.NAME_2;
            const regionName1 = f.properties?.NAME_1;
            const match = getCityByDistrict(districtName, regionName1);
            if (!match) return;

            const path = geoToPath(f.geometry);
            if (!path) return;

            const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathEl.setAttribute("d", path);
            pathEl.setAttribute("class", "city-district");
            pathEl.setAttribute("data-city-id", match.city.id);
            pathEl.setAttribute("data-city-name", match.city.name);
            pathEl.setAttribute("data-region-id", match.region.id);
            citiesLayer.appendChild(pathEl);
          });

          requestAnimationFrame(() => {
            citiesLayer.querySelectorAll("path.city-district").forEach((pathEl) => {
              const cityName = pathEl.getAttribute("data-city-name");
              if (!cityName) return;
              const bb = pathEl.getBBox();
              if (!bb.width || !bb.height) return;
              const cx = bb.x + bb.width / 2;
              const cy = bb.y + bb.height / 2;
              const maxW = bb.width * 0.88;
              const baseFontSize = Math.min(bb.height * 0.28, 5.5);
              const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
              label.setAttribute("x", cx.toFixed(1));
              label.setAttribute("y", cy.toFixed(1));
              label.setAttribute("class", "city-label");
              label.setAttribute("data-city-id", pathEl.getAttribute("data-city-id"));
              label.textContent = cityName;
              citiesLayer.appendChild(label);
              const actualW = label.getComputedTextLength?.() || cityName.length * baseFontSize * 0.55;
              const fontSize = actualW > maxW ? baseFontSize * (maxW / actualW) : baseFontSize;
              label.style.fontSize = Math.max(2.5, fontSize).toFixed(2) + "px";
            });
          });
        }

        renderPOIMarkers();

        function findTarget(x, y) {
          const els = document.elementsFromPoint(x, y);
          for (const el of els) {
            if (el.tagName?.toLowerCase() === "path" && el.classList.contains("city-district")) return el;
          }
          for (const el of els) {
            if (el.tagName?.toLowerCase() === "path" && el.classList.contains("region")) return el;
          }
          return null;
        }

        function updateHover(x, y) {
          const path = findTarget(x, y);
          if (path) {
            const displayName = path.getAttribute("data-city-name") || path.getAttribute("data-region-name");
            if (path !== hoveredPath) {
              if (hoveredPath) hoveredPath.classList.remove("hover");
              hoveredPath = path;
              path.classList.add("hover");
              if (tip) {
                tip.textContent = displayName;
                tip.style.left = (x + 14) + "px";
                tip.style.top = (y + 14) + "px";
                tip.setAttribute("data-visible", "true");
                tip.setAttribute("aria-hidden", "false");
              }
            } else if (tip) {
              tip.style.left = (x + 14) + "px";
              tip.style.top = (y + 14) + "px";
            }
          } else if (hoveredPath) {
            hoveredPath.classList.remove("hover");
            hoveredPath = null;
            if (tip) {
              tip.setAttribute("data-visible", "false");
              tip.setAttribute("aria-hidden", "true");
            }
          }
        }

        let _hoverRaf = 0;
        wrap.addEventListener("mousemove", (e) => {
          if (_hoverRaf) return;
          _hoverRaf = requestAnimationFrame(() => { _hoverRaf = 0; updateHover(e.clientX, e.clientY); });
        });
        wrap.addEventListener("touchstart", (e) => {
          if (e.touches.length === 1) updateHover(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        wrap.addEventListener("touchmove", (e) => {
          if (e.touches.length === 1) updateHover(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        wrap.addEventListener("touchend", () => {
          if (hoveredPath) { hoveredPath.classList.remove("hover"); hoveredPath = null; }
          if (tip) { tip.setAttribute("data-visible", "false"); tip.setAttribute("aria-hidden", "true"); }
        }, { passive: true });

        wrap.addEventListener("mouseleave", () => {
          if (hoveredPath) { hoveredPath.classList.remove("hover"); hoveredPath = null; }
          if (tip) { tip.setAttribute("data-visible", "false"); tip.setAttribute("aria-hidden", "true"); }
        });

        const zoomCtrl = setupZoomPan(wrap, transformWrap);
        _zoomCtrl = zoomCtrl;

        function svgToEl(svgX, svgY) {
          const svg = document.getElementById("belarus-svg");
          if (!svg) return [0, 0, 1];
          const vb = svg.viewBox.baseVal;
          const wrapRect = wrap.getBoundingClientRect();
          const wrapW = wrapRect.width;
          const wrapH = wrapRect.height;
          const svgScale = Math.min(wrapW / vb.width, wrapH / vb.height);
          const renderedW = vb.width * svgScale;
          const renderedH = vb.height * svgScale;
          const offsetX = (wrapW - renderedW) / 2;
          const offsetY = (wrapH - renderedH) / 2;
          const elX = offsetX + svgX * svgScale;
          const elY = offsetY + svgY * svgScale;
          return [elX, elY, svgScale];
        }

        const focusOverlay = document.getElementById("map-focus-overlay");
        const focusSvgWrap = document.getElementById("focus-svg-wrap");
        const focusSvg = document.getElementById("focus-svg");

        function buildFocusContent(targetSvg, targetPath, gradIdSuffix) {
          const bb = targetPath.getBBox();
          const ns = "http://www.w3.org/2000/svg";
          const gradId = "focus-grad-" + gradIdSuffix;
          const defs = document.createElementNS(ns, "defs");
          const grad = document.createElementNS(ns, "linearGradient");
          grad.setAttribute("id", gradId);
          grad.setAttribute("x1", "0%"); grad.setAttribute("y1", "0%");
          grad.setAttribute("x2", "100%"); grad.setAttribute("y2", "100%");
          for (const [off, color, op] of [["0%","#0d9488","1"],["50%","#14b8a6","0.95"],["100%","#06b6d4","0.9"]]) {
            const s = document.createElementNS(ns, "stop");
            s.setAttribute("offset", off);
            s.setAttribute("stop-color", color);
            s.setAttribute("stop-opacity", op);
            grad.appendChild(s);
          }
          defs.appendChild(grad);
          targetSvg.appendChild(defs);

          const isRegion = targetPath.classList.contains("region");
          const clone = targetPath.cloneNode(true);
          clone.removeAttribute("class");
          clone.setAttribute("fill", `url(#${gradId})`);
          clone.setAttribute("stroke", "#5eead4");
          clone.setAttribute("stroke-width", "0.6");
          targetSvg.appendChild(clone);

          if (isRegion) {
            const regionId = targetPath.getAttribute("data-region-id");
            const innerCities = document.querySelectorAll(`#cities-layer path.city-district[data-region-id="${regionId}"]`);
            for (const cp of innerCities) {
              const hole = cp.cloneNode(true);
              hole.removeAttribute("class");
              hole.setAttribute("fill", `url(#${gradId})`);
              hole.setAttribute("stroke", "none");
              targetSvg.appendChild(hole);
            }
          }

          const cityName = isRegion
            ? (targetPath.getAttribute("data-region-name") || "")
            : (targetPath.getAttribute("data-city-name") || "");
          if (cityName) {
            const cx = bb.x + bb.width / 2;
            const cy = bb.y + bb.height / 2;
            const fontSize = Math.min(bb.height * 0.22, bb.width * 0.12, 5.5);
            const lbl = document.createElementNS(ns, "text");
            lbl.setAttribute("x", cx.toFixed(1));
            lbl.setAttribute("y", cy.toFixed(1));
            lbl.setAttribute("class", "city-label");
            lbl.setAttribute("fill", "#fff");
            lbl.setAttribute("stroke", "rgba(0,0,0,0.55)");
            lbl.setAttribute("stroke-width", "1");
            lbl.setAttribute("paint-order", "stroke fill");
            lbl.setAttribute("stroke-linejoin", "round");
            lbl.setAttribute("text-anchor", "middle");
            lbl.setAttribute("dominant-baseline", "central");
            lbl.setAttribute("font-family", "Manrope, system-ui, sans-serif");
            lbl.setAttribute("font-weight", "700");
            lbl.setAttribute("letter-spacing", "0.02em");
            lbl.style.fontSize = Math.max(2.5, fontSize).toFixed(2) + "px";
            lbl.textContent = cityName;
            targetSvg.appendChild(lbl);
          }
          return bb;
        }

        function fillMiniMap(targetPath) {
          const miniWrap = document.getElementById("mini-map-wrap");
          const miniSvg = document.getElementById("mini-map-svg");
          if (!miniWrap || !miniSvg) return;
          miniSvg.innerHTML = "";
          const bb = targetPath.getBBox();
          const pad = Math.max(bb.width, bb.height) * 0.12;
          miniSvg.setAttribute("viewBox",
            `${(bb.x - pad).toFixed(1)} ${(bb.y - pad).toFixed(1)} ${(bb.width + pad * 2).toFixed(1)} ${(bb.height + pad * 2).toFixed(1)}`);
          const clone = targetPath.cloneNode(true);
          clone.removeAttribute("class");
          clone.setAttribute("fill", "#14b8a6");
          clone.setAttribute("stroke", "#5eead4");
          clone.setAttribute("stroke-width", "0.8");
          miniSvg.appendChild(clone);
          miniWrap.classList.remove("hidden");
        }

        function hideMiniMap() {
          const miniWrap = document.getElementById("mini-map-wrap");
          const miniSvg = document.getElementById("mini-map-svg");
          if (miniWrap) miniWrap.classList.add("hidden");
          if (miniSvg) miniSvg.innerHTML = "";
        }

        function zoomToPath(targetPath) {
          const svg = document.getElementById("belarus-svg");
          if (!svg || !targetPath) return;
          const bb = targetPath.getBBox();
          const svgCx = bb.x + bb.width / 2;
          const svgCy = bb.y + bb.height / 2;
          const [elX, elY, svgScale] = svgToEl(svgCx, svgCy);

          const wrapRect = wrap.getBoundingClientRect();
          const panelW = Math.min(420, wrapRect.width * 0.42);
          const availW = wrapRect.width - panelW;
          const availH = wrapRect.height;
          const cityW = bb.width * svgScale;
          const cityH = bb.height * svgScale;
          const isReg = targetPath.classList.contains("region");
          const pad = isReg ? 1.15 : 1.4;
          const fitZoom = Math.min(availW / (cityW * pad), availH / (cityH * pad));
          const targetZoom = Math.min(8, Math.max(isReg ? 1.5 : 2.5, fitZoom));
          zoomCtrl.focusOnPoint(elX, elY, targetZoom);

          if (focusOverlay) focusOverlay.style.opacity = "1";

          if (focusSvg && focusSvgWrap) {
            focusSvg.innerHTML = "";
            buildFocusContent(focusSvg, targetPath, "main");
            focusSvgWrap.style.opacity = "1";
          }

          fillMiniMap(targetPath);
        }

        function clearMapFocus() {
          if (focusOverlay) focusOverlay.style.opacity = "0";
          if (focusSvg && focusSvgWrap) {
            focusSvgWrap.style.opacity = "0";
            setTimeout(() => { focusSvg.innerHTML = ""; }, 400);
          }
          hideMiniMap();
          zoomCtrl.unfocus();
        }
        _clearMapFocus = clearMapFocus;
        _zoomToPath = zoomToPath;

        wrap.addEventListener("click", (e) => {
          if (zoomCtrl.wasPan()) return;
          const path = findTarget(e.clientX, e.clientY);
          if (!path) return;

          if (path.classList.contains("city-district")) {
            const cityId = path.getAttribute("data-city-id");
            const regionId = path.getAttribute("data-region-id");
            const region = country.regions.find((r) => r.id === regionId);
            const city = region?.cities?.find((c) => c.id === cityId);
            if (city) {
              zoomToPath(path);
              onCityClick(city, regionId);
            }
          } else if (path.classList.contains("region")) {
            const regionId = path.getAttribute("data-region-id");
            const region = country.regions.find((r) => r.id === regionId);
            if (region) {
              zoomToPath(path);
              onRegionClick(region);
            }
          }
        });
      })
      .catch((err) => {
        loadingEl.textContent = tr("error") + ": " + err.message;
      });

    document.querySelector(".detail-close")?.addEventListener("click", closePanel);
    document.getElementById("detail-overlay")?.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
      if (e.key === "Tab") trapFocus(e);
    });

    setupAuthUI();
    setupVisitedBtn();
    setupProfile();
    setTimeout(setupGeolocation, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
