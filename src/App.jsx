import React, { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { MapPin, Clock, Upload, RefreshCw, Calendar, AlertCircle, CheckCircle2, Sparkles, Trophy, ShieldAlert, Phone, Mail, History, X, Search, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import AgendaView from "./AgendaView";
import BoutonAgenda from "./components/BoutonAgenda";

// ============================================================
// Constantes
// ============================================================
const VITESSE_MOYENNE_KMH = 38;
const COEF_ROUTE = 1.3;
const JOURNEE_DEBUT = 8 * 60;
const JOURNEE_FIN = 19 * 60;

const PRESSION_SCORE = { Rouge: 3, Orange: 2, Vert: 1 };
const CIBLAGE_SCORE = {
  "COMPTE CLE": 8,
  PLATINIUM: 7,
  GOLD: 6,
  SILVER: 5,
  BRONZE: 4,
  "PROSPECTS 1": 3,
  "PROSPECTS 2": 2,
  "PROSPECTS 3": 1,
};

const PRESSION_COLOR = { Rouge: "var(--rouge)", Orange: "var(--orange)", Vert: "var(--vert)" };

// ============================================================
// Utilitaires géo & temps
// ============================================================
function distanceKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function estimerTrajetMin(a, b) {
  const d = distanceKm(a, b);
  if (d === null) return null;
  const heures = (d * COEF_ROUTE) / VITESSE_MOYENNE_KMH;
  return Math.max(3, Math.round(heures * 60));
}

async function geocoder(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("geocode fail");
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

function formatMin(min) {
  if (min === null || min === undefined) return "—";
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  if (abs < 60) return `${sign}${abs} min`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${sign}${h} h` : `${sign}${h} h ${m}`;
}

function minToHHMM(totalMin) {
  const h = Math.floor(totalMin / 60) % 24;
  const m = ((Math.round(totalMin) % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

function minToHHMMInput(totalMin) {
  const h = Math.floor(totalMin / 60) % 24;
  const m = ((Math.round(totalMin) % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hhmmToMin(hhmm) {
  const [h, m] = (hhmm || "09:00").split(":").map(Number);
  return h * 60 + m;
}

function dateToKey(d) {
  return d.toISOString().slice(0, 10);
}

function formatDateFr(dateKey) {
  if (!dateKey) return "—";
  const d = new Date(dateKey + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatDateCourt(dateKey) {
  if (!dateKey) return "—";
  const d = new Date(dateKey + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function scoreClient(client) {
  const p = PRESSION_SCORE[client.pression] || 0;
  const c = CIBLAGE_SCORE[client.ciblage] || 0;
  return p * 10 + c;
}

function joursOuvres(depuis, nbJours) {
  const out = [];
  let d = new Date(depuis);
  while (out.length < nbJours) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ============================================================
// Connexion Supabase
// ============================================================
const SUPABASE_URL = "https://baeglgpwriyvcerybbwj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_feR5aPDkEqXgdjxUqg4nHA_Ci-5TfEJ";

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  return res;
}

async function chargerDonneesDistantes(code) {
  const res = await supabaseFetch(`tournee_donnees?code=eq.${code}&select=donnees`);
  if (!res.ok) throw new Error("Lecture impossible");
  const rows = await res.json();
  return rows.length > 0 ? rows[0].donnees : null;
}

async function sauvegarderDonneesDistantes(code, donnees) {
  const res = await supabaseFetch(`tournee_donnees?on_conflict=code`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ code, donnees, maj_le: new Date().toISOString() }),
  });
  return res.ok;
}

async function codeExisteDeja(code) {
  const res = await supabaseFetch(`tournee_donnees?code=eq.${code}&select=code`);
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

// ============================================================
// Stockage local
// ============================================================
function lireLocal(storageKey, initial) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : initial;
  } catch {
    return initial;
  }
}

function ecrireLocal(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {}
}

// ============================================================
// Hook useSyncedState
// ============================================================
function useSyncedState(code, syncTick, setSyncTick) {
  const [donnees, setDonneesState] = useState(() => ({
    clients: lireLocal("tournee_clients", []),
    geoCache: lireLocal("tournee_geocache", {}),
    planning: lireLocal("tournee_planning", {}),
    departs: lireLocal("tournee_departs", {}),
    domicile: lireLocal("tournee_domicile", null),
    agendaRdvs: lireLocal("tournee_agendardvs", []),
  }));
  const donneesRef = useRef(donnees);
  useEffect(() => { donneesRef.current = donnees; }, [donnees]);

  const debounceRef = useRef(null);

  const persistLocal = useCallback((next) => {
    ecrireLocal("tournee_clients", next.clients);
    ecrireLocal("tournee_geocache", next.geoCache);
    ecrireLocal("tournee_planning", next.planning);
    ecrireLocal("tournee_departs", next.departs);
    ecrireLocal("tournee_domicile", next.domicile || null);
    ecrireLocal("tournee_agendardvs", next.agendaRdvs || []);
  }, []);

  const pousserVersSupabase = useCallback(
    (next) => {
      if (!code) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        sauvegarderDonneesDistantes(code, next).then((ok) => {
          setSyncTick((t) => ({ ...t, dernier: ok ? "ok" : "erreur", heure: Date.now() }));
        });
      }, 1200);
    },
    [code, setSyncTick]
  );

  const forcerSyncMaintenant = useCallback(async () => {
    if (!code) return false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const ok = await sauvegarderDonneesDistantes(code, donneesRef.current);
    setSyncTick((t) => ({ ...t, dernier: ok ? "ok" : "erreur", heure: Date.now() }));
    return ok;
  }, [code, setSyncTick]);

  const update = useCallback(
    (cle, updater) => {
      setDonneesState((prev) => {
        const next = { ...prev, [cle]: typeof updater === "function" ? updater(prev[cle]) : updater };
        persistLocal(next);
        pousserVersSupabase(next);
        return next;
      });
    },
    [persistLocal, pousserVersSupabase]
  );

  const remplacerTout = useCallback(
    (next) => {
      setDonneesState(next);
      persistLocal(next);
    },
    [persistLocal]
  );

  const setDonneesEtPersist = useCallback(
    (updater) => {
      setDonneesState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        persistLocal(next);
        if (next !== prev) pousserVersSupabase(next);
        return next;
      });
    },
    [persistLocal, pousserVersSupabase]
  );

  return { donnees, update, remplacerTout, setDonneesEtPersist, forcerSyncMaintenant };
}

// ============================================================
// Parsing Excel
// ============================================================
function excelDateToISO(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (value instanceof Date) return dateToKey(value);
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function parseClientsWorkbook(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  let headerRowIdx = rows.findIndex((r) => r && r.includes("ID Client"));
  if (headerRowIdx === -1) headerRowIdx = 3;
  const headers = rows[headerRowIdx];

  const colIdx = (name) => headers.findIndex((h) => h && String(h).trim() === name);
  const idx = {
    pression: colIdx("Indicateur pression"),
    id: colIdx("ID Client"),
    etablissement: colIdx("Etablissement"),
    nom: colIdx("Nom"),
    cp: colIdx("CP"),
    ville: colIdx("Ville"),
    uga: colIdx("UGA"),
    derniereVisite: colIdx("Date dernière visite"),
    prochainRdv: colIdx("Date prochain RDV"),
    statutRdv: colIdx("RDV"),
    groupement: colIdx("Groupement"),
    contact: colIdx("Contact"),
    adresse: colIdx("Adresse 1"),
    email: colIdx("Email"),
    tel1: colIdx("Tél 1"),
    tel2: colIdx("Tel 2 :"),
    nbVisites: colIdx("Nb visites"),
    ciblage: colIdx("[Ciblage IBSA]"),
  };

  const out = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || idx.id === -1 || r[idx.id] === null || r[idx.id] === undefined) continue;
    out.push({
      id: String(r[idx.id]),
      pression: r[idx.pression] || null,
      etablissement: r[idx.etablissement] || "Sans nom",
      nom: r[idx.nom] || null,
      cp: r[idx.cp] !== null && r[idx.cp] !== undefined ? String(r[idx.cp]) : null,
      ville: r[idx.ville] || null,
      uga: r[idx.uga] || null,
      derniereVisite: idx.derniereVisite !== -1 ? excelDateToISO(r[idx.derniereVisite]) : null,
      prochainRdv: idx.prochainRdv !== -1 ? excelDateToISO(r[idx.prochainRdv]) : null,
      statutRdv: idx.statutRdv !== -1 ? r[idx.statutRdv] || null : null,
      groupement: idx.groupement !== -1 ? r[idx.groupement] || null : null,
      contact: idx.contact !== -1 ? r[idx.contact] || null : null,
      adresse: idx.adresse !== -1 ? r[idx.adresse] || null : null,
      email: idx.email !== -1 ? r[idx.email] || null : null,
      tel1: idx.tel1 !== -1 ? r[idx.tel1] || null : null,
      tel2: idx.tel2 !== -1 ? r[idx.tel2] || null : null,
      nbVisites: idx.nbVisites !== -1 ? Number(r[idx.nbVisites]) || 0 : 0,
      ciblage: idx.ciblage !== -1 ? r[idx.ciblage] || null : null,
      coords: null,
      dureeDefaut: 20,
    });
  }
  return out;
}

// ============================================================
// Écran connexion
// ============================================================
function genererCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function EcranConnexion({ onConnecte }) {
  const [mode, setMode] = useState("choix");
  const [codeSaisi, setCodeSaisi] = useState("");
  const [codeGenere, setCodeGenere] = useState("");
  const [statut, setStatut] = useState(null);
  const [erreur, setErreur] = useState("");

  async function creerEspace() {
    setStatut("verification");
    setErreur("");
    let code = genererCode();
    try {
      let tentatives = 0;
      while ((await codeExisteDeja(code)) && tentatives < 5) {
        code = genererCode();
        tentatives++;
      }
      const ok = await sauvegarderDonneesDistantes(code, { clients: [], geoCache: {}, planning: {}, departs: {}, agendaRdvs: [] });
      if (!ok) {
        setErreur("Connexion au serveur impossible. Vérifie ta connexion internet et réessaie.");
        setStatut(null);
        return;
      }
      setCodeGenere(code);
      setStatut("cree");
    } catch {
      setErreur("Connexion au serveur impossible. Vérifie ta connexion internet et réessaie.");
      setStatut(null);
    }
  }

  async function rejoindreEspace() {
    if (codeSaisi.trim().length !== 6) {
      setErreur("Le code doit comporter 6 chiffres.");
      return;
    }
    setStatut("verification");
    setErreur("");
    try {
      const existe = await codeExisteDeja(codeSaisi.trim());
      if (!existe) {
        setErreur("Ce code n'existe pas. Vérifie qu'il est bien identique sur ton autre appareil.");
        setStatut(null);
        return;
      }
      onConnecte(codeSaisi.trim());
    } catch {
      setErreur("Connexion au serveur impossible. Vérifie ta connexion internet et réessaie.");
      setStatut(null);
    }
  }

  return (
    <div className="tournee-root">
      <style>{`
        .tournee-root {
          --ardoise: #1C2630; --creme: #F5F2EC; --orange: #E8714A; --orange-clair: #F4A07F;
          --gris: #8A93A0; --gris-clair: #DCD7CB; --rouge: #C75450;
          font-family: 'Inter', system-ui, sans-serif; background: var(--creme); color: var(--ardoise);
          min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center;
        }
        .tournee-root * { box-sizing: border-box; }
        .tr-gate { max-width: 380px; width: 100%; padding: 28px 22px; }
        .tr-gate-title { font-family: 'Oswald', 'Arial Narrow', sans-serif; font-size: 28px; font-weight: 600; text-transform: uppercase; text-align: center; margin-bottom: 6px; }
        .tr-gate-sub { text-align: center; color: var(--gris); font-size: 13px; margin-bottom: 28px; }
        .tr-gate-card { background: white; border: 1px solid var(--gris-clair); border-radius: 12px; padding: 20px; margin-bottom: 14px; }
        .tr-gate-btn { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; font-size: 14px; padding: 13px 16px; border-radius: 8px; border: none; cursor: pointer; width: 100%; background: var(--orange); color: white; margin-bottom: 10px; }
        .tr-gate-btn:disabled { background: var(--gris-clair); color: var(--gris); }
        .tr-gate-btn-outline { background: transparent; border: 1.5px solid var(--ardoise); color: var(--ardoise); }
        .tr-gate-input { width: 100%; padding: 14px; border: 1.5px solid var(--gris-clair); border-radius: 8px; font-size: 24px; text-align: center; letter-spacing: 0.3em; font-family: 'Oswald', sans-serif; margin-bottom: 12px; background: var(--creme); }
        .tr-gate-input:focus { outline: none; border-color: var(--orange); background: white; }
        .tr-code-affiche { font-family: 'Oswald', sans-serif; font-size: 36px; font-weight: 600; text-align: center; letter-spacing: 0.25em; padding: 18px; background: #FBF0E9; border-radius: 10px; color: var(--orange); margin-bottom: 14px; }
        .tr-gate-alert { background: #FCEEED; border: 1px solid var(--rouge); color: #8A3530; border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-bottom: 12px; }
        .tr-gate-link { text-align: center; font-size: 13px; color: var(--gris); margin-top: 6px; }
        .tr-gate-link button { background: none; border: none; color: var(--orange); cursor: pointer; font-weight: 600; padding: 0; }
      `}</style>
      <div className="tr-gate">
        <div className="tr-gate-title">Tournée</div>
        <div className="tr-gate-sub">Tes données synchronisées entre tous tes appareils</div>

        {mode === "choix" && (
          <div className="tr-gate-card">
            <button className="tr-gate-btn" onClick={() => setMode("creer")}>Premier appareil — créer mon espace</button>
            <button className="tr-gate-btn tr-gate-btn-outline" onClick={() => setMode("rejoindre")}>J'ai déjà un code — rejoindre mon espace</button>
          </div>
        )}

        {mode === "creer" && statut !== "cree" && (
          <div className="tr-gate-card">
            <p style={{ fontSize: 13, color: "var(--gris)", marginBottom: 14 }}>Un code à 6 chiffres va être créé. Tu en auras besoin pour connecter ton autre appareil — note-le bien.</p>
            {erreur && <div className="tr-gate-alert">{erreur}</div>}
            <button className="tr-gate-btn" onClick={creerEspace} disabled={statut === "verification"}>
              {statut === "verification" ? "Création..." : "Créer mon espace"}
            </button>
            <div className="tr-gate-link"><button onClick={() => setMode("choix")}>Retour</button></div>
          </div>
        )}

        {mode === "creer" && statut === "cree" && (
          <div className="tr-gate-card">
            <p style={{ fontSize: 13, color: "var(--gris)", marginBottom: 10 }}>Ton code :</p>
            <div className="tr-code-affiche">{codeGenere}</div>
            <p style={{ fontSize: 12.5, color: "var(--gris)", marginBottom: 14 }}>Note ce code quelque part. Sur ton autre appareil, choisis « J'ai déjà un code » et saisis-le.</p>
            <button className="tr-gate-btn" onClick={() => onConnecte(codeGenere)}>Continuer</button>
          </div>
        )}

        {mode === "rejoindre" && (
          <div className="tr-gate-card">
            <input className="tr-gate-input" inputMode="numeric" maxLength={6} placeholder="------" value={codeSaisi} onChange={(e) => setCodeSaisi(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            {erreur && <div className="tr-gate-alert">{erreur}</div>}
            <button className="tr-gate-btn" onClick={rejoindreEspace} disabled={statut === "verification"}>
              {statut === "verification" ? "Vérification..." : "Rejoindre"}
            </button>
            <div className="tr-gate-link"><button onClick={() => setMode("choix")}>Retour</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Composant racine
// ============================================================
export default function Root() {
  const [code, setCode] = useState(() => lireLocal("tournee_code", null));

  function seDeconnecter() {
    window.localStorage.removeItem("tournee_code");
    setCode(null);
  }

  function onConnecte(c) {
    ecrireLocal("tournee_code", c);
    setCode(c);
  }

  if (!code) return <EcranConnexion onConnecte={onConnecte} />;
  return <App code={code} onDeconnecter={seDeconnecter} />;
}

// ============================================================
// Composant principal
// ============================================================
function App({ code, onDeconnecter }) {
  const [syncTick, setSyncTick] = useState({ dernier: null, heure: null });
  const { donnees, update, remplacerTout, setDonneesEtPersist, forcerSyncMaintenant } = useSyncedState(code, syncTick, setSyncTick);
  const { clients, geoCache, planning, departs, domicile } = donnees;
  const setClients = useCallback((u) => update("clients", u), [update]);
  const setGeoCache = useCallback((u) => update("geoCache", u), [update]);
  const setPlanning = useCallback((u) => update("planning", u), [update]);
  const setDeparts = useCallback((u) => update("departs", u), [update]);
  const setDomicile = useCallback((u) => update("domicile", u), [update]);
  const setAgendaRdvs = useCallback((u) => update("agendaRdvs", u), [update]);

  const [chargementInitial, setChargementInitial] = useState(true);
  useEffect(() => {
    let annule = false;
    chargerDonneesDistantes(code)
      .then((distant) => {
        if (annule || !distant) return;
        setDonneesEtPersist((local) => {
          const distantPlusRiche = (distant.clients || []).length > (local.clients || []).length;
          if (distantPlusRiche) {
            return {
              clients: distant.clients || [],
              geoCache: { ...(local.geoCache || {}), ...(distant.geoCache || {}) },
              planning: Object.keys(distant.planning || {}).length > 0 ? distant.planning : local.planning,
              departs: Object.keys(distant.departs || {}).length > 0 ? distant.departs : local.departs,
              domicile: distant.domicile || local.domicile || null,
              agendaRdvs: (distant.agendaRdvs || []).length > 0 ? distant.agendaRdvs : (local.agendaRdvs || []),
            };
          }
          if (!local.domicile && distant.domicile) {
            return { ...local, domicile: distant.domicile };
          }
          return local;
        });
      })
      .catch(() => {})
      .finally(() => { if (!annule) setChargementInitial(false); });
    return () => { annule = true; };
  }, [code]);

  const [vue, setVue] = useState("import");
  const [importStatus, setImportStatus] = useState(null);
  const [geocodageProgress, setGeocodageProgress] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [clientSelectionne, setClientSelectionne] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [calcEnCours, setCalcEnCours] = useState(false);
  const [modeRecherche, setModeRecherche] = useState("urgent");
  const [horizonJours, setHorizonJours] = useState(90);
  const [dateChoisie, setDateChoisie] = useState("");
  const [erreur, setErreur] = useState("");
  const [toast, setToast] = useState(null);
  const [rdvAnnule, setRdvAnnule] = useState(null);
  const [planB, setPlanB] = useState(null);
  // Créneau retenu en attente d'ajout agenda
  const [creneauRetenu, setCreneauRetenu] = useState(null);
  const fileInputRef = useRef(null);

  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportStatus("lecture");
    setErreur("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const parsed = parseClientsWorkbook(wb);
      if (parsed.length === 0) {
        setImportStatus(null);
        setErreur("Aucune ligne client détectée. Le format du fichier ne correspond pas au gabarit attendu.");
        return;
      }
      setClients(parsed);
      setImportStatus("geocodage");
      showToast(`${parsed.length} clients importés`, "ok");
      await geocoderTousLesClients(parsed);
      initialiserPlanningDepuisImport(parsed);
      setImportStatus("synchronisation");
      await forcerSyncMaintenant();
      setImportStatus("termine");
      setVue("prochain-rdv");
    } catch (err) {
      setImportStatus(null);
      setErreur("Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un .xlsx.");
    }
  }

  async function geocoderTousLesClients(listeClients) {
    const cache = { ...geoCache };
    const aGeocoder = [];
    const clesVues = new Set();
    listeClients.forEach((c) => {
      const cle = `${c.cp}|${c.ville}`;
      if (!cache[cle] && !clesVues.has(cle)) {
        clesVues.add(cle);
        aGeocoder.push({ cle, cp: c.cp, ville: c.ville });
      }
    });
    setGeocodageProgress({ fait: 0, total: aGeocoder.length });
    for (let i = 0; i < aGeocoder.length; i++) {
      const { cle, cp, ville } = aGeocoder[i];
      try {
        const coords = await geocoder(`${cp} ${ville}, France`);
        if (coords) cache[cle] = coords;
      } catch {}
      setGeocodageProgress({ fait: i + 1, total: aGeocoder.length });
      await new Promise((r) => setTimeout(r, 250));
    }
    setGeoCache(cache);
    setClients((prev) =>
      prev.map((c) => {
        const cle = `${c.cp}|${c.ville}`;
        return cache[cle] ? { ...c, coords: cache[cle] } : c;
      })
    );
  }

  // Regéocoder uniquement les clients sans coordonnées
  const [regeoStatut, setRegeoStatut] = useState(null);
  async function regeocoder() {
    const sansCoords = clients.filter(c => !c.coords);
    if (sansCoords.length === 0) { showToast("Tous les clients sont déjà localisés ✓", "ok"); return; }
    setRegeoStatut({ fait: 0, total: sansCoords.length, enCours: true });
    const cache = { ...geoCache };
    const clesVues = new Set();
    const aGeocoder = [];
    sansCoords.forEach(c => {
      const cle = `${c.cp}|${c.ville}`;
      if (!clesVues.has(cle)) { clesVues.add(cle); aGeocoder.push({ cle, cp: c.cp, ville: c.ville, adresse: c.adresse }); }
    });
    let fait = 0;
    for (const { cle, cp, ville, adresse } of aGeocoder) {
      try {
        // Essayer d'abord avec l'adresse complète, puis juste CP+ville
        let coords = adresse ? await geocoder(`${adresse}, ${cp} ${ville}, France`) : null;
        if (!coords) coords = await geocoder(`${cp} ${ville}, France`);
        if (coords) cache[cle] = coords;
      } catch {}
      fait++;
      setRegeoStatut({ fait, total: aGeocoder.length, enCours: true });
      await new Promise(r => setTimeout(r, 300));
    }
    setGeoCache(cache);
    const avant = clients.filter(c => !c.coords).length;
    setClients(prev => prev.map(c => {
      const cle = `${c.cp}|${c.ville}`;
      return cache[cle] ? { ...c, coords: cache[cle] } : c;
    }));
    await forcerSyncMaintenant();
    const apres = clients.filter(c => !cache[`${c.cp}|${c.ville}`]).length;
    setRegeoStatut({ fait, total: aGeocoder.length, enCours: false, localises: avant - apres });
  }

  function initialiserPlanningDepuisImport(listeClients) {
    setPlanning((prev) => {
      const np = { ...prev };
      listeClients.forEach((c) => {
        if (c.prochainRdv && c.statutRdv) {
          if (!np[c.prochainRdv]) np[c.prochainRdv] = [];
          const dejaPresent = np[c.prochainRdv].some((r) => r.clientId === c.id);
          if (!dejaPresent) {
            np[c.prochainRdv].push({ clientId: c.id, heureArrivee: null, heureFin: null });
          }
        }
      });
      return np;
    });
  }

  const clientsById = {};
  clients.forEach((c) => (clientsById[c.id] = c));

  function construireRdvParJour(departsCustom) {
    const departsUtilises = departsCustom || departs;
    const out = {};
    Object.keys(planning).forEach((dateKey) => {
      const depart = departsUtilises[dateKey] || { coords: null, heure: "08:30" };
      const ids = (planning[dateKey] || []).map((r) => r.clientId);
      const items = ids.map((id) => clientsById[id]).filter((c) => c && c.coords).map((c) => ({ client: c, coords: c.coords }));
      let curMin = hhmmToMin(depart.heure || "08:30");
      let prevCoords = depart.coords;
      const seq = [];
      items.forEach((it) => {
        const trajet = prevCoords ? estimerTrajetMin(prevCoords, it.coords) || 0 : 0;
        curMin += trajet;
        const arrivee = curMin;
        curMin += it.client.dureeDefaut || 20;
        seq.push({ client: it.client, coords: it.coords, heureArrivee: arrivee, fin: curMin });
        prevCoords = it.coords;
      });
      out[dateKey] = seq;
    });
    return out;
  }

  async function chercherCreneau(client, mode = { type: "semaine" }) {
    setErreur("");
    setSuggestions(null);
    setCreneauRetenu(null);
    if (!client.coords) {
      setErreur(`${client.etablissement} n'est pas localisé. Relance le géocodage ou vérifie son adresse.`);
      return;
    }
    const departsEtendus = { ...departs };
    const aujourdHuiDate = new Date();
    aujourdHuiDate.setHours(0, 0, 0, 0);

    function ajouterDomicileSiAbsent(dateKey) {
      if (!departsEtendus[dateKey] && domicile) {
        departsEtendus[dateKey] = { adresse: domicile.adresse, coords: domicile.coords, heure: domicile.heure || "08:30" };
      }
    }

    function ajouterFenetreJoursOuvres(joursAvecDepart, debut, fin) {
      let cur = new Date(debut);
      while (cur <= fin) {
        const jourSemaine = cur.getDay();
        if (jourSemaine !== 0 && jourSemaine !== 6) {
          const dk = dateToKey(cur);
          ajouterDomicileSiAbsent(dk);
          if (departsEtendus[dk] && !joursAvecDepart.includes(dk)) joursAvecDepart.push(dk);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    let joursAvecDepart = [];
    if (mode.type === "date") {
      ajouterDomicileSiAbsent(mode.date);
      joursAvecDepart = Object.keys(departsEtendus).filter((d) => d === mode.date && departsEtendus[d].coords);
    } else if (mode.type === "semaine") {
      joursAvecDepart = Object.keys(departs).filter((d) => departs[d].coords);
    } else if (mode.type === "urgent") {
      const fin = new Date(aujourdHuiDate);
      fin.setDate(fin.getDate() + 14);
      ajouterFenetreJoursOuvres(joursAvecDepart, aujourdHuiDate, fin);
    } else if (mode.type === "suivi") {
      const base = mode.derniereVisite ? new Date(mode.derniereVisite + "T00:00:00") : new Date(aujourdHuiDate);
      const cible = new Date(base);
      cible.setDate(cible.getDate() + mode.jours);
      const cibleEffective = cible < aujourdHuiDate ? new Date(aujourdHuiDate) : cible;
      const debutFenetre = new Date(cibleEffective);
      debutFenetre.setDate(debutFenetre.getDate() - 10);
      if (debutFenetre < aujourdHuiDate) debutFenetre.setTime(aujourdHuiDate.getTime());
      const finFenetre = new Date(cibleEffective);
      finFenetre.setDate(finFenetre.getDate() + 10);
      ajouterFenetreJoursOuvres(joursAvecDepart, debutFenetre, finFenetre);
    }

    let dateCibleSuivi = null;
    if (mode.type === "suivi") {
      const base = mode.derniereVisite ? new Date(mode.derniereVisite + "T00:00:00") : new Date(aujourdHuiDate);
      const cible = new Date(base);
      cible.setDate(cible.getDate() + mode.jours);
      dateCibleSuivi = cible < aujourdHuiDate ? new Date(aujourdHuiDate) : cible;
    }

    if (joursAvecDepart.length === 0) {
      if (mode.type === "date" && !domicile) {
        setErreur("Pour proposer une date sans départ déjà défini, enregistre d'abord ton domicile (onglet « Ma semaine »), ou définis un départ pour ce jour précis.");
      } else {
        setErreur("Définis au moins un point de départ (onglet « Ma semaine ») pour pouvoir comparer les trajets.");
      }
      return;
    }
    setCalcEnCours(true);
    const rdvParJour = construireRdvParJour(departsEtendus);
    await new Promise((r) => setTimeout(r, 250));
    const suggestionsParJour = [];
    joursAvecDepart.forEach((jourKey) => {
      const depart = departsEtendus[jourKey];
      const rdvJour = (rdvParJour[jourKey] || []).slice().sort((a, b) => a.heureArrivee - b.heureArrivee);
      const sequence = [{ isDepart: true, coords: depart.coords, fin: hhmmToMin(depart.heure || "08:30") }, ...rdvJour];
      for (let i = 0; i < sequence.length; i++) {
        const prev = sequence[i];
        const next = sequence[i + 1] || null;
        if (!prev.coords) continue;
        const trajetPrevNew = estimerTrajetMin(prev.coords, client.coords);
        if (trajetPrevNew === null) continue;
        const arrivee = (prev.fin || 0) + trajetPrevNew;
        const fin = arrivee + (client.dureeDefaut || 20);
        let coutSupplementaire;
        if (next && next.coords) {
          const trajetPrevNext = estimerTrajetMin(prev.coords, next.coords) || 0;
          const trajetNewNext = estimerTrajetMin(client.coords, next.coords);
          if (trajetNewNext === null) continue;
          if (fin + trajetNewNext > next.heureArrivee) continue;
          coutSupplementaire = trajetPrevNew + trajetNewNext - trajetPrevNext;
        } else {
          if (fin > JOURNEE_FIN) continue;
          coutSupplementaire = trajetPrevNew;
        }
        suggestionsParJour.push({
          jour: jourKey, avant: prev.isDepart ? "Départ" : prev.client.etablissement,
          apres: next ? (next.isDepart ? null : next.client.etablissement) : null,
          coutSupplementaire, arrivee, fin,
          departAUtiliser: !departs[jourKey] ? depart : null,
        });
      }
    });
    if (mode.type === "urgent") {
      suggestionsParJour.sort((a, b) => { if (a.jour !== b.jour) return a.jour < b.jour ? -1 : 1; return a.coutSupplementaire - b.coutSupplementaire; });
    } else if (mode.type === "suivi" && dateCibleSuivi) {
      const cibleTime = dateCibleSuivi.getTime();
      suggestionsParJour.sort((a, b) => {
        const ecartA = Math.abs(new Date(a.jour + "T00:00:00").getTime() - cibleTime);
        const ecartB = Math.abs(new Date(b.jour + "T00:00:00").getTime() - cibleTime);
        if (ecartA !== ecartB) return ecartA - ecartB;
        return a.coutSupplementaire - b.coutSupplementaire;
      });
    } else {
      suggestionsParJour.sort((a, b) => a.coutSupplementaire - b.coutSupplementaire);
    }
    setCalcEnCours(false);
    if (suggestionsParJour.length === 0) {
      setErreur(mode.type === "semaine" ? "Aucun créneau ne convient sur les jours actuellement planifiés. Ajoute un point de départ sur d'autres jours, ou élargis la recherche." : "Aucun créneau ne convient sur la période choisie.");
      return;
    }
    setClientSelectionne(client);
    if (mode.type === "urgent" || mode.type === "suivi") {
      const meilleureParJour = new Map();
      suggestionsParJour.forEach((s) => { if (!meilleureParJour.has(s.jour)) meilleureParJour.set(s.jour, s); });
      setSuggestions(Array.from(meilleureParJour.values()).slice(0, 3));
    } else {
      setSuggestions(suggestionsParJour.slice(0, 3));
    }
  }

  function retenirCreneau(sugg) {
    if (!clientSelectionne) return;
    if (sugg.departAUtiliser) {
      setDeparts((d) => ({ ...d, [sugg.jour]: sugg.departAUtiliser }));
    }
    setPlanning((p) => ({
      ...p,
      [sugg.jour]: [...(p[sugg.jour] || []), { clientId: clientSelectionne.id, heureArrivee: sugg.arrivee, heureFin: sugg.fin }],
    }));
    setClients((prev) => prev.map((c) => (c.id === clientSelectionne.id ? { ...c, prochainRdv: sugg.jour, statutRdv: "Fixe" } : c)));
    showToast(`${clientSelectionne.etablissement} placé le ${formatDateFr(sugg.jour)} à ${minToHHMM(sugg.arrivee)}`, "ok");
    // Mémoriser le créneau retenu pour proposer l'ajout à l'agenda
    setCreneauRetenu({ client: clientSelectionne, sugg });
    setSuggestions(null);
    setClientSelectionne(null);
  }

  async function definirDomicile(adresseTexte, heure) {
    try {
      const coords = await geocoder(adresseTexte + ", France");
      if (!coords) { showToast("Adresse introuvable", "error"); return false; }
      setDomicile({ adresse: adresseTexte, coords, heure: heure || "08:30" });
      showToast("Domicile enregistré comme point de départ par défaut", "ok");
      return true;
    } catch {
      showToast("Service de géocodage indisponible", "error");
      return false;
    }
  }

  function appliquerDomicileAuJour(dateKey, heure) {
    if (!domicile) return;
    setDeparts((d) => ({ ...d, [dateKey]: { adresse: domicile.adresse, coords: domicile.coords, heure: heure || domicile.heure || "08:30" } }));
    showToast(`Domicile utilisé comme départ du ${formatDateFr(dateKey)}`, "ok");
  }

  async function definirDepartJour(dateKey, adresseTexte, heure) {
    try {
      const coords = await geocoder(adresseTexte + ", France");
      if (!coords) { showToast("Adresse de départ introuvable", "error"); return; }
      setDeparts((d) => ({ ...d, [dateKey]: { adresse: adresseTexte, coords, heure } }));
      showToast("Point de départ enregistré", "ok");
    } catch {
      showToast("Service de géocodage indisponible", "error");
    }
  }

  function chercherPlanB(pointRef, excludeId) {
    if (!pointRef) return [];
    return clients
      .filter((c) => c.coords && c.id !== excludeId)
      .map((c) => ({ client: c, trajet: estimerTrajetMin(pointRef, c.coords), score: scoreClient(c) }))
      .filter((x) => x.trajet !== null && x.trajet <= 45)
      .sort((a, b) => { if (b.score !== a.score) return b.score - a.score; return a.trajet - b.trajet; })
      .slice(0, 8);
  }

  function ouvrirPlanB(dateKey, item) {
    setRdvAnnule({ dateKey, item });
    setPlanB(chercherPlanB(item.coords, item.client.id));
  }

  const rdvParJourCalcule = construireRdvParJour();
  const joursTries = Object.keys(planning).filter((d) => (planning[d] || []).length > 0).sort();
  const clientsFiltres = recherche.trim()
    ? clients.filter((c) => c.etablissement.toLowerCase().includes(recherche.toLowerCase()) || (c.ville || "").toLowerCase().includes(recherche.toLowerCase()))
    : clients;

  return (
    <div className="tournee-root">
      <style>{`
        .tournee-root {
          --ardoise: #1C2630; --ardoise-clair: #2A3A47; --creme: #F5F2EC;
          --orange: #E8714A; --orange-clair: #F4A07F; --vert: #5B8C6E; --vert-clair: #DCEAE0;
          --gris: #8A93A0; --gris-clair: #DCD7CB; --rouge: #C75450; --or: #C8962E;
          font-family: 'Inter', system-ui, sans-serif; background: var(--creme); color: var(--ardoise);
          min-height: 100vh; width: 100%;
        }
        .tournee-root * { box-sizing: border-box; }
        .tr-font-display { font-family: 'Oswald', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
        .tr-shell { max-width: 1180px; margin: 0 auto; padding: 28px 20px 80px; }
        .tr-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 3px solid var(--ardoise); flex-wrap: wrap; }
        .tr-title { font-size: 28px; font-weight: 600; text-transform: uppercase; line-height: 1; }
        .tr-title small { display: block; font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 500; color: var(--gris); letter-spacing: 0.06em; margin-top: 6px; text-transform: none; }
        .tr-tabs { display: flex; gap: 4px; background: var(--ardoise); padding: 4px; border-radius: 8px; flex-wrap: wrap; }
        .tr-tab { font-family: 'Oswald', sans-serif; text-transform: uppercase; font-size: 12.5px; letter-spacing: 0.03em; padding: 8px 14px; border-radius: 5px; border: none; cursor: pointer; background: transparent; color: var(--gris-clair); transition: all 0.15s ease; }
        .tr-tab.active { background: var(--orange); color: white; }
        .tr-tab:not(.active):hover { color: white; }
        .tr-tab:disabled { opacity: 0.35; cursor: not-allowed; }
        .tr-grid { display: grid; grid-template-columns: 380px 1fr; gap: 22px; }
        @media (max-width: 880px) { .tr-grid { grid-template-columns: 1fr; } }
        .tr-card { background: white; border: 1px solid var(--gris-clair); border-radius: 10px; padding: 18px; }
        .tr-card + .tr-card { margin-top: 16px; }
        .tr-card-title { font-family: 'Oswald', sans-serif; text-transform: uppercase; font-size: 13px; letter-spacing: 0.06em; color: var(--gris); margin-bottom: 12px; display: flex; align-items: center; gap: 7px; }
        .tr-field { margin-bottom: 12px; }
        .tr-label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--gris); margin-bottom: 5px; font-weight: 600; }
        .tr-input, .tr-select { width: 100%; padding: 9px 11px; border: 1.5px solid var(--gris-clair); border-radius: 6px; font-size: 14px; font-family: inherit; color: var(--ardoise); background: var(--creme); }
        .tr-input:focus, .tr-select:focus { outline: none; border-color: var(--orange); background: white; }
        .tr-btn { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; font-size: 13px; padding: 10px 16px; border-radius: 6px; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; transition: all 0.15s ease; }
        .tr-btn-primary { background: var(--orange); color: white; }
        .tr-btn-primary:hover { background: #d96138; }
        .tr-btn-primary:disabled { background: var(--gris-clair); color: var(--gris); cursor: not-allowed; }
        .tr-btn-outline { background: transparent; border: 1.5px solid var(--ardoise); color: var(--ardoise); }
        .tr-btn-outline:hover { background: var(--ardoise); color: white; }
        .tr-btn-ghost { background: transparent; border: none; color: var(--gris); }
        .tr-btn-ghost:hover { color: var(--rouge); }
        .tr-btn-full { width: 100%; }
        .tr-btn-sm { padding: 5px 10px; font-size: 11px; }
        .tr-empty { text-align: center; padding: 30px 14px; color: var(--gris); font-size: 13px; }
        .tr-alert { display: flex; align-items: flex-start; gap: 9px; padding: 11px 13px; background: #FCEEED; border: 1px solid var(--rouge); border-radius: 8px; color: #8A3530; font-size: 13px; margin-bottom: 14px; }
        .tr-toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: var(--ardoise); color: white; padding: 11px 20px; border-radius: 999px; font-size: 13px; display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 50; }
        .tr-toast.error { background: var(--rouge); }
        .tr-dropzone { border: 2.5px dashed var(--gris-clair); border-radius: 12px; padding: 50px 24px; text-align: center; cursor: pointer; transition: all 0.2s ease; background: white; }
        .tr-dropzone:hover { border-color: var(--orange); background: #FBF7F2; }
        .tr-progress-bar { height: 7px; background: var(--gris-clair); border-radius: 99px; overflow: hidden; margin-top: 10px; }
        .tr-progress-fill { height: 100%; background: var(--orange); transition: width 0.2s ease; }
        .tr-search { position: relative; margin-bottom: 12px; }
        .tr-mode-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .tr-mode-btn { font-family: 'Oswald', sans-serif; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.02em; padding: 7px 11px; border-radius: 999px; border: 1.5px solid var(--gris-clair); background: white; color: var(--ardoise); cursor: pointer; transition: all 0.15s ease; flex: 1; min-width: 90px; }
        .tr-mode-btn.active { background: var(--orange); border-color: var(--orange); color: white; }
        .tr-mode-btn:hover:not(.active) { border-color: var(--orange-clair); }
        .tr-search input { padding-left: 34px; }
        .tr-search svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--gris); }
        .tr-clients-list { max-height: 480px; overflow-y: auto; display: grid; gap: 7px; }
        .tr-client-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 7px; cursor: pointer; border: 1.5px solid var(--gris-clair); background: var(--creme); }
        .tr-client-row:hover { border-color: var(--orange-clair); background: #FBF0E9; }
        .tr-pression-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .tr-client-row-main { flex: 1; min-width: 0; }
        .tr-client-row-name { font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tr-client-row-meta { font-size: 11.5px; color: var(--gris); }
        .tr-badge { font-family: 'Oswald', sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; padding: 3px 7px; border-radius: 999px; white-space: nowrap; }
        .tr-badge-gold { background: #FBF0DA; color: var(--or); }
        .tr-badge-default { background: var(--gris-clair); color: var(--ardoise); }
        .tr-sugg-list { display: grid; gap: 12px; }
        .tr-sugg-card { position: relative; background: white; border: 1.5px solid var(--gris-clair); border-radius: 10px; padding: 16px 16px 16px 50px; cursor: pointer; transition: all 0.15s ease; }
        .tr-sugg-card:hover { border-color: var(--orange-clair); transform: translateY(-1px); }
        .tr-sugg-card.rang-1 { border-color: var(--or); background: #FFFBF1; }
        .tr-sugg-rank { position: absolute; left: 14px; top: 16px; width: 26px; height: 26px; border-radius: 50%; background: var(--ardoise); color: white; font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
        .tr-sugg-card.rang-1 .tr-sugg-rank { background: var(--or); }
        .tr-sugg-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
        .tr-sugg-jour { font-family: 'Oswald', sans-serif; text-transform: capitalize; font-size: 15px; font-weight: 600; }
        .tr-sugg-cout { font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 600; color: var(--orange); background: #FBEFE9; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
        .tr-sugg-card.rang-1 .tr-sugg-cout { background: #FBF0DA; color: var(--or); }
        .tr-sugg-detail { font-size: 13px; color: var(--gris); line-height: 1.5; }
        .tr-sugg-detail strong { color: var(--ardoise); }
        .tr-sugg-time { font-family: 'Oswald', sans-serif; font-size: 13px; color: var(--ardoise); margin-top: 6px; }
        .tr-jour-block { margin-bottom: 14px; }
        .tr-jour-block-head { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: var(--ardoise); color: white; border-radius: 8px 8px 0 0; font-family: 'Oswald', sans-serif; text-transform: capitalize; font-size: 13px; letter-spacing: 0.02em; gap: 8px; flex-wrap: wrap; }
        .tr-jour-block-body { border: 1px solid var(--gris-clair); border-top: none; border-radius: 0 0 8px 8px; padding: 8px 12px; }
        .tr-stop-line { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px dashed var(--gris-clair); font-size: 13px; flex-wrap: wrap; }
        .tr-stop-line:last-child { border-bottom: none; }
        .tr-stop-line-time { font-family: 'Oswald', sans-serif; font-weight: 600; min-width: 50px; }
        .tr-stop-line-name { flex: 1; font-weight: 600; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tr-stop-line-trajet { color: var(--gris); font-size: 11px; white-space: nowrap; }
        .tr-stop-line-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
        .tr-modal-overlay { position: fixed; inset: 0; background: rgba(28,38,48,0.55); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px; }
        .tr-modal { background: white; border-radius: 12px; padding: 22px; max-width: 560px; width: 100%; max-height: 85vh; overflow-y: auto; }
        .tr-modal-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .tr-planb-item { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 8px; border: 1px solid var(--gris-clair); margin-bottom: 8px; }
        .tr-planb-rank { width: 22px; height: 22px; border-radius: 50%; background: var(--ardoise); color: white; font-family: 'Oswald', sans-serif; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .tr-creneau-retenu { background: #F0F7F3; border: 1.5px solid var(--vert); border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .tr-creneau-retenu-info { font-size: 13px; }
        .tr-creneau-retenu-info strong { display: block; font-size: 14px; color: var(--ardoise); margin-bottom: 2px; }
        .tr-creneau-retenu-info span { color: var(--gris); }
      `}</style>

      <div className="tr-shell">
        <header className="tr-header">
          <div className="tr-title tr-font-display">
            Tournée
            <small>
              Code {code} ·{" "}
              {syncTick.dernier === "ok" ? "Synchronisé" : syncTick.dernier === "erreur" ? "Échec de synchro" : "Prochain RDV optimal · Plan B en cas d'imprévu"}
            </small>
          </div>
          <div className="tr-tabs">
            <button className={`tr-tab ${vue === "import" ? "active" : ""}`} onClick={() => setVue("import")}>Base clients</button>
            <button className={`tr-tab ${vue === "prochain-rdv" ? "active" : ""}`} onClick={() => setVue("prochain-rdv")} disabled={clients.length === 0}>Prochain RDV</button>
            <button className={`tr-tab ${vue === "semaine" ? "active" : ""}`} onClick={() => setVue("semaine")} disabled={clients.length === 0}>Ma semaine</button>
            <button className={`tr-tab ${vue === "agenda" ? "active" : ""}`} onClick={() => setVue("agenda")} disabled={clients.length === 0}>Agenda</button>
            <button className="tr-tab" onClick={onDeconnecter} title="Changer d'espace">⎋</button>
          </div>
        </header>

        {/* VUE : IMPORT */}
        {vue === "import" && (
          <div className="tr-grid">
            <div className="tr-card">
              <div className="tr-card-title"><Upload size={14} /> Importer la base clients</div>
              <div className="tr-dropzone" onClick={() => fileInputRef.current?.click()}>
                <Upload size={28} style={{ opacity: 0.4, marginBottom: 10 }} />
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{clients.length > 0 ? "Réimporter un fichier à jour" : "Cliquer pour importer ton fichier Excel"}</div>
                <div style={{ fontSize: 12, color: "var(--gris)" }}>Format .xlsx — colonnes ID Client, Etablissement, CP, Ville...</div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />
              </div>
              {importStatus === "lecture" && <div style={{ marginTop: 14, fontSize: 13, color: "var(--gris)" }}>Lecture du fichier...</div>}
              {importStatus === "geocodage" && geocodageProgress && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, color: "var(--gris)" }}>Localisation des villes ({geocodageProgress.fait}/{geocodageProgress.total})</div>
                  <div className="tr-progress-bar"><div className="tr-progress-fill" style={{ width: `${geocodageProgress.total ? (100 * geocodageProgress.fait) / geocodageProgress.total : 100}%` }} /></div>
                </div>
              )}
              {importStatus === "synchronisation" && <div style={{ marginTop: 14, fontSize: 13, color: "var(--gris)" }}>Envoi vers le serveur partagé...</div>}
              {importStatus === "termine" && (
                <div style={{ marginTop: 14, fontSize: 13, color: "var(--vert)", display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={15} /> {clients.length} clients prêts et synchronisés
                </div>
              )}
              {erreur && <div className="tr-alert" style={{ marginTop: 14, marginBottom: 0 }}><AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{erreur}</span></div>}

              {/* Bloc regéocodage */}
              {clients.length > 0 && (() => {
                const sansCoords = clients.filter(c => !c.coords).length;
                return (
                  <div style={{ marginTop: 16, padding: "12px 14px", background: sansCoords > 0 ? "#FBF0E9" : "#F0F7F3", borderRadius: 8, border: `1px solid ${sansCoords > 0 ? "var(--orange-clair)" : "var(--vert-clair)"}` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: sansCoords > 0 ? "var(--orange)" : "var(--vert)" }}>
                      {sansCoords > 0 ? `⚠️ ${sansCoords} client${sansCoords > 1 ? "s" : ""} non localisé${sansCoords > 1 ? "s" : ""}` : "✓ Tous les clients sont localisés"}
                    </div>
                    {sansCoords > 0 && (
                      <div style={{ fontSize: 12, color: "var(--gris)", marginBottom: 10, lineHeight: 1.5 }}>
                        Ces clients ne peuvent pas être inclus dans le calcul de trajets ni exportés vers Google Agenda.
                      </div>
                    )}
                    {regeoStatut?.enCours && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, color: "var(--gris)", marginBottom: 5 }}>Localisation en cours... {regeoStatut.fait}/{regeoStatut.total}</div>
                        <div className="tr-progress-bar"><div className="tr-progress-fill" style={{ width: `${regeoStatut.total ? 100 * regeoStatut.fait / regeoStatut.total : 0}%` }} /></div>
                      </div>
                    )}
                    {regeoStatut && !regeoStatut.enCours && (
                      <div style={{ fontSize: 12, color: "var(--vert)", marginBottom: 8 }}>
                        <CheckCircle2 size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
                        {regeoStatut.localises > 0 ? `${regeoStatut.localises} client${regeoStatut.localises > 1 ? "s" : ""} localisé${regeoStatut.localises > 1 ? "s" : ""}` : "Aucun nouveau client localisé — vérifier les CP/villes"}
                      </div>
                    )}
                    {sansCoords > 0 && !regeoStatut?.enCours && (
                      <button className="tr-btn tr-btn-outline tr-btn-full" onClick={regeocoder} style={{ fontSize: 12 }}>
                        <MapPin size={13} /> Localiser les {sansCoords} clients manquants
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="tr-card">
              <div className="tr-card-title"><MapPin size={14} /> Carnet clients {clients.length > 0 ? `(${clients.length})` : ""}</div>
              {clients.length === 0 ? (
                <div className="tr-empty">Importe ton fichier pour voir apparaître ta base clients ici.</div>
              ) : (
                <>
                  <div className="tr-search">
                    <Search size={15} />
                    <input className="tr-input" placeholder="Rechercher un établissement ou une ville..." value={recherche} onChange={(e) => setRecherche(e.target.value)} />
                  </div>
                  <div className="tr-clients-list">
                    {clientsFiltres.slice(0, 80).map((c) => (
                      <div key={c.id} className="tr-client-row">
                        <span className="tr-pression-dot" style={{ background: PRESSION_COLOR[c.pression] || "var(--gris)" }}></span>
                        <div className="tr-client-row-main">
                          <div className="tr-client-row-name">{c.etablissement}</div>
                          <div className="tr-client-row-meta">{c.ville} {c.coords ? "" : "· non localisé"}</div>
                        </div>
                        {c.ciblage && <span className={`tr-badge ${["GOLD", "PLATINIUM", "COMPTE CLE"].includes(c.ciblage) ? "tr-badge-gold" : "tr-badge-default"}`}>{c.ciblage}</span>}
                      </div>
                    ))}
                  </div>
                  {clientsFiltres.length > 80 && <div style={{ fontSize: 12, color: "var(--gris)", marginTop: 8, textAlign: "center" }}>{clientsFiltres.length - 80} autres résultats, affine ta recherche</div>}
                </>
              )}
            </div>
          </div>
        )}

        {/* VUE : PROCHAIN RDV */}
        {vue === "prochain-rdv" && (
          <div className="tr-grid">
            <div className="tr-card">
              <div className="tr-card-title"><Sparkles size={14} /> Choisir un client</div>
              <div className="tr-field">
                <label className="tr-label">Type de recherche</label>
                <div className="tr-mode-row">
                  <button className={`tr-mode-btn ${modeRecherche === "urgent" ? "active" : ""}`} onClick={() => setModeRecherche("urgent")}>Urgent — dès que possible</button>
                  <button className={`tr-mode-btn ${modeRecherche === "suivi" ? "active" : ""}`} onClick={() => setModeRecherche("suivi")}>Suivi régulier</button>
                </div>
                <div className="tr-mode-row" style={{ marginTop: 6 }}>
                  <button className={`tr-mode-btn ${modeRecherche === "semaine" ? "active" : ""}`} onClick={() => setModeRecherche("semaine")}>Semaine en cours</button>
                  <button className={`tr-mode-btn ${modeRecherche === "date" ? "active" : ""}`} onClick={() => setModeRecherche("date")}>Date précise</button>
                </div>
              </div>
              {modeRecherche === "suivi" && (
                <div className="tr-field">
                  <label className="tr-label">Revoir ce client tous les...</label>
                  <div className="tr-mode-row">
                    <button className={`tr-mode-btn ${horizonJours === 30 ? "active" : ""}`} onClick={() => setHorizonJours(30)}>1 mois</button>
                    <button className={`tr-mode-btn ${horizonJours === 90 ? "active" : ""}`} onClick={() => setHorizonJours(90)}>3 mois</button>
                    <button className={`tr-mode-btn ${horizonJours === 180 ? "active" : ""}`} onClick={() => setHorizonJours(180)}>6 mois</button>
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--gris)", marginTop: 6, marginBottom: 0 }}>L'appli vise une date autour de cet intervalle après la dernière visite.</p>
                </div>
              )}
              {modeRecherche === "date" && (
                <div className="tr-field">
                  <label className="tr-label">Date souhaitée</label>
                  <input className="tr-input" type="date" value={dateChoisie} min={dateToKey(new Date())} onChange={(e) => setDateChoisie(e.target.value)} />
                </div>
              )}
              <div className="tr-search">
                <Search size={15} />
                <input className="tr-input" placeholder="Rechercher un établissement ou une ville..." value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              </div>
              <div className="tr-clients-list">
                {clientsFiltres.slice(0, 60).map((c) => (
                  <div key={c.id} className="tr-client-row" onClick={() => {
                    if (modeRecherche === "date" && !dateChoisie) { setErreur("Choisis d'abord une date."); return; }
                    const mode = modeRecherche === "urgent" ? { type: "urgent" } : modeRecherche === "suivi" ? { type: "suivi", jours: horizonJours, derniereVisite: c.derniereVisite } : modeRecherche === "date" ? { type: "date", date: dateChoisie } : { type: "semaine" };
                    chercherCreneau(c, mode);
                  }}>
                    <span className="tr-pression-dot" style={{ background: PRESSION_COLOR[c.pression] || "var(--gris)" }}></span>
                    <div className="tr-client-row-main">
                      <div className="tr-client-row-name">{c.etablissement}</div>
                      <div className="tr-client-row-meta">{c.ville} {c.derniereVisite ? `· vu le ${formatDateCourt(c.derniereVisite)}` : "· jamais vu"}</div>
                    </div>
                    {c.ciblage && <span className={`tr-badge ${["GOLD", "PLATINIUM", "COMPTE CLE"].includes(c.ciblage) ? "tr-badge-gold" : "tr-badge-default"}`}>{c.ciblage}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              {erreur && <div className="tr-alert"><AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{erreur}</span></div>}
              {calcEnCours && <div className="tr-card"><div className="tr-empty"><RefreshCw size={22} style={{ marginBottom: 8, opacity: 0.5 }} /><br />Recherche du meilleur créneau...</div></div>}

              {/* BANDEAU CRÉNEAU RETENU + BOUTON AGENDA */}
              {creneauRetenu && !suggestions && !calcEnCours && (
                <div className="tr-creneau-retenu">
                  <div className="tr-creneau-retenu-info">
                    <strong>✓ {creneauRetenu.client.etablissement}</strong>
                    <span>Planifié le {formatDateFr(creneauRetenu.sugg.jour)} à {minToHHMM(creneauRetenu.sugg.arrivee)}</span>
                  </div>
                  <BoutonAgenda
                    pharmacie={creneauRetenu.client}
                    date={creneauRetenu.sugg.jour}
                    heure={minToHHMMInput(creneauRetenu.sugg.arrivee)}
                    duree={creneauRetenu.client.dureeDefaut || 20}
                  />
                </div>
              )}

              {!suggestions && !calcEnCours && !erreur && !creneauRetenu && (
                <div className="tr-card"><div className="tr-empty"><Sparkles size={26} style={{ marginBottom: 8, opacity: 0.4 }} /><br />Sélectionne un client à gauche.<br />L'appli proposera les 3 meilleurs créneaux selon ta semaine planifiée.</div></div>
              )}
              {suggestions && clientSelectionne && !calcEnCours && (
                <div className="tr-card">
                  <div className="tr-card-title"><Trophy size={14} /> Top 3 pour {clientSelectionne.etablissement}</div>
                  <div className="tr-sugg-list">
                    {suggestions.map((s, idx) => (
                      <div key={`${s.jour}-${idx}`} className={`tr-sugg-card ${idx === 0 ? "rang-1" : ""}`} onClick={() => retenirCreneau(s)}>
                        <div className="tr-sugg-rank">{idx + 1}</div>
                        <div className="tr-sugg-top">
                          <span className="tr-sugg-jour">{formatDateFr(s.jour)}</span>
                          <span className="tr-sugg-cout">{s.coutSupplementaire <= 0 ? "Sur la route" : `+${formatMin(s.coutSupplementaire)}`}</span>
                        </div>
                        <div className="tr-sugg-detail">Entre <strong>{s.avant}</strong>{s.apres ? <> et <strong>{s.apres}</strong></> : <> (fin de journée)</>}</div>
                        <div className="tr-sugg-time"><Clock size={11} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />Arrivée à {minToHHMM(s.arrivee)} · fin à {minToHHMM(s.fin)}</div>
                      </div>
                    ))}
                  </div>
                  <button className="tr-btn tr-btn-ghost tr-btn-full" style={{ marginTop: 12 }} onClick={() => { setSuggestions(null); setClientSelectionne(null); }}>Annuler</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VUE : MA SEMAINE */}
        {vue === "semaine" && (
          <SemaineView
            departs={departs}
            definirDepartJour={definirDepartJour}
            rdvParJourCalcule={rdvParJourCalcule}
            joursTries={joursTries}
            ouvrirPlanB={ouvrirPlanB}
            domicile={domicile}
            definirDomicile={definirDomicile}
            appliquerDomicileAuJour={appliquerDomicileAuJour}
          />
        )}

        {/* VUE : AGENDA */}
        {vue === "agenda" && (
          <AgendaView
            planning={planning}
            rdvParJourCalcule={rdvParJourCalcule}
            agendaRdvs={donnees.agendaRdvs || []}
            setAgendaRdvs={setAgendaRdvs}
            codeSync={code}
            clients={clients}
          />
        )}
      </div>

      {/* MODAL PLAN B */}
      {rdvAnnule && (
        <div className="tr-modal-overlay" onClick={() => { setRdvAnnule(null); setPlanB(null); }}>
          <div className="tr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tr-modal-head">
              <div>
                <div className="tr-card-title" style={{ marginBottom: 4 }}><ShieldAlert size={14} /> Plan B</div>
                <div style={{ fontSize: 13, color: "var(--gris)" }}>{rdvAnnule.item.client.etablissement} décommandé — clients à proximité, triés par priorité puis distance</div>
              </div>
              <button className="tr-btn-ghost" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => { setRdvAnnule(null); setPlanB(null); }}><X size={18} /></button>
            </div>
            {planB && planB.length === 0 && <div className="tr-empty">Aucun client à moins de 45 min de ce point.</div>}
            {planB && planB.map((res, idx) => (
              <div className="tr-planb-item" key={res.client.id}>
                <div className="tr-planb-rank">{idx + 1}</div>
                <span className="tr-pression-dot" style={{ background: PRESSION_COLOR[res.client.pression] || "var(--gris)" }}></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{res.client.etablissement}</div>
                  <div style={{ fontSize: 11.5, color: "var(--gris)" }}>{res.client.ville} · {formatMin(res.trajet)} de trajet{res.client.derniereVisite ? ` · vu le ${formatDateCourt(res.client.derniereVisite)}` : " · jamais vu"}</div>
                </div>
                {res.client.ciblage && <span className={`tr-badge ${["GOLD", "PLATINIUM", "COMPTE CLE"].includes(res.client.ciblage) ? "tr-badge-gold" : "tr-badge-default"}`}>{res.client.ciblage}</span>}
                {res.client.tel1 && <a href={`tel:${res.client.tel1}`} className="tr-btn tr-btn-outline tr-btn-sm" style={{ flexShrink: 0 }}><Phone size={12} /></a>}
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className={`tr-toast ${toast.type === "error" ? "error" : ""}`}>
          {toast.type === "error" ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sous-composant : vue Semaine
// ============================================================
function SemaineView({ departs, definirDepartJour, rdvParJourCalcule, joursTries, ouvrirPlanB, domicile, definirDomicile, appliquerDomicileAuJour }) {
  const [nouveauJour, setNouveauJour] = useState("");
  const [adresseInput, setAdresseInput] = useState("");
  const [heureInput, setHeureInput] = useState("08:30");
  const [domicileInput, setDomicileInput] = useState(domicile ? domicile.adresse : "");
  const [domicileHeureInput, setDomicileHeureInput] = useState(domicile ? domicile.heure : "08:30");
  const [enregistrementDomicile, setEnregistrementDomicile] = useState(false);

  const aujourdHui = dateToKey(new Date());
  const joursAffiches = Array.from(new Set([...joursTries, ...Object.keys(departs)])).sort();

  function ajouterDepart() {
    if (!nouveauJour || !adresseInput.trim()) return;
    definirDepartJour(nouveauJour, adresseInput.trim(), heureInput);
    setAdresseInput("");
  }

  async function sauvegarderDomicile() {
    if (!domicileInput.trim()) return;
    setEnregistrementDomicile(true);
    await definirDomicile(domicileInput.trim(), domicileHeureInput);
    setEnregistrementDomicile(false);
  }

  function utiliserDomicilePourNouveauJour() {
    if (!nouveauJour || !domicile) return;
    appliquerDomicileAuJour(nouveauJour, heureInput || domicile.heure);
  }

  return (
    <div className="tr-grid">
      <div>
        <div className="tr-card">
          <div className="tr-card-title"><MapPin size={14} /> Mon domicile (départ par défaut)</div>
          {domicile && (
            <div style={{ fontSize: 13, marginBottom: 10, padding: "8px 10px", background: "var(--vert-clair)", borderRadius: 7 }}>
              <strong>{domicile.adresse}</strong>
              <div style={{ fontSize: 11.5, color: "var(--gris)" }}>Départ habituel à {domicile.heure}</div>
            </div>
          )}
          <div className="tr-field">
            <label className="tr-label">Adresse de domicile</label>
            <input className="tr-input" placeholder="Ex. 12 rue de la Paix, Bordeaux" value={domicileInput} onChange={(e) => setDomicileInput(e.target.value)} />
          </div>
          <div className="tr-field">
            <label className="tr-label">Heure de départ habituelle</label>
            <input className="tr-input" type="time" value={domicileHeureInput} onChange={(e) => setDomicileHeureInput(e.target.value)} />
          </div>
          <button className="tr-btn tr-btn-primary tr-btn-full" onClick={sauvegarderDomicile} disabled={enregistrementDomicile}>
            <MapPin size={14} /> {enregistrementDomicile ? "Enregistrement..." : domicile ? "Mettre à jour mon domicile" : "Enregistrer mon domicile"}
          </button>
          <p style={{ fontSize: 11.5, color: "var(--gris)", marginTop: 8, marginBottom: 0 }}>Une fois enregistré, tu pourras l'appliquer en un clic à n'importe quel jour ci-dessous.</p>
        </div>
        <div className="tr-card">
          <div className="tr-card-title"><Calendar size={14} /> Point de départ d'un jour précis</div>
          <div className="tr-field">
            <label className="tr-label">Jour</label>
            <input className="tr-input" type="date" value={nouveauJour} min={aujourdHui} onChange={(e) => setNouveauJour(e.target.value)} />
          </div>
          {domicile && (
            <button className="tr-btn tr-btn-outline tr-btn-full" style={{ marginBottom: 12 }} onClick={utiliserDomicilePourNouveauJour} disabled={!nouveauJour}>
              <MapPin size={14} /> Utiliser mon domicile pour ce jour
            </button>
          )}
          <div className="tr-field">
            <label className="tr-label">Ou une autre adresse de départ</label>
            <input className="tr-input" placeholder="Ex. 12 rue X, Bordeaux" value={adresseInput} onChange={(e) => setAdresseInput(e.target.value)} />
          </div>
          <div className="tr-field">
            <label className="tr-label">Heure de départ</label>
            <input className="tr-input" type="time" value={heureInput} onChange={(e) => setHeureInput(e.target.value)} />
          </div>
          <button className="tr-btn tr-btn-outline tr-btn-full" onClick={ajouterDepart}>
            <MapPin size={14} /> Enregistrer cette adresse pour ce jour
          </button>
        </div>
      </div>
      <div className="tr-card">
        <div className="tr-card-title"><Calendar size={14} /> Vue de la semaine</div>
        {joursAffiches.length === 0 ? (
          <div className="tr-empty">Aucun jour planifié. Commence par définir ton domicile ou un point de départ à gauche.</div>
        ) : (
          joursAffiches.map((dateKey) => {
            const depart = departs[dateKey];
            const seq = rdvParJourCalcule[dateKey] || [];
            return (
              <div className="tr-jour-block" key={dateKey}>
                <div className="tr-jour-block-head">
                  <span>{formatDateFr(dateKey)}</span>
                  <span>{seq.length} RDV{depart ? ` · départ ${depart.heure}` : ""}</span>
                </div>
                <div className="tr-jour-block-body">
                  {!depart && <div style={{ fontSize: 12.5, color: "var(--gris)", padding: "6px 0" }}>Pas de point de départ défini pour ce jour</div>}
                  {seq.length === 0 && depart && <div style={{ fontSize: 12.5, color: "var(--gris)", padding: "6px 0" }}>Aucun RDV ce jour</div>}
                  {seq.map((item) => (
                    <div className="tr-stop-line" key={item.client.id}>
                      <span className="tr-pression-dot" style={{ background: PRESSION_COLOR[item.client.pression] || "var(--gris)" }}></span>
                      <span className="tr-stop-line-time">{minToHHMM(item.heureArrivee)}</span>
                      <span className="tr-stop-line-name">{item.client.etablissement}</span>
                      <span className="tr-stop-line-trajet">{item.client.ville}</span>
                      <div className="tr-stop-line-actions">
                        {/* Bouton Google Agenda sur chaque RDV de Ma semaine */}
                        <BoutonAgenda
                          pharmacie={item.client}
                          date={dateKey}
                          heure={minToHHMMInput(item.heureArrivee)}
                          duree={item.client.dureeDefaut || 20}
                        />
                        <button className="tr-btn tr-btn-outline tr-btn-sm" onClick={() => ouvrirPlanB(dateKey, item)}>
                          <ShieldAlert size={12} /> Lapin
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
