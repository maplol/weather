(function () {
  const t = {
    mapLoading: "Загрузка…",
    forecast: "Прогноз",
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

  function parseHourlyToday(forecastData) {
    const list = forecastData?.list ?? [];
    const today = new Date().toDateString();
    let items = list.filter((item) => new Date(item.dt * 1000).toDateString() === today);
    const useFallback = items.length === 0;
    if (useFallback) items = list.slice(0, 8);
    return {
      isFallback: useFallback,
      items: items.map((item) => {
      const dt = new Date(item.dt * 1000);
      return {
        time: dt.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }),
        temp: Math.round(item.main.temp - 273.15),
        icon: item.weather?.[0]?.icon ?? "01d",
        pop: item.pop ?? 0,
      };
    }),
    };
  }

  function parseForecast(data) {
    const list = data?.list ?? [];
    const byDay = new Map();
    const byDate = new Map();
    for (const item of list) {
      const dt = new Date(item.dt * 1000);
      const key = dt.toDateString();
      const hour = dt.getHours();
      if (!byDay.has(key) || (hour >= 10 && hour <= 14)) {
        byDay.set(key, {
          dateKey: key,
          day: dt.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }),
          temp: Math.round(item.main.temp - 273.15),
          icon: item.weather?.[0]?.icon ?? "01d",
          desc: item.weather?.[0]?.description ?? "",
        });
      }
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push({
        time: dt.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }),
        temp: Math.round(item.main.temp - 273.15),
        icon: item.weather?.[0]?.icon ?? "01d",
        pop: Math.round((item.pop ?? 0) * 100),
        wind: item.wind?.speed ?? 0,
        humidity: item.main?.humidity ?? 0,
      });
    }
    return { days: Array.from(byDay.values()).slice(0, 5), byDate };
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
    const panel = document.getElementById("detail-panel");
    const overlay = document.getElementById("detail-overlay");
    panel?.setAttribute("data-visible", "true");
    panel?.setAttribute("aria-hidden", "false");
    overlay?.setAttribute("data-visible", "true");
    overlay?.setAttribute("aria-hidden", "false");
  }

  function closePanel() {
    const panel = document.getElementById("detail-panel");
    const overlay = document.getElementById("detail-overlay");
    panel?.setAttribute("data-visible", "false");
    panel?.setAttribute("aria-hidden", "true");
    overlay?.setAttribute("data-visible", "false");
    overlay?.setAttribute("aria-hidden", "true");
  }

  function showSkeletons() {
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

  function fillPanel(current, forecast, displayName) {
    hideSkeletons();
    const cur = parseCurrent(current);
    const set = (id, v) => document.getElementById(id) && (document.getElementById(id).textContent = v);
    set("detail-city", displayName);
    set("detail-temp", cur.temp != null ? cur.temp + "°" : "—");
    set("detail-desc", cur.desc);
    const iconEl = document.getElementById("detail-icon");
    if (iconEl) {
      iconEl.src = iconUrl(cur.icon);
      iconEl.alt = cur.desc;
    }

    const extra = document.getElementById("detail-extra");
    if (extra) {
      extra.className = "grid grid-cols-2 gap-2 sm:gap-2.5 text-sm";
      const parts = [];
      if (cur.feels != null) parts.push(`${tr("feelsLike")}: ${cur.feels}°`);
      if (cur.humidity != null) parts.push(`${tr("humidity")}: ${cur.humidity}%`);
      if (cur.pressure != null) parts.push(`${tr("pressure")}: ${Math.round(cur.pressure * 0.75)} ${tr("mmHg")}`);
      if (cur.wind != null) parts.push(`${tr("wind")}: ${cur.wind} ${tr("mps")}`);
      extra.innerHTML = parts.map((p) => `<span class="p-2.5 rounded-xl border border-teal-500/15 bg-teal-500/10">${p}</span>`).join("");
    }

    const hourly = document.getElementById("hourly-chart");
    const { items: hourlyData, isFallback } = parseHourlyToday(forecast);
    if (hourly && hourlyData.length > 0) {
      const minT = Math.min(...hourlyData.map((h) => h.temp));
      const maxT = Math.max(...hourlyData.map((h) => h.temp));
      const range = Math.max(maxT - minT, 1);
      hourly.className = "mb-6 py-4";
      hourly.innerHTML = `
        <div class="text-sm font-semibold text-gray-600 mb-3">${isFallback ? tr("hourlyNext24") : tr("hourlyToday")}</div>
        <div class="flex items-end gap-1 h-[100px]">
          ${hourlyData
            .map(
              (h) => `
            <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span class="text-xs font-bold text-[#00b894]">${h.temp}°</span>
              <div class="w-full max-w-6 rounded-t-md bg-gradient-to-t from-[#0984e3] to-[#00b894] transition-all duration-300" style="height: ${20 + ((h.temp - minT) / range) * 70}px"></div>
              <span class="text-[0.65rem] text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">${h.time}</span>
            </div>
          `
            )
            .join("")}
        </div>
      `;
      hourly.classList.remove("hidden");
      hourly.removeAttribute("aria-hidden");
    } else if (hourly) {
      hourly.className = "mb-6 py-4 hidden";
      hourly.innerHTML = "";
      hourly.setAttribute("aria-hidden", "true");
    }

    const ft = document.getElementById("detail-forecast-title");
    if (ft) ft.textContent = tr("forecast");
    const { days, byDate } = parseForecast(forecast);
    const todayKey = new Date().toDateString();
    const list = document.getElementById("forecast-list");
    if (list) {
      list.className = "flex flex-col gap-2";
      list.innerHTML = days
        .map(
          (d) => {
            const isToday = d.dateKey === todayKey;
            const icon = isToday ? cur.icon : d.icon;
            const desc = isToday ? cur.desc : d.desc;
            const descCap = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : "";
            const hours = byDate.get(d.dateKey) ?? [];
            const midHour = hours.find((h) => {
              const [hh] = h.time.split(":");
              return parseInt(hh, 10) >= 10 && parseInt(hh, 10) <= 14;
            }) || hours[0];
            const details = hours.length
              ? `
              <div class="forecast-item-details col-span-full max-h-0 overflow-hidden transition-[max-height] duration-300 ease-out">
                <div class="pt-4 mt-0 border-t border-teal-500/20 grid grid-cols-2 gap-3 text-sm">
                  <span class="flex items-center gap-2"><strong>${tr("humidity")}:</strong> ${midHour?.humidity ?? "—"}%</span>
                  <span class="flex items-center gap-2"><strong>${tr("wind")}:</strong> ${(midHour?.wind ?? 0).toFixed(1)} ${tr("mps")}</span>
                  <span class="flex items-center gap-2"><strong>${tr("precipitation")}:</strong> до ${Math.max(...hours.map((h) => h.pop))}%</span>
                  <div class="col-span-2 flex flex-wrap gap-2 pt-2 border-t border-dashed border-gray-200 text-xs text-gray-500">
                    ${hours.map((h) => `<span class="px-2 py-1 bg-teal-500/10 rounded-lg">${h.time} ${h.temp}°</span>`).join("")}
                  </div>
                </div>
              </div>
            `
              : "";
            return `
              <div class="forecast-item grid grid-cols-[auto_1fr_auto] items-center gap-4 p-3 sm:p-3.5 bg-white rounded-xl shadow-sm transition-all cursor-pointer select-none hover:translate-x-1 hover:shadow-lg hover:shadow-teal-500/15" data-expanded="false">
                <img src="${iconUrl(icon)}" alt="${descCap}" title="${descCap}" class="w-10 h-10" />
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-gray-600">${d.day}${isToday ? " (сегодня)" : ""}</span>
                  <span class="text-sm text-gray-500 capitalize">${descCap}</span>
                </div>
                <span class="font-bold text-[#00b894]">${d.temp}°</span>
                ${details}
              </div>
            `;
          }
        )
        .join("");

      list.querySelectorAll(".forecast-item").forEach((el) => {
        el.addEventListener("click", () => {
          const expanded = el.getAttribute("data-expanded") === "true";
          list.querySelectorAll(".forecast-item").forEach((i) => {
            i.classList.remove("expanded");
            i.setAttribute("data-expanded", "false");
          });
          if (!expanded) {
            el.classList.add("expanded");
            el.setAttribute("data-expanded", "true");
          }
        });
      });
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
        fetchForecast(apiName),
      ]);
      fillPanel(current, forecast, displayName);
    } catch (err) {
      hideSkeletons();
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

    let touchMode = null;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let pinchCenterX = 0;
    let pinchCenterY = 0;
    let lastTouchCenterX = 0;
    let lastTouchCenterY = 0;

    function dist(a, b) {
      return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    }
    function center(touches) {
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      };
    }

    function updateTransform() {
      transformEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    wrap.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      scale = Math.min(4, Math.max(0.5, scale + delta));
      updateTransform();
    }, { passive: false });

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
      e.preventDefault();
      tx = startTx + e.clientX - startX;
      ty = startTy + e.clientY - startY;
      updateTransform();
    });

    wrap.addEventListener("mouseup", () => (isDown = false));
    wrap.addEventListener("mouseleave", () => (isDown = false));

    wrap.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        touchMode = "pinch";
        pinchStartDist = dist(e.touches[0], e.touches[1]);
        pinchStartScale = scale;
        const c = center(e.touches);
        pinchCenterX = c.x;
        pinchCenterY = c.y;
        lastTouchCenterX = c.x;
        lastTouchCenterY = c.y;
      } else if (e.touches.length === 1 && !e.target.closest("path.region")) {
        touchMode = "pan";
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTx = tx;
        startTy = ty;
      }
    }, { passive: true });

    wrap.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && touchMode === "pinch") {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const newScale = Math.min(4, Math.max(0.5, pinchStartScale * (d / pinchStartDist)));
        const c = center(e.touches);
        tx += c.x - lastTouchCenterX;
        ty += c.y - lastTouchCenterY;
        lastTouchCenterX = c.x;
        lastTouchCenterY = c.y;
        scale = newScale;
        updateTransform();
      } else if (e.touches.length === 1 && touchMode === "pan") {
        e.preventDefault();
        tx = startTx + e.touches[0].clientX - startX;
        ty = startTy + e.touches[0].clientY - startY;
        updateTransform();
      }
    }, { passive: false });

    wrap.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) touchMode = null;
      if (e.touches.length < 1) {
        touchMode = null;
        isDown = false;
      }
    }, { passive: true });

    wrap.addEventListener("touchcancel", () => {
      touchMode = null;
      isDown = false;
    }, { passive: true });
  }

  function init() {
    document.documentElement.lang = "ru";
    document.querySelector(".detail-close")?.setAttribute("aria-label", tr("close"));
    const ftInit = document.getElementById("detail-forecast-title");
    if (ftInit) ftInit.textContent = tr("forecast");

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

        wrap.addEventListener("touchstart", (e) => {
          if (e.touches.length === 1) updateHover(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        wrap.addEventListener("touchmove", (e) => {
          if (e.touches.length === 1) updateHover(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        wrap.addEventListener("touchend", () => {
          if (hoveredPath) {
            hoveredPath.classList.remove("hover");
            hoveredPath = null;
          }
          if (tip) {
            tip.classList.remove("visible");
            tip.setAttribute("aria-hidden", "true");
          }
        }, { passive: true });

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
