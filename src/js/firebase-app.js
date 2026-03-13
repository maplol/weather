import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, signInWithPopup, signOut, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = window.__FB_CONFIG || {};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const IDB_NAME = "wbelarus";
const IDB_STORE = "userData";
const IDB_KEY = "profile";

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet() {
  const idb = await openIDB();
  return new Promise((resolve) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => {
      const r = req.result || {};
      resolve({ visited: r.visited || {}, visitedHighlights: r.visitedHighlights || {}, ...r });
    };
    req.onerror = () => resolve({ visited: {}, visitedHighlights: {} });
  });
}

async function idbSet(data) {
  const idb = await openIDB();
  return new Promise((resolve) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
  });
}

function _normalizeHL(val) {
  if (!val) return null;
  if (val.visits && Array.isArray(val.visits)) return val;
  if (val.date) return { visits: [val.date] };
  return { visits: [] };
}

let _user = null;
let _data = { visited: {}, visitedHighlights: {} };
let _authReady = false;
const _listeners = new Set();

function notify() {
  _listeners.forEach((fn) => { try { fn(_user, _data); } catch {} });
}

async function loadFromFirestore(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) return snap.data();
  } catch {}
  return null;
}

async function saveToFirestore(uid, data) {
  try { await setDoc(doc(db, "users", uid), data, { merge: true }); } catch {}
}

async function mergeCloudAndLocal(uid) {
  const [local, cloud] = await Promise.all([idbGet(), loadFromFirestore(uid)]);
  const merged = { visited: { ...cloud?.visited, ...local.visited }, visitedHighlights: {} };
  if (local.home) merged.home = local.home;
  else if (cloud?.home) merged.home = cloud.home;
  if (local.route) merged.route = local.route;
  else if (cloud?.route) merged.route = cloud.route;
  if (local.interests?.length) merged.interests = local.interests;
  else if (cloud?.interests?.length) merged.interests = cloud.interests;

  for (const [id, item] of Object.entries(cloud?.visited || {})) {
    const localItem = local.visited[id];
    if (localItem) {
      merged.visited[id] = {
        count: Math.max(item.count || 0, localItem.count || 0),
        firstVisit: item.firstVisit < localItem.firstVisit ? item.firstVisit : localItem.firstVisit,
        lastVisit: item.lastVisit > localItem.lastVisit ? item.lastVisit : localItem.lastVisit,
      };
    }
  }

  const localHL = local.visitedHighlights || {};
  const cloudHL = cloud?.visitedHighlights || {};
  const allHLKeys = new Set([...Object.keys(localHL), ...Object.keys(cloudHL)]);
  for (const key of allHLKeys) {
    const l = _normalizeHL(localHL[key]);
    const c = _normalizeHL(cloudHL[key]);
    if (l && c) {
      const allVisits = [...new Set([...l.visits, ...c.visits])].sort();
      merged.visitedHighlights[key] = { visits: allVisits };
    } else {
      merged.visitedHighlights[key] = l || c;
    }
  }

  _data = merged;
  await Promise.all([idbSet(merged), saveToFirestore(uid, merged)]);
  notify();
}

onAuthStateChanged(auth, async (user) => {
  _user = user;
  if (user) {
    await mergeCloudAndLocal(user.uid);
  } else {
    _data = await idbGet();
  }
  _authReady = true;
  notify();
});

window.wbApp = {
  onStateChange(fn) {
    _listeners.add(fn);
    if (_authReady) fn(_user, _data);
    return () => _listeners.delete(fn);
  },

  get authReady() { return _authReady; },

  async signIn() {
    try { await signInWithPopup(auth, provider); }
    catch (e) { if (e.code !== "auth/popup-closed-by-user") console.error(e); }
  },

  async signOut() {
    await signOut(auth);
    _data = await idbGet();
    notify();
  },

  getUser() { return _user; },
  getData() { return _data; },

  async toggleVisited(cityId, dateStr) {
    const date = dateStr || new Date().toISOString().slice(0, 10);
    const dateOnly = date.slice(0, 10);
    if (_data.visited[cityId]) {
      delete _data.visited[cityId];
      await idbSet(_data);
      if (_user) {
        await setDoc(doc(db, "users", _user.uid), {
          visited: { [cityId]: deleteField() }
        }, { merge: true });
      }
    } else {
      _data.visited[cityId] = { count: 1, firstVisit: dateOnly, lastVisit: date };
      await idbSet(_data);
      if (_user) await saveToFirestore(_user.uid, _data);
    }
    notify();
  },

  async incrementVisited(cityId, dateStr) {
    const date = dateStr || new Date().toISOString().slice(0, 10);
    const dateOnly = date.slice(0, 10);
    const existing = _data.visited[cityId];
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastVisit = date;
      if (dateOnly < (existing.firstVisit || "9999")) existing.firstVisit = dateOnly;
    } else {
      _data.visited[cityId] = { count: 1, firstVisit: dateOnly, lastVisit: date };
    }
    await idbSet(_data);
    if (_user) await saveToFirestore(_user.uid, _data);
    notify();
  },

  isVisited(cityId) {
    return !!_data.visited[cityId];
  },

  getVisitedCount(cityId) {
    return _data.visited[cityId]?.count || 0;
  },

  async setHome(lat, lon, name) {
    _data.home = { lat, lon, name };
    await idbSet(_data);
    if (_user) await saveToFirestore(_user.uid, _data);
    notify();
  },

  getHome() { return _data.home || null; },

  async saveRoute(routeIds) {
    _data.route = routeIds;
    await idbSet(_data);
    if (_user) await saveToFirestore(_user.uid, _data);
    notify();
  },

  async clearRoute() {
    delete _data.route;
    await idbSet(_data);
    if (_user) await setDoc(doc(db, "users", _user.uid), { route: deleteField() }, { merge: true });
    notify();
  },

  getRoute() { return _data.route || null; },

  async saveInterests(tags) {
    _data.interests = tags;
    await idbSet(_data);
    if (_user) await saveToFirestore(_user.uid, _data);
    notify();
  },

  getInterests() { return _data.interests || null; },

  async addHighlightVisit(cityId, hlName, dateStr) {
    const key = cityId + "::" + hlName;
    const date = dateStr || new Date().toISOString().slice(0, 10);
    const dateOnly = date.slice(0, 10);
    if (!_data.visitedHighlights) _data.visitedHighlights = {};
    const existing = _normalizeHL(_data.visitedHighlights[key]);
    if (existing) {
      existing.visits.push(date);
      _data.visitedHighlights[key] = existing;
    } else {
      _data.visitedHighlights[key] = { visits: [date] };
    }
    if (!_data.visited[cityId]) {
      _data.visited[cityId] = { count: 1, firstVisit: dateOnly, lastVisit: date };
    }
    await idbSet(_data);
    if (_user) await saveToFirestore(_user.uid, _data);
    notify();
  },

  async removeHighlightVisitByIndex(cityId, hlName, index) {
    const key = cityId + "::" + hlName;
    const entry = _normalizeHL(_data.visitedHighlights?.[key]);
    if (!entry || index < 0 || index >= entry.visits.length) return;
    entry.visits.splice(index, 1);
    if (entry.visits.length === 0) {
      delete _data.visitedHighlights[key];
      await idbSet(_data);
      if (_user) {
        await setDoc(doc(db, "users", _user.uid), {
          visitedHighlights: { [key]: deleteField() }
        }, { merge: true });
      }
    } else {
      _data.visitedHighlights[key] = entry;
      await idbSet(_data);
      if (_user) await saveToFirestore(_user.uid, _data);
    }
    notify();
  },

  isHighlightVisited(cityId, hlName) {
    const entry = _normalizeHL((_data.visitedHighlights || {})[cityId + "::" + hlName]);
    return entry ? entry.visits.length > 0 : false;
  },

  getHighlightVisitCount(cityId, hlName) {
    const entry = _normalizeHL((_data.visitedHighlights || {})[cityId + "::" + hlName]);
    return entry ? entry.visits.length : 0;
  },

  getHighlightVisits(cityId, hlName) {
    const entry = _normalizeHL((_data.visitedHighlights || {})[cityId + "::" + hlName]);
    return entry ? [...entry.visits] : [];
  },

  getVisitedHighlights() {
    return _data.visitedHighlights || {};
  },

  getVisitedHighlightsForCity(cityId) {
    const result = [];
    const prefix = cityId + "::";
    for (const [key, val] of Object.entries(_data.visitedHighlights || {})) {
      if (key.startsWith(prefix)) {
        const norm = _normalizeHL(val);
        result.push({ name: key.slice(prefix.length), visits: norm ? norm.visits : [] });
      }
    }
    return result;
  },

  hasVisitedHighlights(cityId) {
    const prefix = cityId + "::";
    for (const [key, val] of Object.entries(_data.visitedHighlights || {})) {
      if (key.startsWith(prefix)) {
        const norm = _normalizeHL(val);
        if (norm && norm.visits.length > 0) return true;
      }
    }
    return false;
  },

  async removeHighlightVisit(cityId, hlName) {
    const key = cityId + "::" + hlName;
    if (!_data.visitedHighlights?.[key]) return;
    delete _data.visitedHighlights[key];
    await idbSet(_data);
    if (_user) {
      await setDoc(doc(db, "users", _user.uid), {
        visitedHighlights: { [key]: deleteField() }
      }, { merge: true });
    }
    notify();
  },

  async requestGeolocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 10000 }
      );
    });
  },
};
