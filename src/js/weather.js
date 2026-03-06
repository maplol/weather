(function () {
  const t = {
    mapLoading: "Загрузка…",
    forecast: "Прогноз",
    feelsLike: "Ощущается",
    humidity: "Влажность",
    pressure: "Давление",
    wind: "Ветер",
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

  const BY_BOUNDS = { minLng: 23.1, maxLng: 32.8, minLat: 51.25, maxLat: 56.2 };
  const SVG_WIDTH = 400;
  const SVG_HEIGHT = 320;
  const PADDING = 8;

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

  function iconUrl(code) {
    return code ? `${OWM_ICON}/${code}@2x.png` : "";
  }

  function locale() {
    return "ru-RU";
  }

  function apiLang() {
    return "ru";
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
      temp: m?.temp != null ? Math.round(m.temp - 273.15) : null,
      feels: m?.feels_like != null ? Math.round(m.feels_like - 273.15) : null,
      desc: w?.description ?? "—",
      icon: w?.icon ?? "",
      humidity: m?.humidity ?? null,
      pressure: m?.pressure ?? null,
      wind: data.wind?.speed ?? null,
    };
  }

  function parseForecast(data) {
    const list = data?.list ?? [];
    const byDay = new Map();
    for (const item of list) {
      const dt = new Date(item.dt * 1000);
      const key = dt.toDateString();
      const hour = dt.getHours();
      if (!byDay.has(key) || (hour >= 10 && hour <= 14)) {
        byDay.set(key, {
          day: dt.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }),
          temp: Math.round(item.main.temp - 273.15),
          icon: item.weather?.[0]?.icon ?? "01d",
          desc: item.weather?.[0]?.description ?? "",
        });
      }
    }
    return Array.from(byDay.values()).slice(0, 5);
  }

  async function fetchCurrent(apiName) {
    const lang = `&lang=${apiLang()}`;
    let res;
    if (window.__OW_API_KEY) {
      res = await fetch(`${OWM_URL}/weather?q=${encodeURIComponent(apiName)}&APPID=${window.__OW_API_KEY}${lang}`);
    } else {
      res = await fetch(`${API_URL}?city=${encodeURIComponent(apiName)}${lang}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error(tr("serviceUnavailable"));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  }

  async function fetchForecast(apiName) {
    const lang = `&lang=${apiLang()}`;
    let res;
    if (window.__OW_API_KEY) {
      res = await fetch(`${OWM_URL}/forecast?q=${encodeURIComponent(apiName)}&APPID=${window.__OW_API_KEY}&cnt=40${lang}`);
    } else {
      res = await fetch(`${API_URL}?city=${encodeURIComponent(apiName)}&type=forecast${lang}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error(tr("serviceUnavailable"));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  }

  function openPanel() {
    document.getElementById("detail-panel")?.classList.add("visible");
    document.getElementById("detail-overlay")?.classList.add("visible");
  }

  function closePanel() {
    document.getElementById("detail-panel")?.classList.remove("visible");
    document.getElementById("detail-overlay")?.classList.remove("visible");
  }

  function fillPanel(current, forecast, displayName) {
    const cur = parseCurrent(current);
    document.querySelector(".detail-city").textContent = displayName;
    document.querySelector(".detail-temp").textContent = cur.temp != null ? cur.temp + "°" : "—";
    document.querySelector(".detail-desc").textContent = cur.desc;
    const iconEl = document.querySelector(".detail-icon");
    iconEl.src = iconUrl(cur.icon);
    iconEl.alt = cur.desc;

    const extra = document.querySelector(".detail-extra");
    const parts = [];
    if (cur.feels != null) parts.push(`${tr("feelsLike")}: ${cur.feels}°`);
    if (cur.humidity != null) parts.push(`${tr("humidity")}: ${cur.humidity}%`);
    if (cur.pressure != null) parts.push(`${tr("pressure")}: ${Math.round(cur.pressure * 0.75)} ${tr("mmHg")}`);
    if (cur.wind != null) parts.push(`${tr("wind")}: ${cur.wind} ${tr("mps")}`);
    extra.innerHTML = parts.map((p) => `<span>${p}</span>`).join("");

    document.querySelector(".detail-forecast h3").textContent = tr("forecast");
    const list = document.querySelector(".forecast-list");
    list.innerHTML = parseForecast(forecast)
      .map(
        (d) => `
      <div class="forecast-item">
        <img src="${iconUrl(d.icon)}" alt="${d.desc}" />
        <span class="day">${d.day}</span>
        <span class="temp">${d.temp}°</span>
      </div>
    `
      )
      .join("");
  }

  async function onRegionClick(region) {
    const { id, apiName } = region;
    const displayName = regionName(currentCountry, id);
    openPanel();
    document.querySelector(".detail-city").textContent = displayName + " — " + tr("loading");
    document.querySelector(".detail-extra").innerHTML = "";
    document.querySelector(".forecast-list").innerHTML = "";

    try {
      const [current, forecast] = await Promise.all([
        fetchCurrent(apiName),
        fetchForecast(apiName),
      ]);
      fillPanel(current, forecast, displayName);
    } catch (err) {
      document.querySelector(".detail-desc").textContent = tr("error") + ": " + err.message;
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

  function setupZoomPan(wrap, transformEl) {
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let isDown = false;
    let startX, startY, startTx, startTy;

    function updateTransform() {
      transformEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    wrap.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      scale = Math.min(4, Math.max(0.5, scale + delta));
      updateTransform();
    });

    wrap.addEventListener("mousedown", (e) => {
      if (e.target.closest("path.region")) return;
      isDown = true;
      startX = e.clientX;
      startY = e.clientY;
      startTx = tx;
      startTy = ty;
    });

    wrap.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      tx = startTx + e.clientX - startX;
      ty = startTy + e.clientY - startY;
      updateTransform();
    });

    wrap.addEventListener("mouseup", () => (isDown = false));
    wrap.addEventListener("mouseleave", () => (isDown = false));
  }

  function init() {
    document.documentElement.lang = "ru";
    document.querySelector(".detail-close")?.setAttribute("aria-label", tr("close"));
    document.querySelector(".detail-forecast h3").textContent = tr("forecast");

    const country = countries[currentCountry];
    if (!country) return;

    const loadingEl = document.getElementById("map-loading");
    const regionsEl = document.getElementById("regions");
    const wrap = document.getElementById("svg-wrap");
    const transformWrap = document.getElementById("svg-transform-wrap");

    loadingEl.textContent = tr("mapLoading");
    loadingEl.classList.add("visible");

    fetch(country.geojson)
      .then((r) => r.json())
      .then((geojson) => {
        loadingEl.classList.remove("visible");

        let hoveredPath = null;
        const tip = document.getElementById("region-tooltip");

        geojson.features?.forEach((f) => {
          const name = f.properties?.NAME_1 ?? f.properties?.shapeName;
          const region = getRegionByShapeName(name);
          if (!region) return;

          const path = geoToPath(f.geometry);
          if (!path) return;

          const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
          pathEl.setAttribute("d", path);
          pathEl.setAttribute("class", "region");
          pathEl.setAttribute("data-region-id", region.id);
          pathEl.setAttribute("data-region-name", regionName(currentCountry, region.id));

          regionsEl.appendChild(pathEl);
        });

        function updateHover(x, y) {
          const el = document.elementFromPoint(x, y);
          const path = (el?.classList?.contains?.("region") && el?.tagName?.toLowerCase() === "path") ? el : el?.closest?.("path.region");
          if (path && path.getAttribute("data-region-id")) {
            const regionId = path.getAttribute("data-region-id");
            const displayName = path.getAttribute("data-region-name");
            const region = country.regions.find((r) => r.id === regionId);
            if (region && path !== hoveredPath) {
              if (hoveredPath) hoveredPath.classList.remove("hover");
              hoveredPath = path;
              path.classList.add("hover");
              regionsEl.appendChild(path);
              if (tip) {
                tip.textContent = displayName;
                tip.style.left = (x + 14) + "px";
                tip.style.top = (y + 14) + "px";
                tip.classList.add("visible");
                tip.setAttribute("aria-hidden", "false");
              }
            } else if (path === hoveredPath && tip) {
              tip.style.left = (x + 14) + "px";
              tip.style.top = (y + 14) + "px";
            }
          } else if (hoveredPath) {
            hoveredPath.classList.remove("hover");
            hoveredPath = null;
            if (tip) {
              tip.classList.remove("visible");
              tip.setAttribute("aria-hidden", "true");
            }
          }
        }

        wrap.addEventListener("mousemove", (e) => {
          updateHover(e.clientX, e.clientY);
        });

        wrap.addEventListener("mouseleave", () => {
          if (hoveredPath) {
            hoveredPath.classList.remove("hover");
            hoveredPath = null;
          }
          if (tip) {
            tip.classList.remove("visible");
            tip.setAttribute("aria-hidden", "true");
          }
        });

        wrap.addEventListener("click", (e) => {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const path = (el?.classList?.contains?.("region") && el?.tagName?.toLowerCase() === "path") ? el : el?.closest?.("path.region");
          if (path?.getAttribute?.("data-region-id")) {
            const regionId = path.getAttribute("data-region-id");
            const region = country.regions.find((r) => r.id === regionId);
            if (region) onRegionClick(region);
          }
        });

        setupZoomPan(wrap, transformWrap);
      })
      .catch((err) => {
        loadingEl.textContent = tr("error") + ": " + err.message;
      });

    document.querySelector(".detail-close")?.addEventListener("click", closePanel);
    document.getElementById("detail-overlay")?.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
