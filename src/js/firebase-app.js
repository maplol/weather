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
    req.onsuccess = () => resolve(req.result || { visited: {} });
    req.onerror = () => resolve({ visited: {} });
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

let _user = null;
let _data = { visited: {} };
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
  const merged = { visited: { ...cloud?.visited, ...local.visited } };
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
  notify();
});

window.wbApp = {
  onStateChange(fn) {
    _listeners.add(fn);
    fn(_user, _data);
    return () => _listeners.delete(fn);
  },

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

  async toggleVisited(cityId) {
    const today = new Date().toISOString().slice(0, 10);
    if (_data.visited[cityId]) {
      delete _data.visited[cityId];
      await idbSet(_data);
      if (_user) {
        await setDoc(doc(db, "users", _user.uid), {
          visited: { [cityId]: deleteField() }
        }, { merge: true });
      }
    } else {
      _data.visited[cityId] = { count: 1, firstVisit: today, lastVisit: today };
      await idbSet(_data);
      if (_user) await saveToFirestore(_user.uid, _data);
    }
    notify();
  },

  async incrementVisited(cityId) {
    const today = new Date().toISOString().slice(0, 10);
    const existing = _data.visited[cityId];
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastVisit = today;
    } else {
      _data.visited[cityId] = { count: 1, firstVisit: today, lastVisit: today };
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
