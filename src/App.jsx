import React, { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { MapPin, Clock, Upload, RefreshCw, Calendar, AlertCircle, CheckCircle2, Sparkles, Trophy, ShieldAlert, Phone, Mail, History, X, Search, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import AgendaView from "./AgendaView";
import AssistantVocal from "./components/AssistantVocal";
import FicheClient, { BadgeContactManquant } from "./components/FicheClient";
import BoutonAgenda from "./components/BoutonAgenda";

// ============================================================
// Constantes
// ============================================================
const VITESSE_MOYENNE_KMH = 38;
const COEF_ROUTE = 1.3;
const JOURNEE_DEBUT = 9 * 60;
const JOURNEE_FIN = 17 * 60 + 30;

const PRESSION_SCORE = { Rouge: 3, Orange: 2, Vert: 1 };

const MODELE_EMAIL_DEFAUT = {
  sujetVous: "Proposition de rendez-vous — {etablissement}",
  corpsVous: "Bonjour{prenom},\n\nJe vous propose les créneaux suivants pour notre prochain rendez-vous à {etablissement} :\n\n{creneaux}\n\nMerci de choisir celui qui vous convient via ce lien :\n{lien}\n\nCordialement",
  sujetTu: "Proposition de rendez-vous — {etablissement}",
  corpsTu: "Salut{prenom},\n\nJe te propose les créneaux suivants pour notre prochain rendez-vous à {etablissement} :\n\n{creneaux}\n\nMerci de choisir celui qui te convient via ce lien :\n{lien}\n\nÀ bientôt",
};

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
const CIBLAGE_ELIGIBLE_SUGGESTIONS = ["COMPTE CLE", "PLATINIUM", "GOLD", "SILVER", "BRONZE", "PROSPECTS 1"];

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

// Calcul d'itinéraire routier réel (via OSRM, gratuit, sans clé) — utilisé uniquement sur une courte
// short-list de candidats déjà présélectionnés à vol d'oiseau, pour ne pas multiplier les appels réseau.
// Se replie automatiquement sur l'estimation à vol d'oiseau si le service est indisponible.
const _cacheTrajetReel = {};
async function estimerTrajetMinReel(a, b) {
  if (!a || !b) return null;
  const cle = `${a.lat.toFixed(3)},${a.lon.toFixed(3)}|${b.lat.toFixed(3)},${b.lon.toFixed(3)}`;
  if (_cacheTrajetReel[cle] !== undefined) return _cacheTrajetReel[cle];
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("routage indisponible");
    const data = await res.json();
    if (!data.routes || !data.routes[0]) throw new Error("aucun itinéraire trouvé");
    const minutes = Math.max(3, Math.round(data.routes[0].duration / 60));
    _cacheTrajetReel[cle] = minutes;
    return minutes;
  } catch {
    const repli = estimerTrajetMin(a, b);
    _cacheTrajetReel[cle] = repli;
    return repli;
  }
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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}

// Calcule Pâques (algorithme de Meeus/Jones/Butcher) puis en déduit les jours fériés mobiles
function joursFeriesFrancais(annee) {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  const paques = new Date(annee, mois - 1, jour);
  function plusJours(date, n) { const d2 = new Date(date); d2.setDate(d2.getDate() + n); return d2; }
  const feries = [
    new Date(annee, 0, 1),   // Jour de l'an
    plusJours(paques, 1),    // Lundi de Pâques
    new Date(annee, 4, 1),   // Fête du travail
    new Date(annee, 4, 8),   // Victoire 1945
    plusJours(paques, 39),   // Ascension
    plusJours(paques, 50),   // Lundi de Pentecôte
    new Date(annee, 6, 14),  // Fête nationale
    new Date(annee, 7, 15),  // Assomption
    new Date(annee, 10, 1),  // Toussaint
    new Date(annee, 10, 11), // Armistice
    new Date(annee, 11, 25), // Noël
  ];
  return new Set(feries.map(d2 => dateToKey(d2)));
}
const _CACHE_FERIES = {};
function estJourFerieFR(dateKey) {
  const annee = parseInt(dateKey.slice(0, 4), 10);
  if (!_CACHE_FERIES[annee]) _CACHE_FERIES[annee] = joursFeriesFrancais(annee);
  return _CACHE_FERIES[annee].has(dateKey);
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
  const majLe = new Date().toISOString();
  const res = await supabaseFetch(`tournee_donnees?on_conflict=code`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ code, donnees, maj_le: majLe }),
  });
  if (res.ok) {
    try { localStorage.setItem('tournee_maj_le', majLe); } catch {}
  }
  return res.ok;
}

async function codeExisteDeja(code) {
  const res = await supabaseFetch(`tournee_donnees?code=eq.${code}&select=code`);
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

// ============================================================
// Propositions de créneaux (réservation client par email)
// ============================================================
async function creerPropositionRdv({ code, clientId, clientNom, creneaux }) {
  const res = await supabaseFetch(`propositions_rdv`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ code, client_id: clientId, client_nom: clientNom, creneaux, statut: "en_attente" }),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function chargerPropositionRdv(id) {
  const res = await supabaseFetch(`propositions_rdv?id=eq.${id}&select=*`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function confirmerPropositionRdv(id, choix) {
  const res = await supabaseFetch(`propositions_rdv?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ statut: "confirme", choix }),
  });
  return res.ok;
}

async function annulerPropositionRdv(id) {
  const res = await supabaseFetch(`propositions_rdv?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ statut: "annulee" }),
  });
  return res.ok;
}

async function chargerToutesPropositions(code) {
  const res = await supabaseFetch(`propositions_rdv?code=eq.${code}&select=*&order=created_at.desc`);
  if (!res.ok) return [];
  return res.json();
}

// ============================================================
// Offres commerciales ponctuelles envoyées à plusieurs pharmacies
// ============================================================
async function creerOffresClients(lignes) {
  const res = await supabaseFetch(`offres_clients`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(lignes),
  });
  if (!res.ok) return null;
  return res.json();
}

async function chargerOffre(id) {
  const res = await supabaseFetch(`offres_clients?id=eq.${id}&select=*`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function repondreOffre(id, statut) {
  const res = await supabaseFetch(`offres_clients?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ statut, reponse_le: new Date().toISOString() }),
  });
  return res.ok;
}

async function chargerToutesOffres(code) {
  const res = await supabaseFetch(`offres_clients?code=eq.${code}&select=*&order=created_at.desc`);
  if (!res.ok) return [];
  return res.json();
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
    periodesBloquees: lireLocal("tournee_periodes", []),
    preferencesEmail: lireLocal("tournee_prefs_email", { formule: "vous", ...MODELE_EMAIL_DEFAUT }),
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
    ecrireLocal("tournee_periodes", next.periodesBloquees || []);
    ecrireLocal("tournee_prefs_email", next.preferencesEmail || { formule: "vous", ...MODELE_EMAIL_DEFAUT });
  }, []);

  const pousserVersSupabase = useCallback(
    (next) => {
      if (!code) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        sauvegarderDonneesDistantes(code, next).then((ok) => {
          setSyncTick((t) => ({ ...t, dernier: ok ? "ok" : "erreur", heure: Date.now() }));
        });
      }, 300);
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
    latitude: colIdx("Latitude"),
    longitude: colIdx("Longitude"),
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
      coords: (idx.latitude !== -1 && idx.longitude !== -1 && r[idx.latitude] && r[idx.longitude])
        ? { lat: parseFloat(r[idx.latitude]), lon: parseFloat(r[idx.longitude]) }
        : null,
      dureeDefaut: 45,
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
// ============================================================
// Page publique de réservation (lien envoyé par email au client)
// ============================================================
function creneauxSeChevauchent(debutA, finA, debutB, finB) {
  return hhmmToMin(debutA) < hhmmToMin(finB) && hhmmToMin(debutB) < hhmmToMin(finA);
}

function PageReservation({ id }) {
  const [proposition, setProposition] = useState(undefined); // undefined = chargement, null = introuvable
  const [creneauxEtat, setCreneauxEtat] = useState([]); // [{...creneau, disponible}]
  const [confirme, setConfirme] = useState(null); // creneau confirmé, ou null
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const prop = await chargerPropositionRdv(id);
      if (!prop) { setProposition(null); return; }
      setProposition(prop);
      if ((prop.statut === "confirme" || prop.statut === "confirme_vu") && prop.choix) {
        setConfirme(prop.choix);
        return;
      }
      await rafraichirDisponibilites(prop);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function rafraichirDisponibilites(prop) {
    let donnees = null;
    try { donnees = await chargerDonneesDistantes(prop.code); } catch {}
    const occupationsParJour = {};
    (donnees?.agendaRdvs || []).forEach(r => {
      if (!r.jour || !r.debut || !r.fin) return;
      (occupationsParJour[r.jour] = occupationsParJour[r.jour] || []).push({ debut: r.debut, fin: r.fin });
    });
    Object.keys(donnees?.planning || {}).forEach(jour => {
      (donnees.planning[jour] || []).forEach(v => {
        if (v.heureArrivee == null || v.heureFin == null) return;
        (occupationsParJour[jour] = occupationsParJour[jour] || []).push({ debut: minToHHMMInput(v.heureArrivee), fin: minToHHMMInput(v.heureFin) });
      });
    });
    const enrichis = (prop.creneaux || []).map(c => {
      const occ = occupationsParJour[c.jour] || [];
      const dispo = !occ.some(o => creneauxSeChevauchent(c.debut, c.fin, o.debut, o.fin));
      return { ...c, disponible: dispo };
    });
    setCreneauxEtat(enrichis);
  }

  async function choisirCreneau(creneau) {
    setEnCours(true);
    setMessage("");
    // Revérification en temps réel juste avant de valider, pour éviter un double-booking
    let donnees = null;
    try { donnees = await chargerDonneesDistantes(proposition.code); } catch {}
    const occ = [
      ...((donnees?.agendaRdvs || []).filter(r => r.jour === creneau.jour).map(r => ({ debut: r.debut, fin: r.fin }))),
      ...((donnees?.planning?.[creneau.jour] || []).filter(v => v.heureArrivee != null).map(v => ({ debut: minToHHMMInput(v.heureArrivee), fin: minToHHMMInput(v.heureFin) }))),
    ];
    const encoreLibre = !occ.some(o => creneauxSeChevauchent(creneau.debut, creneau.fin, o.debut, o.fin));

    if (!encoreLibre) {
      setMessage("Ce créneau vient d'être pris entre-temps. Merci d'en choisir un autre parmi ceux encore disponibles ci-dessous.");
      await rafraichirDisponibilites(proposition);
      setEnCours(false);
      return;
    }

    const next = {
      ...donnees,
      planning: {
        ...(donnees?.planning || {}),
        [creneau.jour]: [...(donnees?.planning?.[creneau.jour] || []), {
          clientId: proposition.client_id,
          heureArrivee: hhmmToMin(creneau.debut),
          heureFin: hhmmToMin(creneau.fin),
        }],
      },
      clients: (donnees?.clients || []).map(c => c.id === proposition.client_id ? { ...c, prochainRdv: creneau.jour, statutRdv: "Fixe" } : c),
    };
    const ok = await sauvegarderDonneesDistantes(proposition.code, next);
    if (ok) {
      await confirmerPropositionRdv(proposition.id, creneau);
      setConfirme(creneau);
    } else {
      setMessage("Erreur lors de l'enregistrement. Merci de réessayer.");
    }
    setEnCours(false);
  }

  const S2 = {
    root: { fontFamily:"'Inter',system-ui,sans-serif", background:"#F5F2EC", minHeight:"100vh", color:"#1C2630", display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
    card: { background:"white", border:"1px solid #DCD7CB", borderRadius:12, padding:26, maxWidth:440, width:"100%" },
    title: { fontFamily:"'Oswald',sans-serif", fontSize:22, fontWeight:600, textTransform:"uppercase", marginBottom:6 },
    sub: { fontSize:13, color:"#8A93A0", marginBottom:20 },
    slot: (dispo) => ({
      display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
      padding:"14px 16px", borderRadius:8, border:"1.5px solid", marginBottom:10,
      borderColor: dispo ? "#DCD7CB" : "#F0EDE7", background: dispo ? "#F5F2EC" : "#FAFAF8",
      opacity: dispo ? 1 : 0.55,
    }),
    btn: { fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:12, padding:"9px 14px", borderRadius:6, border:"none", cursor:"pointer", background:"#E8714A", color:"white", flexShrink:0 },
  };

  if (proposition === undefined) {
    return <div style={S2.root}><div style={{ color:"#8A93A0" }}>Chargement...</div></div>;
  }
  if (proposition === null) {
    return (
      <div style={S2.root}>
        <div style={S2.card}>
          <div style={S2.title}>Lien invalide</div>
          <div style={S2.sub}>Ce lien de réservation n'existe pas ou a expiré. Contacte directement ton interlocuteur.</div>
        </div>
      </div>
    );
  }
  if (confirme) {
    return (
      <div style={S2.root}>
        <div style={S2.card}>
          <div style={S2.title}>✓ Rendez-vous confirmé</div>
          <div style={{ fontSize:14, marginBottom:4 }}>{proposition.client_nom}</div>
          <div style={{ fontSize:15, fontWeight:600, marginTop:10 }}>{formatDateFr(confirme.jour)}</div>
          <div style={{ fontSize:14, color:"#8A93A0" }}>à {confirme.debut.replace(":", "h")}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={S2.root}>
      <div style={S2.card}>
        <div style={S2.title}>Choisir un créneau</div>
        <div style={S2.sub}>{proposition.client_nom} — sélectionne le rendez-vous qui te convient</div>
        {message && <div style={{ background:"#FCEEED", border:"1px solid #C75450", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#8A3530", marginBottom:14 }}>{message}</div>}
        {creneauxEtat.map((c, i) => (
          <div key={i} style={S2.slot(c.disponible)}>
            <div>
              <div style={{ fontWeight:600, fontSize:14, textTransform:"capitalize" }}>{formatDateFr(c.jour)}</div>
              <div style={{ fontSize:13, color:"#8A93A0" }}>{c.debut.replace(":", "h")} – {c.fin.replace(":", "h")}</div>
            </div>
            {c.disponible ? (
              <button style={S2.btn} onClick={() => choisirCreneau(c)} disabled={enCours}>
                {enCours ? "..." : "Choisir"}
              </button>
            ) : (
              <span style={{ fontSize:11, fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", color:"#C75450" }}>Complet</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Page publique de réponse à une offre commerciale (accepter/refuser)
// ============================================================
function PageOffre({ id }) {
  const [offre, setOffre] = useState(undefined); // undefined = chargement, null = introuvable
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    (async () => {
      const o = await chargerOffre(id);
      setOffre(o);
    })();
  }, [id]);

  async function repondre(statut) {
    setEnCours(true);
    const ok = await repondreOffre(id, statut);
    if (ok) setOffre(prev => ({ ...prev, statut, reponse_le: new Date().toISOString() }));
    setEnCours(false);
  }

  const S2 = {
    root: { fontFamily:"'Inter',system-ui,sans-serif", background:"#F5F2EC", minHeight:"100vh", color:"#1C2630", display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
    card: { background:"white", border:"1px solid #DCD7CB", borderRadius:12, padding:26, maxWidth:460, width:"100%" },
    title: { fontFamily:"'Oswald',sans-serif", fontSize:22, fontWeight:600, textTransform:"uppercase", marginBottom:6 },
    sub: { fontSize:13, color:"#8A93A0", marginBottom:20 },
    btn: (bg) => ({ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:13, padding:"12px 16px", borderRadius:8, border:"none", cursor:"pointer", background:bg, color:"white", flex:1 }),
  };

  if (offre === undefined) return <div style={S2.root}><div style={{ color:"#8A93A0" }}>Chargement...</div></div>;
  if (offre === null) {
    return (
      <div style={S2.root}>
        <div style={S2.card}>
          <div style={S2.title}>Lien invalide</div>
          <div style={S2.sub}>Cette offre n'existe pas ou a expiré. Contacte directement ton interlocuteur.</div>
        </div>
      </div>
    );
  }
  if (offre.statut === "accepte" || offre.statut === "refuse") {
    return (
      <div style={S2.root}>
        <div style={S2.card}>
          <div style={S2.title}>{offre.statut === "accepte" ? "✓ Offre acceptée" : "Offre déclinée"}</div>
          <div style={{ fontSize:14, color:"#8A93A0" }}>Merci pour votre réponse, elle a bien été enregistrée.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={S2.root}>
      <div style={S2.card}>
        {offre.offre_image_url && (
          <img src={offre.offre_image_url} alt="" style={{ width:"100%", borderRadius:8, marginBottom:16, display:"block", objectFit:"cover", maxHeight:280 }}
            onError={(e) => { e.target.style.display = "none"; }} />
        )}
        <div style={S2.title}>{offre.offre_titre}</div>
        <div style={S2.sub}>{offre.client_nom}</div>
        <div style={{ fontSize:14, lineHeight:1.6, whiteSpace:"pre-wrap", marginBottom:24, color:"#1C2630" }}>{offre.offre_description}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button style={S2.btn("#5B8C6E")} onClick={() => repondre("accepte")} disabled={enCours}>
            {enCours ? "..." : "✓ J'accepte"}
          </button>
          <button style={S2.btn("#C75450")} onClick={() => repondre("refuse")} disabled={enCours}>
            {enCours ? "..." : "Décliner"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Composant racine
// ============================================================
export default function Root() {
  const [code, setCode] = useState(() => lireLocal("tournee_code", null));
  const reservationId = (() => {
    try { return new URLSearchParams(window.location.search).get("reservation"); } catch { return null; }
  })();
  const offreId = (() => {
    try { return new URLSearchParams(window.location.search).get("offre"); } catch { return null; }
  })();

  function seDeconnecter() {
    window.localStorage.removeItem("tournee_code");
    setCode(null);
  }

  function onConnecte(c) {
    ecrireLocal("tournee_code", c);
    setCode(c);
  }

  if (reservationId) return <PageReservation id={reservationId} />;
  if (offreId) return <PageOffre id={offreId} />;
  if (!code) return <EcranConnexion onConnecte={onConnecte} />;
  return <App code={code} onDeconnecter={seDeconnecter} />;
}

// ============================================================
// Composant principal
// ============================================================
function App({ code, onDeconnecter }) {
  const [syncTick, setSyncTick] = useState({ dernier: null, heure: null });
  const { donnees, update, remplacerTout, setDonneesEtPersist, forcerSyncMaintenant } = useSyncedState(code, syncTick, setSyncTick);
  const { clients, geoCache, planning, departs, domicile, preferencesEmail } = donnees;
  const setClients = useCallback((u) => update("clients", u), [update]);
  const setGeoCache = useCallback((u) => update("geoCache", u), [update]);
  const setPlanning = useCallback((u) => update("planning", u), [update]);
  const setDeparts = useCallback((u) => update("departs", u), [update]);
  const setDomicile = useCallback((u) => update("domicile", u), [update]);
  const setAgendaRdvs = useCallback((u) => update("agendaRdvs", u), [update]);
  const setPreferencesEmail = useCallback((u) => update("preferencesEmail", u), [update]);

  const [chargementInitial, setChargementInitial] = useState(true);

  // Forcer la synchro avant de quitter la page
  useEffect(() => {
    const handleUnload = () => { forcerSyncMaintenant(); };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [forcerSyncMaintenant]);

  // Forcer la synchro quand l'app passe en arrière-plan (mobile)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') forcerSyncMaintenant();
      else verifierConfirmationsRdv();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [forcerSyncMaintenant]);

  // Vérifier si des clients ont confirmé un créneau proposé par email
  useEffect(() => {
    verifierConfirmationsRdv();
    verifierRelancesEnAttente();
    const onFocus = () => { verifierConfirmationsRdv(); verifierRelancesEnAttente(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const [relancesEnAttente, setRelancesEnAttente] = useState(0);
  async function verifierRelancesEnAttente() {
    if (!code) return;
    try {
      const rows = await chargerToutesPropositions(code);
      const seuil = Date.now() - 3 * 86400000;
      const nb = (rows || []).filter(p => p.statut === "en_attente" && new Date(p.created_at).getTime() <= seuil).length;
      setRelancesEnAttente(nb);
    } catch {}
  }


  async function verifierConfirmationsRdv() {
    if (!code) return;
    try {
      const res = await supabaseFetch(`propositions_rdv?code=eq.${code}&statut=eq.confirme&select=*`);
      if (!res.ok) return;
      const rows = await res.json();
      if (rows.length === 0) return;
      const messages = rows.map(r => {
        const choix = r.choix || {};
        return `${r.client_nom} → ${formatDateFr(choix.jour)} à ${(choix.debut || "").replace(":", "h")}`;
      });
      showToast(rows.length === 1
        ? `✅ RDV confirmé : ${messages[0]}`
        : `✅ ${rows.length} RDV confirmés : ${messages.join(" · ")}`, "ok");
      for (const r of rows) {
        await supabaseFetch(`propositions_rdv?id=eq.${r.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ statut: "confirme_vu" }),
        });
      }
      // Recharger les données depuis le serveur pour refléter immédiatement le nouveau RDV dans le planning
      try {
        const distant = await chargerDonneesDistantes(code);
        if (distant) setDonneesEtPersist(() => distant);
      } catch {}
    } catch {}
  }

  useEffect(() => {
    let annule = false;
    chargerDonneesDistantes(code)
      .then((distant) => {
        if (annule || !distant) return;
        const distantMajLe = distant.maj_le ? new Date(distant.maj_le).getTime() : 0;
        const localMajLe = (() => { try { return new Date(JSON.parse(localStorage.getItem('tournee_maj_le')||'0')).getTime(); } catch { return 0; } })();
        const distantPlusRecent = distantMajLe > localMajLe;

        setDonneesEtPersist((local) => {
          // Fusionner intelligemment : toujours prendre le meilleur de chaque champ
          const mergeAgendaRdvs = () => {
            const d = distant.agendaRdvs || [];
            const l = local.agendaRdvs || [];
            if (l.length > d.length) return l;
            if (d.length > l.length) return d;
            const scoreD = d.filter(r => r.clientId).length;
            const scoreL = l.filter(r => r.clientId).length;
            return scoreL >= scoreD ? l : d;
          };
          // Toujours prendre les clients de Supabase s'ils sont plus récents ou ont plus de contacts
          const mergeClients = () => {
            const d = distant.clients || [];
            const l = local.clients || [];
            if (d.length > l.length) return d;
            if (l.length > d.length) return l;
            // Même nombre : si Supabase plus récent, prendre Supabase
            if (distantPlusRecent) return d;
            // Sinon prendre celui avec plus de contacts
            const scoreD = d.filter(c => c.mobile_titulaire || c.mail_titulaire || c.nom_contact).length;
            const scoreL = l.filter(c => c.mobile_titulaire || c.mail_titulaire || c.nom_contact).length;
            return scoreD >= scoreL ? d : l;
          };

          const clientsMerge = mergeClients();
          const agendaMerge = mergeAgendaRdvs();
          const planningMerge = Object.keys(distant.planning || {}).length > Object.keys(local.planning || {}).length
            ? distant.planning : local.planning;
          const departsMerge = Object.keys(distant.departs || {}).length > Object.keys(local.departs || {}).length
            ? distant.departs : local.departs;
          return {
            ...local,
            clients: clientsMerge,
            domicile: local.domicile || distant.domicile || null,
            agendaRdvs: agendaMerge,
            periodesBloquees: (distant.periodesBloquees || []).length > 0 ? distant.periodesBloquees : (local.periodesBloquees || []),
            planning: planningMerge,
            departs: departsMerge,
          };
        });
      })
      .then(() => {
        if (distant?.maj_le) {
          try { localStorage.setItem('tournee_maj_le', distant.maj_le); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => { if (!annule) setChargementInitial(false); });
    return () => { annule = true; };
  }, [code]);

  const [vue, setVue] = useState("import");

  useEffect(() => {
    if (vue === "reservations") verifierRelancesEnAttente();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vue]);

  const [importStatus, setImportStatus] = useState(null);
  const [geocodageProgress, setGeocodageProgress] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [clientSelectionne, setClientSelectionne] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [calcEnCours, setCalcEnCours] = useState(false);
  const [creneauxAProposer, setCreneauxAProposer] = useState(new Set());
  const [creneauxDecoucherAProposer, setCreneauxDecoucherAProposer] = useState(new Set());
  const [envoiEmailEnCours, setEnvoiEmailEnCours] = useState(false);
  const [modeRecherche, setModeRecherche] = useState("urgent");
  const [horizonJours, setHorizonJours] = useState(90);
  const [dateChoisie, setDateChoisie] = useState("");
  const [periodeDebut, setPeriodeDebut] = useState("");
  const [periodeFin, setPeriodeFin] = useState("");
  const [dureeRdv, setDureeRdv] = useState(45);
  const [heureMinRdv, setHeureMinRdv] = useState("09:00");
  const [joursExclus, setJoursExclus] = useState([]); // 1=lundi ... 5=vendredi
  const [periodeExclueDebut, setPeriodeExclueDebut] = useState("");
  const [periodeExclueFin, setPeriodeExclueFin] = useState("");
  const [showReglagesEmail, setShowReglagesEmail] = useState(false);
  const heureRefs = useRef({});
  const dureeRefs = useRef({});
  const [erreur, setErreur] = useState("");
  const [toast, setToast] = useState(null);
  const [rdvAnnule, setRdvAnnule] = useState(null);
  const [planB, setPlanB] = useState(null);
  const [creneauRetenu, setCreneauRetenu] = useState(null);
  const [conseilDecoucher, setConseilDecoucher] = useState(null);
  const [suggestionsDecoucher, setSuggestionsDecoucher] = useState([]);
  const heureRefsDecoucher = useRef({});
  const dureeRefsDecoucher = useRef({});
  const [ficheClient, setFicheClient] = useState(null);
  const periodesBloquees = donnees.periodesBloquees || [];
  const setPeriodesBloquees = useCallback((u) => update("periodesBloquees", u), [update]);
  const fileInputRef = useRef(null);

  async function sauvegarderContact(clientId, data) {
    // Mettre à jour via update() qui déclenche automatiquement pousserVersSupabase
    update("clients", (prev) =>
      prev.map((c) => c.id === clientId ? { ...c, ...data } : c)
    );
    // Attendre que le debounce parte puis forcer une synchro complète
    setTimeout(async () => {
      await forcerSyncMaintenant();
    }, 400);
    showToast("Contact enregistré ✓", "ok");
  }

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

  const [ajoutClientEnCours, setAjoutClientEnCours] = useState(false);
  async function ajouterClientManuel(champs) {
    setAjoutClientEnCours(true);
    let coords = null;
    try {
      coords = champs.adresse ? await geocoder(`${champs.adresse}, ${champs.cp} ${champs.ville}, France`) : null;
      if (!coords) coords = await geocoder(`${champs.cp} ${champs.ville}, France`);
    } catch {}
    const nouveauClient = {
      id: "manuel-" + uid(),
      pression: champs.pression || null,
      etablissement: champs.etablissement.trim(),
      nom: null,
      cp: champs.cp.trim(),
      ville: champs.ville.trim(),
      uga: null,
      derniereVisite: null,
      prochainRdv: null,
      statutRdv: null,
      groupement: null,
      contact: champs.contact?.trim() || null,
      adresse: champs.adresse?.trim() || null,
      email: champs.email?.trim() || null,
      tel1: champs.tel1?.trim() || null,
      tel2: null,
      nbVisites: 0,
      ciblage: champs.ciblage || null,
      coords,
      dureeDefaut: 45,
    };
    setClients(prev => [...prev, nouveauClient]);
    await forcerSyncMaintenant();
    setAjoutClientEnCours(false);
    if (!coords) {
      showToast(`${nouveauClient.etablissement} ajouté, mais non localisé — vérifie le CP/ville`, "error");
    } else {
      showToast(`${nouveauClient.etablissement} ajouté à la base ✓`, "ok");
    }
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
        // Si cette visite a été repositionnée manuellement dans l'Agenda (glisser-déposer),
        // on respecte cet horaire fixé plutôt que de le recalculer — sinon les suggestions
        // suivantes ignorent le vrai horaire et peuvent proposer un créneau déjà occupé.
        const override = (donnees.agendaRdvs || []).find(r => r.overrideTournee === it.client.id && r.jour === dateKey);
        if (override) {
          const arrivee = hhmmToMin(override.debut);
          const fin = hhmmToMin(override.fin);
          seq.push({ client: it.client, coords: it.coords, heureArrivee: arrivee, fin });
          curMin = fin;
          prevCoords = it.coords;
          return;
        }
        const trajet = prevCoords ? estimerTrajetMin(prevCoords, it.coords) || 0 : 0;
        curMin += trajet;
        const arrivee = curMin;
        curMin += it.client.dureeDefaut || 45;
        seq.push({ client: it.client, coords: it.coords, heureArrivee: arrivee, fin: curMin });
        prevCoords = it.coords;
      });
      out[dateKey] = seq;
    });
    return out;
  }

  async function chercherCreneau(client, mode = { type: "semaine" }, dureeVoulue, heureMinVoulue, joursExclusVoulu, periodeExclueVoulue) {
    setErreur("");
    setSuggestions(null);
    setCreneauRetenu(null);
    setCreneauxAProposer(new Set());
    setCreneauxDecoucherAProposer(new Set());
    setConseilDecoucher(null);
    setSuggestionsDecoucher([]);
    const duree = dureeVoulue || client.dureeDefaut || 45;
    const heureMinMin = heureMinVoulue ? Math.max(JOURNEE_DEBUT, hhmmToMin(heureMinVoulue)) : JOURNEE_DEBUT;
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

    function estJourOuvre(dateKey) {
      const j = new Date(dateKey + "T00:00:00").getDay();
      const estBloque = (periodesBloquees || []).some(p => dateKey >= p.debut && dateKey <= p.fin);
      return j >= 1 && j <= 5 && !estJourFerieFR(dateKey) && dateKey >= dateToKey(aujourdHuiDate) && !estBloque;
    }

    // Combine les règles générales (estJourOuvre) avec les exclusions propres à cette recherche
    // précise : jours de la semaine à éviter (ex: jamais le lundi) et période à exclure (ex: vacances scolaires du client).
    function estJourValide(dateKey) {
      if (!estJourOuvre(dateKey)) return false;
      if (mode.type === "date") return true; // choix explicite d'une date précise : pas d'exclusion supplémentaire
      if (joursExclusVoulu && joursExclusVoulu.length) {
        const jourSemaine = new Date(dateKey + "T00:00:00").getDay();
        if (joursExclusVoulu.includes(jourSemaine)) return false;
      }
      if (periodeExclueVoulue && periodeExclueVoulue.debut && periodeExclueVoulue.fin) {
        if (dateKey >= periodeExclueVoulue.debut && dateKey <= periodeExclueVoulue.fin) return false;
      }
      return true;
    }

    function ajouterFenetreJoursOuvres(joursAvecDepart, debut, fin) {
      let cur = new Date(debut);
      while (cur <= fin) {
        const jourSemaine = cur.getDay();
        if (jourSemaine >= 1 && jourSemaine <= 5) {
          const dk = dateToKey(cur);
          // Utiliser domicile si pas de départ défini
          ajouterDomicileSiAbsent(dk);
          // Inclure les jours avec RDV dans planning OU dans agendaRdvs
          const aDesRdvPlanning = (planning[dk] || []).length > 0;
          const aDesRdvAgenda = (donnees.agendaRdvs || []).some(r => r.jour === dk);
          const aDesRdv = aDesRdvPlanning || aDesRdvAgenda;
          if ((departsEtendus[dk] || aDesRdv) && !joursAvecDepart.includes(dk)) {
            if (aDesRdv && !departsEtendus[dk] && domicile) {
              departsEtendus[dk] = { adresse: domicile.adresse, coords: domicile.coords, heure: domicile.heure || "08:30" };
            }
            if (departsEtendus[dk]) joursAvecDepart.push(dk);
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    let joursAvecDepart = [];
    let borneElargissement = null; // date à partir de laquelle on élargit si trop peu de résultats
    if (mode.type === "date") {
      ajouterDomicileSiAbsent(mode.date);
      joursAvecDepart = Object.keys(departsEtendus).filter((d) => d === mode.date && departsEtendus[d].coords);
    } else if (mode.type === "semaine") {
      if (domicile) {
        const lundiCourant = new Date(aujourdHuiDate);
        const jourSem = lundiCourant.getDay();
        const diffLundi = jourSem === 0 ? -6 : 1 - jourSem;
        lundiCourant.setDate(lundiCourant.getDate() + diffLundi);
        for (let i = 0; i < 5; i++) {
          const d = new Date(lundiCourant);
          d.setDate(lundiCourant.getDate() + i);
          ajouterDomicileSiAbsent(dateToKey(d));
        }
        borneElargissement = new Date(lundiCourant);
        borneElargissement.setDate(borneElargissement.getDate() + 4);
      }
      joursAvecDepart = Object.keys(departsEtendus).filter((d) => {
        const jour = new Date(d + "T00:00:00").getDay();
        return departsEtendus[d].coords && jour >= 1 && jour <= 5;
      });
    } else if (mode.type === "urgent") {
      const debutUrgent = new Date(aujourdHuiDate);
      const jourUrgent = debutUrgent.getDay();
      if (jourUrgent === 0) debutUrgent.setDate(debutUrgent.getDate() + 1);
      if (jourUrgent === 6) debutUrgent.setDate(debutUrgent.getDate() + 2);
      const finUrgent = new Date(debutUrgent);
      finUrgent.setDate(finUrgent.getDate() + 21);
      ajouterFenetreJoursOuvres(joursAvecDepart, debutUrgent, finUrgent);
      borneElargissement = finUrgent;
    } else if (mode.type === "periode") {
      const debut = new Date(mode.debut + "T00:00:00");
      const fin = new Date(mode.fin + "T00:00:00");
      ajouterFenetreJoursOuvres(joursAvecDepart, debut, fin);
      borneElargissement = fin;
    } else if (mode.type === "suivi") {
      // Fenêtre : du lendemain de la requête jusqu'à l'intervalle complet après aujourd'hui
      // (ex : 6 mois → tout créneau entre demain et dans 6 mois convient, sans urgence particulière —
      // on privilégie ensuite le trajet le plus logique, pas une date "idéale" précise).
      const debutFenetreDate = new Date(aujourdHuiDate);
      debutFenetreDate.setDate(debutFenetreDate.getDate() + 1);
      const finFenetreDate = new Date(aujourdHuiDate);
      finFenetreDate.setDate(finFenetreDate.getDate() + mode.jours);
      ajouterFenetreJoursOuvres(joursAvecDepart, debutFenetreDate, finFenetreDate);
      borneElargissement = finFenetreDate;
    }

    // Si les congés/jours fériés/week-ends laissent trop peu de jours valides, on élargit
    // automatiquement la recherche par blocs de 3 semaines (sauf pour une date précise choisie exprès).
    if (mode.type !== "date" && borneElargissement) {
      let extensions = 0;
      while (joursAvecDepart.filter(dk => estJourValide(dk)).length < 7 && extensions < 8) {
        const nouvelleBorne = new Date(borneElargissement);
        nouvelleBorne.setDate(nouvelleBorne.getDate() + 21);
        ajouterFenetreJoursOuvres(joursAvecDepart, borneElargissement, nouvelleBorne);
        borneElargissement = nouvelleBorne;
        extensions++;
      }
    }

    if (joursAvecDepart.length === 0) {
      if (mode.type === "date" && !domicile) {
        setErreur("Pour proposer une date sans départ déjà défini, enregistre d'abord ton domicile (onglet « Ma semaine »), ou définis un départ pour ce jour précis.");
      } else {
        setErreur("Définis au moins un point de départ (onglet « Ma semaine ») pour pouvoir comparer les trajets.");
      }
      return;
    }
    joursAvecDepart = joursAvecDepart.filter(dk => estJourValide(dk));

    setCalcEnCours(true);
    const rdvParJour = construireRdvParJour(departsEtendus);
    await new Promise((r) => setTimeout(r, 250));
    const suggestionsParJour = [];
    joursAvecDepart.forEach((jourKey) => {
      const depart = departsEtendus[jourKey];
      const rdvJour = (rdvParJour[jourKey] || []).slice();
      // Ajouter aussi les RDV agenda de ce jour (non-override) dans la séquence
      const rdvAgendaJour = (donnees.agendaRdvs || []).filter(r => r.jour === jourKey && !r.overrideTournee);
      rdvAgendaJour.forEach(r => {
        const clientAgenda = r.clientId ? clientsById[r.clientId] : null;
        if (clientAgenda && clientAgenda.coords) {
          rdvJour.push({
            client: clientAgenda,
            coords: clientAgenda.coords,
            heureArrivee: hhmmToMin(r.debut),
            fin: hhmmToMin(r.fin),
          });
        }
      });
      rdvJour.sort((a, b) => a.heureArrivee - b.heureArrivee);
      const sequence = [{ isDepart: true, coords: depart.coords, fin: hhmmToMin(depart.heure || "08:30") }, ...rdvJour];
      for (let i = 0; i < sequence.length; i++) {
        const prev = sequence[i];
        const next = sequence[i + 1] || null;
        if (!prev.coords) continue;
        const trajetPrevNew = estimerTrajetMin(prev.coords, client.coords);
        if (trajetPrevNew === null) continue;
        const arriveeBrute = (prev.fin || 0) + trajetPrevNew;
        const arrivee = Math.max(heureMinMin, Math.ceil(arriveeBrute / 30) * 30); // arrondi + jamais avant l'heure minimum souhaitée
        const fin = arrivee + duree;
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
          coutSupplementaire, arrivee, fin, duree,
          departAUtiliser: !departs[jourKey] ? depart : null,
        });
      }
    });
    // Filtrage par paliers : idéal ≤20 min de détour, acceptable ≤45 min, sinon tout
    const ideal      = suggestionsParJour.filter(s => s.coutSupplementaire <= 20);
    const acceptable = suggestionsParJour.filter(s => s.coutSupplementaire <= 45);
    const aUtiliser  = ideal.length > 0 ? ideal : acceptable.length > 0 ? acceptable : suggestionsParJour;

    if (mode.type === "urgent") {
      aUtiliser.sort((a, b) => {
        if (a.jour !== b.jour) return a.jour < b.jour ? -1 : 1;
        return a.coutSupplementaire - b.coutSupplementaire;
      });
    } else {
      aUtiliser.sort((a, b) => a.coutSupplementaire - b.coutSupplementaire);
    }
    setCalcEnCours(false);
    if (aUtiliser.length === 0) {
      setConseilDecoucher(null);
      setErreur(mode.type === "semaine"
        ? "Aucun créneau ne convient sur les jours actuellement planifiés. Vérifie que ton domicile est bien défini dans « Ma semaine »."
        : "Aucun créneau ne convient sur la période choisie.");
      return;
    }
    setClientSelectionne(client);
    let suggestionsFinales;
    if (mode.type === "urgent" || mode.type === "suivi" || mode.type === "periode") {
      const meilleureParJour = new Map();
      aUtiliser.forEach((s) => { if (!meilleureParJour.has(s.jour)) meilleureParJour.set(s.jour, s); });
      suggestionsFinales = Array.from(meilleureParJour.values()).slice(0, 7);
    } else {
      suggestionsFinales = aUtiliser.slice(0, 7);
    }
    setSuggestions(suggestionsFinales);

    // Si le client est très éloigné du domicile, chercher des visites déjà planifiées
    // à proximité (n'importe quel autre jour) pour proposer d'y dormir sur place la veille/le
    // lendemain — bien plus logique en trajet qu'un aller-retour complet depuis le domicile.
    const distanceDomicile = domicile ? estimerTrajetMin(domicile.coords, client.coords) : null;
    if (distanceDomicile !== null && distanceDomicile >= 70 && suggestionsFinales.length <= 3) {
      const seuilProximite = 30; // minutes : proximité jugée suffisante pour dormir sur place
      const toutesLesVisites = [];
      Object.keys(rdvParJourCalcule).forEach(jour => {
        (rdvParJourCalcule[jour] || []).forEach(item => {
          if (item.client.id === client.id) return;
          toutesLesVisites.push({ jour, etablissement: item.client.etablissement, coords: item.coords, heureArrivee: item.heureArrivee });
        });
      });
      (donnees.agendaRdvs || []).forEach(r => {
        if (!r.jour || r.overrideTournee) return;
        const c = clientsById[r.clientId];
        if (c && c.coords) toutesLesVisites.push({ jour: r.jour, etablissement: c.etablissement, coords: c.coords, heureArrivee: hhmmToMin(r.debut) });
      });
      // Les points de départ spécifiques déjà configurés (ex: hôtel pour une nuitée) comptent aussi
      // comme ancrages, même si aucun RDV n'y est encore positionné ce jour-là.
      Object.keys(departs || {}).forEach(jour => {
        const d = departs[jour];
        if (!d || !d.coords || !d.adresse) return;
        if (domicile && d.adresse === domicile.adresse) return; // point habituel, pas une nuitée particulière
        toutesLesVisites.push({ jour, etablissement: `ton point de départ (${d.adresse})`, coords: d.coords, heureArrivee: hhmmToMin(d.heure || "08:00") });
      });

      const optionsDecoucher = [];
      toutesLesVisites.forEach(v => {
        if (v.jour < dateToKey(aujourdHuiDate)) return;
        const trajetProximite = estimerTrajetMin(v.coords, client.coords);
        if (trajetProximite === null || trajetProximite > seuilProximite) return;
        // Option "lendemain" : nuit sur place après cette visite, client vu tôt le matin suivant
        const lendemain = new Date(v.jour + "T00:00:00");
        lendemain.setDate(lendemain.getDate() + 1);
        const dkLendemain = dateToKey(lendemain);
        if (estJourOuvre(dkLendemain) && !(planning[dkLendemain] || []).some(r2 => r2.clientId === client.id)) {
          optionsDecoucher.push({
            jour: dkLendemain, type: "lendemain", ancrage: v.etablissement, jourAncrage: v.jour, coordsAncrage: v.coords,
            trajetProximite, arrivee: JOURNEE_DEBUT, duree, fin: JOURNEE_DEBUT + duree,
          });
        }
        // Option "veille" : nuit sur place avant cette visite, client vu la veille en fin de journée
        const veille = new Date(v.jour + "T00:00:00");
        veille.setDate(veille.getDate() - 1);
        const dkVeille = dateToKey(veille);
        if (estJourOuvre(dkVeille) && !(planning[dkVeille] || []).some(r2 => r2.clientId === client.id)) {
          // Positionné en fin de journée (pas dérivé de l'heure du lendemain, qui n'a pas de sens ici)
          const arriveeVeille = Math.max(JOURNEE_DEBUT, JOURNEE_FIN - duree);
          optionsDecoucher.push({
            jour: dkVeille, type: "veille", ancrage: v.etablissement, jourAncrage: v.jour, coordsAncrage: v.coords,
            trajetProximite, arrivee: arriveeVeille, duree, fin: arriveeVeille + duree,
          });
        }
      });

      const parJour = new Map();
      optionsDecoucher.forEach(o => {
        const existant = parJour.get(o.jour);
        if (!existant || o.trajetProximite < existant.trajetProximite) parJour.set(o.jour, o);
      });
      // Short-list à vol d'oiseau (élargie) avant l'affinage par vrai itinéraire routier
      const shortListBrute = Array.from(parJour.values())
        .sort((a, b) => a.trajetProximite - b.trajetProximite || a.jour.localeCompare(b.jour))
        .slice(0, 8);

      // Vérification par vrai itinéraire routier (évite les faux positifs à vol d'oiseau,
      // typiquement en cas d'obstacle géographique comme un estuaire ou une côte).
      const shortListAffinee = await Promise.all(shortListBrute.map(async o => {
        const trajetReel = await estimerTrajetMinReel(o.coordsAncrage, client.coords);
        return { ...o, trajetProximite: trajetReel ?? o.trajetProximite };
      }));

      const optionsFinales = shortListAffinee
        .filter(o => o.trajetProximite <= seuilProximite)
        .sort((a, b) => a.trajetProximite - b.trajetProximite || a.jour.localeCompare(b.jour))
        .slice(0, 5);

      setSuggestionsDecoucher(optionsFinales);
      setConseilDecoucher(optionsFinales.length === 0
        ? `${client.etablissement} est assez éloigné de ton domicile (environ ${formatMin(distanceDomicile)} de trajet), et aucune autre visite proche n'est encore planifiée pour envisager de dormir sur place. Envisage d'en programmer une dans le secteur pour optimiser un futur passage.`
        : null);
    } else {
      setSuggestionsDecoucher([]);
      setConseilDecoucher(null);
    }
  }

  function retenirCreneau(sugg, heureOverride, dureeOverride) {
    if (!clientSelectionne) return;
    const arriveeFinal = heureOverride ? hhmmToMin(heureOverride) : sugg.arrivee;
    const dureeFinal = dureeOverride || sugg.duree || 45;
    const finFinal = arriveeFinal + dureeFinal;
    if (sugg.departAUtiliser) {
      setDeparts((d) => ({ ...d, [sugg.jour]: sugg.departAUtiliser }));
    }
    setPlanning((p) => ({
      ...p,
      [sugg.jour]: [...(p[sugg.jour] || []), { clientId: clientSelectionne.id, heureArrivee: arriveeFinal, heureFin: finFinal }],
    }));
    setClients((prev) => prev.map((c) => (c.id === clientSelectionne.id ? { ...c, prochainRdv: sugg.jour, statutRdv: "Fixe", dureeDefaut: dureeFinal } : c)));
    showToast(`${clientSelectionne.etablissement} placé le ${formatDateFr(sugg.jour)} à ${minToHHMM(arriveeFinal)}`, "ok");
    setCreneauRetenu({ client: { ...clientSelectionne, dureeDefaut: dureeFinal }, sugg: { ...sugg, arrivee: arriveeFinal, fin: finFinal, duree: dureeFinal } });
    setSuggestions(null);
    setClientSelectionne(null);
    setSuggIdxOuvert(null);
  }


  function toggleCreneauAProposer(idx) {
    setCreneauxAProposer(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function envoyerPropositionEmail() {
    const nbSelection = creneauxAProposer.size + creneauxDecoucherAProposer.size;
    if (!clientSelectionne || nbSelection === 0) return;
    setEnvoiEmailEnCours(true);
    const creneauxNormaux = Array.from(creneauxAProposer).sort((a,b)=>a-b).map(idx => {
      const s = suggestions[idx];
      return { jour: s.jour, debut: minToHHMMInput(s.arrivee), fin: minToHHMMInput(s.fin) };
    });
    const creneauxDecoucher = Array.from(creneauxDecoucherAProposer).sort((a,b)=>a-b).map(idx => {
      const o = suggestionsDecoucher[idx];
      return { jour: o.jour, debut: minToHHMMInput(o.arrivee), fin: minToHHMMInput(o.fin) };
    });
    const creneaux = [...creneauxNormaux, ...creneauxDecoucher];
    const proposition = await creerPropositionRdv({
      code,
      clientId: clientSelectionne.id,
      clientNom: clientSelectionne.etablissement,
      creneaux,
    });
    setEnvoiEmailEnCours(false);
    if (!proposition) {
      showToast("Erreur lors de la création de la proposition", "error");
      return;
    }
    const lien = `${window.location.origin}${window.location.pathname}?reservation=${proposition.id}`;
    const listeCreneaux = creneaux.map(c => `- ${formatDateFr(c.jour)} à ${c.debut.replace(":","h")}`).join("\n");
    const prefs = { ...MODELE_EMAIL_DEFAUT, ...(preferencesEmail || {}) };
    const formule = prefs.formule || "vous";
    const nomContact = clientSelectionne.nom_contact || clientSelectionne.contact || "";
    const vars = {
      prenom: nomContact ? ` ${nomContact}` : "",
      etablissement: clientSelectionne.etablissement,
      creneaux: listeCreneaux,
      lien,
    };
    function appliquerVariables(texte) {
      return Object.keys(vars).reduce((acc, cle) => acc.split(`{${cle}}`).join(vars[cle]), texte);
    }
    const sujetModele = formule === "tu" ? prefs.sujetTu : prefs.sujetVous;
    const corpsModele = formule === "tu" ? prefs.corpsTu : prefs.corpsVous;
    const sujet = encodeURIComponent(appliquerVariables(sujetModele));
    const corps = encodeURIComponent(appliquerVariables(corpsModele));
    const destinataire = clientSelectionne.email || "";
    window.location.href = `mailto:${destinataire}?subject=${sujet}&body=${corps}`;
    setCreneauxAProposer(new Set());
    setCreneauxDecoucherAProposer(new Set());
    showToast("Email préparé — vérifie ta messagerie", "ok");
  }

  async function renvoyerPropositionAutreCreneaux(proposition) {
    await annulerPropositionRdv(proposition.id);
    const client = clients.find(c => c.id === proposition.client_id);
    if (!client) {
      showToast("Client introuvable dans la base — impossible de relancer la recherche automatiquement", "error");
      return;
    }
    setVue("prochain-rdv");
    showToast(`Ancienne proposition annulée — recherche de nouveaux créneaux pour ${client.etablissement}`, "ok");
    setTimeout(() => chercherCreneau(client, { type: "urgent" }), 60);
  }

  async function relancerProposition(proposition) {
    // Vérifie en temps réel que les créneaux initialement proposés sont toujours libres
    // avant de renvoyer l'email — retire ceux qui ont été pris entre-temps.
    let donnees = null;
    try { donnees = await chargerDonneesDistantes(proposition.code); } catch {}
    const occupationsJour = (jour) => [
      ...((donnees?.agendaRdvs || []).filter(r => r.jour === jour).map(r => ({ debut: r.debut, fin: r.fin }))),
      ...((donnees?.planning?.[jour] || []).filter(v => v.heureArrivee != null).map(v => ({ debut: minToHHMMInput(v.heureArrivee), fin: minToHHMMInput(v.heureFin) }))),
    ];
    const creneauxEncoreDisponibles = (proposition.creneaux || []).filter(c => {
      const occ = occupationsJour(c.jour);
      return !occ.some(o => creneauxSeChevauchent(c.debut, c.fin, o.debut, o.fin));
    });

    if (creneauxEncoreDisponibles.length === 0) {
      showToast("Aucun des créneaux proposés n'est plus disponible — utilise plutôt \"Proposer d'autres créneaux\"", "error");
      return;
    }

    // Si certains créneaux ne sont plus libres, on met à jour la proposition pour ne garder que les valides
    if (creneauxEncoreDisponibles.length !== (proposition.creneaux || []).length) {
      await supabaseFetch(`propositions_rdv?id=eq.${proposition.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ creneaux: creneauxEncoreDisponibles }),
      });
    }

    const client = clients.find(c => c.id === proposition.client_id);
    const lien = `${window.location.origin}${window.location.pathname}?reservation=${proposition.id}`;
    const listeCreneaux = creneauxEncoreDisponibles.map(c => `- ${formatDateFr(c.jour)} à ${c.debut.replace(":", "h")}`).join("\n");
    const sujet = encodeURIComponent(`Rappel — Proposition de rendez-vous — ${proposition.client_nom}`);
    const corps = encodeURIComponent(
      `Bonjour,\n\nJe me permets de revenir vers vous concernant ma précédente proposition de rendez-vous. Voici les créneaux encore disponibles :\n\n${listeCreneaux}\n\nMerci de choisir celui qui vous convient via ce lien :\n${lien}\n\nCordialement`
    );
    const destinataire = client?.email || "";
    window.location.href = `mailto:${destinataire}?subject=${sujet}&body=${corps}`;
    await supabaseFetch(`propositions_rdv?id=eq.${proposition.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ derniere_relance: new Date().toISOString() }),
    });
    showToast("Relance préparée — vérifie ta messagerie", "ok");
  }

  function supprimerVisite(dateKey, clientId) {
    setPlanning((p) => {
      const np = { ...p };
      if (np[dateKey]) {
        np[dateKey] = np[dateKey].filter((r) => r.clientId !== clientId);
        if (np[dateKey].length === 0) delete np[dateKey];
      }
      return np;
    });
    setAgendaRdvs((prev) => (prev || []).filter((r) => !(r.overrideTournee === clientId && r.jour === dateKey)));
    setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, prochainRdv: null, statutRdv: null } : c));
    showToast("Visite supprimée", "ok");
  }

  function supprimerRdvAgenda(id) {
    setAgendaRdvs((prev) => (prev || []).filter((r) => r.id !== id));
    showToast("RDV supprimé", "ok");
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
        .tr-sugg-edit { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--gris-clair); display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
        .tr-jour-block { margin-bottom: 14px; }
        .tr-jour-block-head { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: var(--ardoise); color: white; border-radius: 8px 8px 0 0; font-family: 'Oswald', sans-serif; text-transform: capitalize; font-size: 13px; letter-spacing: 0.02em; gap: 8px; flex-wrap: wrap; }
        .tr-jour-block-body { border: 1px solid var(--gris-clair); border-top: none; border-radius: 0 0 8px 8px; padding: 8px 12px; }
        .tr-stop-line { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px dashed var(--gris-clair); font-size: 13px; flex-wrap: wrap; }
        .tr-stop-line:last-child { border-bottom: none; }
        .tr-stop-line-time { font-family: 'Oswald', sans-serif; font-weight: 600; min-width: 50px; }
        .tr-stop-line-name { flex: 1; font-weight: 600; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tr-stop-line-trajet { color: var(--gris); font-size: 11px; white-space: nowrap; }
        .tr-stop-line-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
        .tr-stop-line-agenda { border-left: 3px solid var(--vert); padding-left: 8px; background: var(--vert-clair); border-radius: 0 6px 6px 0; }
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
            <button className={`tr-tab ${vue === "reservations" ? "active" : ""}`} onClick={() => setVue("reservations")} disabled={clients.length === 0} style={{ position:"relative" }}>
              Réservations
              {relancesEnAttente > 0 && (
                <span style={{ position:"absolute", top:-6, right:-6, background:"var(--rouge)", color:"white", borderRadius:999, fontSize:10, fontFamily:"'Oswald',sans-serif", minWidth:16, height:16, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>
                  {relancesEnAttente}
                </span>
              )}
            </button>
            <button className={`tr-tab ${vue === "offres" ? "active" : ""}`} onClick={() => setVue("offres")} disabled={clients.length === 0}>Offres</button>
            <button className="tr-tab" onClick={onDeconnecter} title="Changer d'espace">⎋</button>
          </div>
        </header>

        {/* VUE : IMPORT */}
        {vue === "import" && (
          <div className="tr-grid">
            <div className="tr-card">
              <div className="tr-card-title"><Plus size={14} /> Ajouter un client</div>
              <FormulaireAjoutClient onAjouter={ajouterClientManuel} enCours={ajoutClientEnCours} />
              <div style={{ borderTop:"1px dashed var(--gris-clair)", margin:"18px 0" }} />
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
                      <div key={c.id} className="tr-client-row" onClick={() => setFicheClient(c)} style={{ cursor: "pointer" }}>
                        <span className="tr-pression-dot" style={{ background: PRESSION_COLOR[c.pression] || "var(--gris)" }}></span>
                        <div className="tr-client-row-main">
                          <div className="tr-client-row-name">{c.etablissement}</div>
                          <div className="tr-client-row-meta">{c.ville} {c.coords ? "" : "· non localisé"}</div>
                        </div>
                        <BadgeContactManquant client={c} onClick={() => setFicheClient(c)} />
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
                  <button className={`tr-mode-btn ${modeRecherche === "periode" ? "active" : ""}`} onClick={() => setModeRecherche("periode")}>Période</button>
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
              {modeRecherche === "periode" && (
                <div className="tr-field">
                  <label className="tr-label">Période souhaitée</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input className="tr-input" type="date" value={periodeDebut} min={dateToKey(new Date())} onChange={(e) => setPeriodeDebut(e.target.value)} style={{ flex: 1 }} />
                    <span style={{ color: "var(--gris)", fontSize: 12, flexShrink: 0 }}>au</span>
                    <input className="tr-input" type="date" value={periodeFin} min={periodeDebut || dateToKey(new Date())} onChange={(e) => setPeriodeFin(e.target.value)} style={{ flex: 1 }} />
                  </div>
                </div>
              )}
              <div className="tr-field">
                <label className="tr-label">Durée du RDV</label>
                <div className="tr-mode-row">
                  <button className={`tr-mode-btn ${dureeRdv === 15 ? "active" : ""}`} onClick={() => setDureeRdv(15)}>15 min</button>
                  <button className={`tr-mode-btn ${dureeRdv === 30 ? "active" : ""}`} onClick={() => setDureeRdv(30)}>30 min</button>
                  <button className={`tr-mode-btn ${dureeRdv === 45 ? "active" : ""}`} onClick={() => setDureeRdv(45)}>45 min</button>
                  <button className={`tr-mode-btn ${dureeRdv === 60 ? "active" : ""}`} onClick={() => setDureeRdv(60)}>1 h</button>
                </div>
                <input
                  className="tr-input"
                  type="number"
                  min={5}
                  step={5}
                  value={dureeRdv}
                  onChange={(e) => setDureeRdv(Math.max(5, parseInt(e.target.value, 10) || 45))}
                  style={{ marginTop: 8 }}
                  placeholder="Durée personnalisée (min)"
                />
              </div>

              <div className="tr-field">
                <label className="tr-label">Heure minimum souhaitée</label>
                <div className="tr-mode-row">
                  <button className={`tr-mode-btn ${heureMinRdv === "09:00" ? "active" : ""}`} onClick={() => setHeureMinRdv("09:00")}>Dès 9h</button>
                  <button className={`tr-mode-btn ${heureMinRdv === "11:00" ? "active" : ""}`} onClick={() => setHeureMinRdv("11:00")}>Après 11h</button>
                  <button className={`tr-mode-btn ${heureMinRdv === "14:00" ? "active" : ""}`} onClick={() => setHeureMinRdv("14:00")}>Après 14h</button>
                </div>
                <input
                  className="tr-input"
                  type="time"
                  value={heureMinRdv}
                  onChange={(e) => setHeureMinRdv(e.target.value || "09:00")}
                  style={{ marginTop: 8 }}
                />
                <p style={{ fontSize:11, color:"var(--gris)", marginTop:6, marginBottom:0 }}>Aucun créneau ne sera proposé avant cette heure, même si le trajet le permettrait plus tôt.</p>
              </div>

              <div className="tr-field">
                <label className="tr-label">Jours à éviter</label>
                <div className="tr-mode-row">
                  {[{v:1,l:"Lun"},{v:2,l:"Mar"},{v:3,l:"Mer"},{v:4,l:"Jeu"},{v:5,l:"Ven"}].map(({v,l}) => (
                    <button key={v} className={`tr-mode-btn ${joursExclus.includes(v) ? "active" : ""}`}
                      onClick={() => setJoursExclus(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tr-field">
                <label className="tr-label">Période à exclure (optionnel — ex: vacances scolaires du client)</label>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <input className="tr-input" type="date" value={periodeExclueDebut} onChange={(e) => setPeriodeExclueDebut(e.target.value)} style={{ flex:1 }} />
                  <span style={{ color:"var(--gris)", fontSize:12, flexShrink:0 }}>au</span>
                  <input className="tr-input" type="date" value={periodeExclueFin} min={periodeExclueDebut || undefined} onChange={(e) => setPeriodeExclueFin(e.target.value)} style={{ flex:1 }} />
                </div>
                {(periodeExclueDebut || periodeExclueFin) && (
                  <button className="tr-btn tr-btn-ghost tr-btn-sm" style={{ marginTop:6 }} onClick={() => { setPeriodeExclueDebut(""); setPeriodeExclueFin(""); }}>
                    <X size={11}/> Effacer la période
                  </button>
                )}
              </div>

              <button className="tr-btn tr-btn-outline tr-btn-full" style={{ marginBottom: 12 }} onClick={() => setShowReglagesEmail(s => !s)}>
                <Mail size={14}/> {showReglagesEmail ? "Masquer" : "Personnaliser"} le message envoyé au client
              </button>
              {showReglagesEmail && (
                <PanneauReglagesEmail preferencesEmail={preferencesEmail} setPreferencesEmail={setPreferencesEmail} />
              )}

              <div className="tr-search">
                <Search size={15} />
                <input className="tr-input" placeholder="Rechercher un établissement ou une ville..." value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              </div>
              <div className="tr-clients-list">
                {clientsFiltres.slice(0, 60).map((c) => (
                  <div key={c.id} className="tr-client-row" onClick={() => {
                    if (modeRecherche === "date" && !dateChoisie) { setErreur("Choisis d'abord une date."); return; }
                    if (modeRecherche === "periode" && (!periodeDebut || !periodeFin)) { setErreur("Choisis une date de début et de fin."); return; }
                    const mode = modeRecherche === "urgent" ? { type: "urgent" } : modeRecherche === "suivi" ? { type: "suivi", jours: horizonJours, derniereVisite: c.derniereVisite } : modeRecherche === "date" ? { type: "date", date: dateChoisie } : modeRecherche === "periode" ? { type: "periode", debut: periodeDebut, fin: periodeFin } : { type: "semaine" };
                    const periodeExclueVoulue = (periodeExclueDebut && periodeExclueFin) ? { debut: periodeExclueDebut, fin: periodeExclueFin } : null;
                    chercherCreneau(c, mode, dureeRdv, heureMinRdv, joursExclus, periodeExclueVoulue);
                  }}>
                    <span className="tr-pression-dot" style={{ background: PRESSION_COLOR[c.pression] || "var(--gris)" }}></span>
                    <div className="tr-client-row-main">
                      <div className="tr-client-row-name">{c.etablissement}</div>
                      <div className="tr-client-row-meta">{c.ville} {c.derniereVisite ? `· vu le ${formatDateCourt(c.derniereVisite)}` : "· jamais vu"}</div>
                    </div>
                    <BadgeContactManquant client={c} onClick={(e) => { e.stopPropagation(); setFicheClient(c); }} />
                    {c.ciblage && <span className={`tr-badge ${["GOLD", "PLATINIUM", "COMPTE CLE"].includes(c.ciblage) ? "tr-badge-gold" : "tr-badge-default"}`}>{c.ciblage}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              {erreur && <div className="tr-alert"><AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{erreur}</span></div>}
              {calcEnCours && <div className="tr-card"><div className="tr-empty"><RefreshCw size={22} style={{ marginBottom: 8, opacity: 0.5 }} /><br />Recherche du meilleur créneau...</div></div>}

              {creneauRetenu && !suggestions && !calcEnCours && (
                <div className="tr-creneau-retenu">
                  <div className="tr-creneau-retenu-info">
                    <strong>✓ {creneauRetenu.client.etablissement}</strong>
                    <span>Planifié le {formatDateFr(creneauRetenu.sugg.jour)} à {minToHHMM(creneauRetenu.sugg.arrivee)} · {creneauRetenu.sugg.duree || 45} min</span>
                  </div>
                  <BoutonAgenda
                    pharmacie={creneauRetenu.client}
                    date={creneauRetenu.sugg.jour}
                    heure={minToHHMMInput(creneauRetenu.sugg.arrivee)}
                    duree={creneauRetenu.sugg.duree || creneauRetenu.client.dureeDefaut || 45}
                    onSave={(rdv) => setAgendaRdvs((prev) => [...(prev || []), rdv])}
                  />
                </div>
              )}

              {!suggestions && !calcEnCours && !erreur && !creneauRetenu && (
                <div className="tr-card"><div className="tr-empty"><Sparkles size={26} style={{ marginBottom: 8, opacity: 0.4 }} /><br />Sélectionne un client à gauche.<br />L'appli proposera les 3 meilleurs créneaux selon ta semaine planifiée.</div></div>
              )}
              {suggestions && clientSelectionne && !calcEnCours && (
                <div className="tr-card">
                  {suggestionsDecoucher.length > 0 && (
                    <div style={{ background:"#FBF0E9", border:"1.5px solid var(--orange)", borderRadius:10, padding:14, marginBottom:16 }}>
                      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8, fontSize:13, fontWeight:700, color:"#993C1D" }}>
                        <span>🛏️</span> Option découcher — trajet minimal
                      </div>
                      <div style={{ fontSize:12, color:"#993C1D", marginBottom:12, lineHeight:1.5 }}>
                        {clientSelectionne.etablissement} est loin de ton domicile, mais tu as déjà une visite à proximité ces jours-là. Dormir sur place évite l'aller-retour complet.
                      </div>
                      <div style={{ fontSize:11.5, color:"#993C1D", marginBottom:12, fontStyle:"italic" }}>
                        Coche aussi ces créneaux si tu veux les proposer par email au client, comme les suggestions classiques.
                      </div>
                      <div className="tr-sugg-list">
                        {suggestionsDecoucher.map((o, idx) => (
                          <div key={`decoucher-${o.jour}-${idx}`} className="tr-sugg-card" style={{ paddingLeft:44, borderColor:"var(--orange)" }}>
                            <input type="checkbox" checked={creneauxDecoucherAProposer.has(idx)}
                              onChange={() => setCreneauxDecoucherAProposer(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; })}
                              style={{ position:"absolute", left:14, top:16, width:18, height:18, cursor:"pointer", accentColor:"var(--orange)" }}
                              title="Proposer ce créneau par email"/>
                            <div className="tr-sugg-top">
                              <span className="tr-sugg-jour">{formatDateFr(o.jour)}</span>
                              <span className="tr-sugg-cout">{formatMin(o.trajetProximite)} de l'ancrage</span>
                            </div>
                            <div className="tr-sugg-detail">
                              {o.type === "lendemain"
                                ? <>Nuit sur place après ta visite chez <strong>{o.ancrage}</strong> ({formatDateCourt(o.jourAncrage)}), client vu tôt le matin</>
                                : <>Nuit sur place avant ta visite chez <strong>{o.ancrage}</strong> ({formatDateCourt(o.jourAncrage)}), client vu en fin de journée précédente</>}
                            </div>
                            <div className="tr-sugg-time"><Clock size={11} style={{ display:"inline", marginRight:4, verticalAlign:-1 }}/>Suggestion : arrivée à {minToHHMM(o.arrivee)} · {o.duree} min · fin à {minToHHMM(o.fin)}</div>
                            <div className="tr-sugg-edit">
                              <div style={{ flex:1, minWidth:110 }}>
                                <label className="tr-label">Heure de départ</label>
                                <input className="tr-input" type="time" defaultValue={minToHHMMInput(o.arrivee)} ref={(el) => { heureRefsDecoucher.current[idx] = el; }} />
                              </div>
                              <div style={{ flex:1, minWidth:90 }}>
                                <label className="tr-label">Durée (min)</label>
                                <input className="tr-input" type="number" min={5} step={5} defaultValue={o.duree} ref={(el) => { dureeRefsDecoucher.current[idx] = el; }} />
                              </div>
                              <button className="tr-btn tr-btn-primary" style={{ flexShrink:0 }}
                                onClick={() => retenirCreneau(o, heureRefsDecoucher.current[idx]?.value, parseInt(dureeRefsDecoucher.current[idx]?.value, 10))}>
                                <CheckCircle2 size={14}/> Confirmer
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {suggestionsDecoucher.length === 0 && conseilDecoucher && (
                    <div style={{ background:"#FBF0E9", border:"1.5px solid var(--orange)", borderRadius:8, padding:"12px 14px", marginBottom:14, fontSize:12.5, color:"#993C1D", lineHeight:1.5, display:"flex", gap:9 }}>
                      <span style={{ flexShrink:0 }}>🛏️</span>
                      <span>{conseilDecoucher}</span>
                    </div>
                  )}
                  <div className="tr-card-title"><Trophy size={14} /> Top {suggestions.length} pour {clientSelectionne.etablissement}</div>
                  <div style={{ fontSize:11.5, color:"var(--gris)", marginBottom:10, lineHeight:1.5 }}>
                    Coche un ou plusieurs créneaux pour les proposer par email au client — il pourra choisir directement celui qui lui convient.
                  </div>
                  <div className="tr-sugg-list">
                    {suggestions.map((s, idx) => (
                      <div key={`${s.jour}-${idx}`} className={`tr-sugg-card ${idx === 0 ? "rang-1" : ""}`}>
                        <div style={{ position:"absolute", left:14, top:16, display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                          <div className="tr-sugg-rank" style={{ position:"static" }}>{idx + 1}</div>
                          <input type="checkbox" checked={creneauxAProposer.has(idx)} onChange={() => toggleCreneauAProposer(idx)}
                            style={{ width:18, height:18, cursor:"pointer", accentColor:"var(--orange)" }}
                            title="Proposer ce créneau par email"/>
                        </div>
                        <div className="tr-sugg-top">
                          <span className="tr-sugg-jour">{formatDateFr(s.jour)}</span>
                          <span className="tr-sugg-cout">{s.coutSupplementaire <= 0 ? "Sur la route" : `+${formatMin(s.coutSupplementaire)}`}</span>
                        </div>
                        <div className="tr-sugg-detail">Entre <strong>{s.avant}</strong>{s.apres ? <> et <strong>{s.apres}</strong></> : <> (fin de journée)</>}</div>
                        <div className="tr-sugg-time"><Clock size={11} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />Suggestion : arrivée à {minToHHMM(s.arrivee)} · {s.duree || 45} min · fin à {minToHHMM(s.fin)}</div>

                        <div className="tr-sugg-edit">
                          <div style={{ flex: 1, minWidth: 110 }}>
                            <label className="tr-label">Heure de départ</label>
                            <input className="tr-input" type="time" defaultValue={minToHHMMInput(s.arrivee)} ref={(el) => { heureRefs.current[idx] = el; }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 90 }}>
                            <label className="tr-label">Durée (min)</label>
                            <input className="tr-input" type="number" min={5} step={5} defaultValue={s.duree || 45} ref={(el) => { dureeRefs.current[idx] = el; }} />
                          </div>
                          <button className="tr-btn tr-btn-primary" style={{ flexShrink: 0 }} onClick={() => retenirCreneau(s, heureRefs.current[idx]?.value, parseInt(dureeRefs.current[idx]?.value, 10))}>
                            <CheckCircle2 size={14} /> Confirmer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(creneauxAProposer.size + creneauxDecoucherAProposer.size) > 0 && (
                    <button className="tr-btn tr-btn-full" style={{ marginTop:12, background:"#185FA5", color:"white" }}
                      onClick={envoyerPropositionEmail} disabled={envoiEmailEnCours}>
                      <Mail size={14}/> {envoiEmailEnCours ? "Préparation..." : `Proposer ${creneauxAProposer.size + creneauxDecoucherAProposer.size} créneau${(creneauxAProposer.size + creneauxDecoucherAProposer.size)>1?"x":""} par email`}
                    </button>
                  )}
                  <button className="tr-btn tr-btn-ghost tr-btn-full" style={{ marginTop: 12 }} onClick={() => { setSuggestions(null); setClientSelectionne(null); setSuggIdxOuvert(null); setCreneauxAProposer(new Set()); setCreneauxDecoucherAProposer(new Set()); }}>Annuler</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ASSISTANT VOCAL — visible sur Prochain RDV et Ma semaine */}
        {(vue === "prochain-rdv" || vue === "semaine") && (
          <AssistantVocal
            clients={clients}
            rdvDuJour={[
              ...(rdvParJourCalcule[dateToKey(new Date())] || []).map(r => ({
                ...r.client,
                heure: r.heureArrivee,
              })),
              ...(donnees.agendaRdvs || []).filter(r => r.jour === dateToKey(new Date())).map(r => ({
                etablissement: r.titre,
                heure: r.debut,
                mobile: r.clientId ? (clients.find(c => c.id === r.clientId)?.mobile_titulaire || clients.find(c => c.id === r.clientId)?.tel1) : null,
                email: r.clientId ? (clients.find(c => c.id === r.clientId)?.mail_titulaire || clients.find(c => c.id === r.clientId)?.email) : null,
              })),
            ]}
          />
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
            agendaRdvs={donnees.agendaRdvs || []}
            setAgendaRdvs={setAgendaRdvs}
            supprimerVisite={supprimerVisite}
            supprimerRdvAgenda={supprimerRdvAgenda}
            periodesBloquees={periodesBloquees}
            setPeriodesBloquees={setPeriodesBloquees}
            clients={clients}
            clientsById={clientsById}
            onOuvrirFiche={setFicheClient}
            onChercherCreneau={chercherCreneau}
            setVue={setVue}
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
            supprimerVisiteTournee={supprimerVisite}
            departs={departs}
            domicile={domicile}
          />
        )}

        {/* VUE : RESERVATIONS EN LIGNE */}
        {vue === "reservations" && (
          <VueReservations code={code} clients={clients} onRenvoyer={renvoyerPropositionAutreCreneaux} onRelancer={relancerProposition} />
        )}

        {/* VUE : OFFRES COMMERCIALES */}
        {vue === "offres" && (
          <VueOffres code={code} clients={clients} showToast={showToast} />
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

      {ficheClient && (
        <FicheClient
          client={ficheClient}
          onSave={sauvegarderContact}
          onClose={() => setFicheClient(null)}
        />
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
// Sous-composant : réglages du modèle d'email de proposition
// ============================================================
function PanneauReglagesEmail({ preferencesEmail, setPreferencesEmail }) {
  const prefs = { ...MODELE_EMAIL_DEFAUT, ...(preferencesEmail || {}) };
  const formule = prefs.formule || "vous";

  function majChamp(cle, valeur) {
    setPreferencesEmail({ ...prefs, [cle]: valeur });
  }

  function reinitialiserModele() {
    if (formule === "tu") {
      setPreferencesEmail({ ...prefs, sujetTu: MODELE_EMAIL_DEFAUT.sujetTu, corpsTu: MODELE_EMAIL_DEFAUT.corpsTu });
    } else {
      setPreferencesEmail({ ...prefs, sujetVous: MODELE_EMAIL_DEFAUT.sujetVous, corpsVous: MODELE_EMAIL_DEFAUT.corpsVous });
    }
  }

  const sujetActuel = formule === "tu" ? prefs.sujetTu : prefs.sujetVous;
  const corpsActuel = formule === "tu" ? prefs.corpsTu : prefs.corpsVous;

  return (
    <div style={{ background:"#FAFAF8", border:"1.5px solid var(--gris-clair)", borderRadius:10, padding:14, marginBottom:12 }}>
      <div className="tr-field">
        <label className="tr-label">Ton du message</label>
        <div className="tr-mode-row">
          <button className={`tr-mode-btn ${formule === "vous" ? "active" : ""}`} onClick={() => majChamp("formule", "vous")}>Vouvoiement</button>
          <button className={`tr-mode-btn ${formule === "tu" ? "active" : ""}`} onClick={() => majChamp("formule", "tu")}>Tutoiement</button>
        </div>
      </div>
      <div className="tr-field">
        <label className="tr-label">Sujet de l'email</label>
        <input className="tr-input" value={sujetActuel}
          onChange={(e) => majChamp(formule === "tu" ? "sujetTu" : "sujetVous", e.target.value)} />
      </div>
      <div className="tr-field">
        <label className="tr-label">Corps du message</label>
        <textarea className="tr-input" style={{ height:150, resize:"vertical", fontFamily:"inherit" }} value={corpsActuel}
          onChange={(e) => majChamp(formule === "tu" ? "corpsTu" : "corpsVous", e.target.value)} />
      </div>
      <div style={{ fontSize:11.5, color:"var(--gris)", marginBottom:10, lineHeight:1.5 }}>
        Variables disponibles : <code>{"{prenom}"}</code> (nom du contact si connu), <code>{"{etablissement}"}</code>, <code>{"{creneaux}"}</code> (liste des créneaux proposés), <code>{"{lien}"}</code> (lien de réservation pour le client).
      </div>
      <button className="tr-btn tr-btn-outline tr-btn-full" onClick={reinitialiserModele} style={{ fontSize:12 }}>
        <RefreshCw size={13}/> Réinitialiser ce modèle par défaut
      </button>
    </div>
  );
}

// ============================================================
// Sous-composant : formulaire d'ajout manuel d'un client
// ============================================================
function FormulaireAjoutClient({ onAjouter, enCours }) {
  const [etablissement, setEtablissement] = useState("");
  const [cp, setCp] = useState("");
  const [ville, setVille] = useState("");
  const [adresse, setAdresse] = useState("");
  const [contact, setContact] = useState("");
  const [tel1, setTel1] = useState("");
  const [email, setEmail] = useState("");
  const [pression, setPression] = useState("Vert");
  const [ciblage, setCiblage] = useState("SILVER");
  const [erreur, setErreur] = useState("");

  const CIBLAGE_OPTIONS = ["COMPTE CLE", "PLATINIUM", "GOLD", "SILVER", "BRONZE", "PROSPECTS 1", "PROSPECTS 2", "PROSPECTS 3"];

  async function soumettre() {
    if (!etablissement.trim() || !cp.trim() || !ville.trim()) {
      setErreur("Nom, code postal et ville sont obligatoires.");
      return;
    }
    setErreur("");
    await onAjouter({ etablissement, cp, ville, adresse, contact, tel1, email, pression, ciblage });
    setEtablissement(""); setCp(""); setVille(""); setAdresse(""); setContact(""); setTel1(""); setEmail("");
  }

  return (
    <div>
      <div className="tr-field">
        <label className="tr-label">Nom de l'établissement *</label>
        <input className="tr-input" placeholder="Ex: Pharmacie du Centre" value={etablissement} onChange={e => setEtablissement(e.target.value)} />
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <div className="tr-field" style={{ flex:1 }}>
          <label className="tr-label">Code postal *</label>
          <input className="tr-input" placeholder="33000" value={cp} onChange={e => setCp(e.target.value)} />
        </div>
        <div className="tr-field" style={{ flex:2 }}>
          <label className="tr-label">Ville *</label>
          <input className="tr-input" placeholder="Bordeaux" value={ville} onChange={e => setVille(e.target.value)} />
        </div>
      </div>
      <div className="tr-field">
        <label className="tr-label">Adresse (recommandé, pour une localisation précise)</label>
        <input className="tr-input" placeholder="12 rue de la Paix" value={adresse} onChange={e => setAdresse(e.target.value)} />
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <div className="tr-field" style={{ flex:1 }}>
          <label className="tr-label">Pression</label>
          <select className="tr-select" value={pression} onChange={e => setPression(e.target.value)}>
            <option value="Rouge">Rouge</option>
            <option value="Orange">Orange</option>
            <option value="Vert">Vert</option>
          </select>
        </div>
        <div className="tr-field" style={{ flex:2 }}>
          <label className="tr-label">Ciblage</label>
          <select className="tr-select" value={ciblage} onChange={e => setCiblage(e.target.value)}>
            {CIBLAGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="tr-field">
        <label className="tr-label">Contact (optionnel)</label>
        <input className="tr-input" placeholder="Nom du titulaire" value={contact} onChange={e => setContact(e.target.value)} />
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <div className="tr-field" style={{ flex:1 }}>
          <label className="tr-label">Téléphone (optionnel)</label>
          <input className="tr-input" placeholder="06 12 34 56 78" value={tel1} onChange={e => setTel1(e.target.value)} />
        </div>
        <div className="tr-field" style={{ flex:1 }}>
          <label className="tr-label">Email (optionnel)</label>
          <input className="tr-input" placeholder="contact@pharmacie.fr" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
      </div>
      {erreur && <div style={{ color:"#8A3530", background:"#FCEEED", borderRadius:7, padding:"8px 12px", marginBottom:12, fontSize:13 }}>{erreur}</div>}
      <button className="tr-btn tr-btn-primary tr-btn-full" onClick={soumettre} disabled={enCours}>
        <Plus size={14} /> {enCours ? "Ajout et localisation..." : "Ajouter ce client"}
      </button>
    </div>
  );
}

// ============================================================
// Sous-composant : vue des réservations prises en ligne par les clients
// ============================================================
function VueReservations({ code, clients, onRenvoyer, onRelancer }) {
  const [propositions, setPropositions] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState("toutes"); // toutes | en_attente | confirmees
  const [renvoiEnCoursId, setRenvoiEnCoursId] = useState(null);
  const [relanceEnCoursId, setRelanceEnCoursId] = useState(null);

  async function charger() {
    setChargement(true);
    const rows = await chargerToutesPropositions(code);
    setPropositions(rows);
    setChargement(false);
  }

  useEffect(() => { charger(); }, [code]);

  const STATUT_BADGE = {
    en_attente: { label: "En attente de réponse", bg: "#FBF0DA", color: "#7A5C00" },
    confirme: { label: "Confirmé — nouveau", bg: "#DCEAE0", color: "#27500A" },
    confirme_vu: { label: "Confirmé", bg: "#DCEAE0", color: "#27500A" },
    annulee: { label: "Annulée — remplacée", bg: "#F0EDE7", color: "#8A93A0" },
  };

  const propositionsFiltrees = (propositions || []).filter(p => {
    if (filtre === "en_attente") return p.statut === "en_attente";
    if (filtre === "confirmees") return p.statut === "confirme" || p.statut === "confirme_vu";
    return true;
  });

  const nbEnAttente = (propositions || []).filter(p => p.statut === "en_attente").length;
  const nbConfirmees = (propositions || []).filter(p => p.statut === "confirme" || p.statut === "confirme_vu").length;

  async function handleRenvoyer(p) {
    setRenvoiEnCoursId(p.id);
    await onRenvoyer(p);
    await charger();
    setRenvoiEnCoursId(null);
  }

  async function handleRelancer(p) {
    setRelanceEnCoursId(p.id);
    await onRelancer(p);
    await charger();
    setRelanceEnCoursId(null);
  }

  function joursDepuis(dateIso) {
    if (!dateIso) return 0;
    return Math.floor((Date.now() - new Date(dateIso).getTime()) / 86400000);
  }

  return (
    <div className="tr-card">
      <div className="tr-card-title" style={{ justifyContent:"space-between" }}>
        <span style={{ display:"flex", alignItems:"center", gap:7 }}><Mail size={14}/> Réservations en ligne</span>
        <button className="tr-btn tr-btn-sm tr-btn-outline" onClick={charger}><RefreshCw size={12}/> Actualiser</button>
      </div>

      <div className="tr-mode-row" style={{ marginBottom:16 }}>
        <button className={`tr-mode-btn ${filtre === "toutes" ? "active" : ""}`} onClick={() => setFiltre("toutes")}>Toutes ({(propositions || []).length})</button>
        <button className={`tr-mode-btn ${filtre === "en_attente" ? "active" : ""}`} onClick={() => setFiltre("en_attente")}>En attente ({nbEnAttente})</button>
        <button className={`tr-mode-btn ${filtre === "confirmees" ? "active" : ""}`} onClick={() => setFiltre("confirmees")}>Confirmées ({nbConfirmees})</button>
      </div>

      {chargement && <div className="tr-empty"><RefreshCw size={22} style={{ marginBottom:8, opacity:0.5 }}/><br/>Chargement...</div>}
      {!chargement && propositionsFiltrees.length === 0 && (
        <div className="tr-empty">Aucune réservation à afficher ici pour l'instant.</div>
      )}
      {!chargement && propositionsFiltrees.map(p => {
        const badge = STATUT_BADGE[p.statut] || STATUT_BADGE.en_attente;
        return (
          <div key={p.id} style={{ border:"1.5px solid var(--gris-clair)", borderRadius:10, padding:14, marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:8 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{p.client_nom}</div>
              <span className="tr-badge" style={{ background:badge.bg, color:badge.color }}>{badge.label}</span>
            </div>
            {(p.statut === "confirme" || p.statut === "confirme_vu") && p.choix ? (
              <div style={{ fontSize:13, color:"var(--ardoise)" }}>
                <strong>Créneau choisi :</strong> {formatDateFr(p.choix.jour)} à {(p.choix.debut || "").replace(":", "h")}
              </div>
            ) : (
              <div style={{ fontSize:12.5, color:"var(--gris)" }}>
                Créneaux proposés : {(p.creneaux || []).map(c => `${formatDateCourt(c.jour)} à ${c.debut.replace(":","h")}`).join(" · ")}
              </div>
            )}
            <div style={{ fontSize:11, color:"var(--gris)", marginTop:6 }}>Proposé le {formatDateCourt(p.created_at?.slice(0,10))}{p.statut === "en_attente" && joursDepuis(p.created_at) >= 1 ? ` · en attente depuis ${joursDepuis(p.created_at)} jour${joursDepuis(p.created_at) > 1 ? "s" : ""}` : ""}</div>
            {p.derniere_relance && (
              <div style={{ fontSize:11, color:"var(--or)", marginTop:2 }}>
                🔄 Dernière relance le {new Date(p.derniere_relance).toLocaleDateString("fr-FR")} à {new Date(p.derniere_relance).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" })}
              </div>
            )}
            {p.statut === "en_attente" && (
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:10 }}>
                <button className="tr-btn tr-btn-outline tr-btn-sm"
                  onClick={() => handleRelancer(p)} disabled={relanceEnCoursId === p.id}>
                  <Mail size={12}/> {relanceEnCoursId === p.id ? "Vérification..." : "Relancer (vérifie la dispo)"}
                </button>
                <button className="tr-btn tr-btn-outline tr-btn-sm"
                  onClick={() => handleRenvoyer(p)} disabled={renvoiEnCoursId === p.id}>
                  <RefreshCw size={12}/> {renvoiEnCoursId === p.id ? "Annulation..." : "Le client a refusé — proposer d'autres créneaux"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Sous-composant : vue Offres commerciales
// ============================================================
function VueOffres({ code, clients, showToast }) {
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [recherche, setRecherche] = useState("");
  const [selectionIds, setSelectionIds] = useState(new Set());
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [offresPretes, setOffresPretes] = useState(null); // lignes créées, prêtes à envoyer une à une
  const [offresEnvoyees, setOffresEnvoyees] = useState(new Set());
  const [ajoutClientsOuvert, setAjoutClientsOuvert] = useState(false);
  const [rechercheAjout, setRechercheAjout] = useState("");
  const [selectionAjoutIds, setSelectionAjoutIds] = useState(new Set());
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [historique, setHistorique] = useState(null);
  const [chargementHistorique, setChargementHistorique] = useState(true);
  const [filtreHistorique, setFiltreHistorique] = useState("toutes");
  const [titreAReprendre, setTitreAReprendre] = useState("");

  async function chargerHistorique() {
    setChargementHistorique(true);
    const rows = await chargerToutesOffres(code);
    setHistorique(rows);
    setChargementHistorique(false);
  }

  useEffect(() => { chargerHistorique(); }, [code]);

  const clientsFiltres = recherche.trim()
    ? clients.filter(c => c.etablissement.toLowerCase().includes(recherche.toLowerCase()) || (c.ville || "").toLowerCase().includes(recherche.toLowerCase()))
    : clients;

  function toggleSelection(id) {
    setSelectionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function creerEtPreparer() {
    if (!titre.trim() || !description.trim() || selectionIds.size === 0) {
      showToast("Renseigne un titre, une description, et sélectionne au moins une pharmacie", "error");
      return;
    }
    setEnvoiEnCours(true);
    const lignes = Array.from(selectionIds).map(id => {
      const c = clients.find(cl => cl.id === id);
      return {
        code, offre_titre: titre.trim(), offre_description: description.trim(), offre_image_url: imageUrl.trim() || null,
        client_id: id, client_nom: c?.etablissement || "Client", client_email: c?.email || null,
        statut: "envoye",
      };
    });
    const rows = await creerOffresClients(lignes);
    setEnvoiEnCours(false);
    if (!rows) { showToast("Erreur lors de la création de l'offre", "error"); return; }
    setOffresPretes(rows);
    setOffresEnvoyees(new Set());
    showToast(`Offre créée pour ${rows.length} pharmacie${rows.length > 1 ? "s" : ""} — prépare l'envoi ci-dessous`, "ok");
  }

  function envoyerUnEmail(row) {
    const lien = `${window.location.origin}${window.location.pathname}?offre=${row.id}`;
    const sujet = encodeURIComponent(row.offre_titre);
    const corps = encodeURIComponent(`Bonjour,\n\n${row.offre_description}\n\nMerci de me faire part de votre réponse via ce lien :\n${lien}\n\nCordialement`);
    window.location.href = `mailto:${row.client_email || ""}?subject=${sujet}&body=${corps}`;
    setOffresEnvoyees(prev => new Set([...prev, row.id]));
  }

  function toggleSelectionAjout(id) {
    setSelectionAjoutIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const idsDejaDansOffre = new Set((offresPretes || []).map(r => r.client_id));
  const clientsFiltresAjout = clients.filter(c => !idsDejaDansOffre.has(c.id)
    && (!rechercheAjout.trim() || c.etablissement.toLowerCase().includes(rechercheAjout.toLowerCase()) || (c.ville || "").toLowerCase().includes(rechercheAjout.toLowerCase())));

  async function ajouterClientsAOffre() {
    if (selectionAjoutIds.size === 0 || !offresPretes || offresPretes.length === 0) return;
    setAjoutEnCours(true);
    const reference = offresPretes[0];
    const lignes = Array.from(selectionAjoutIds).map(id => {
      const c = clients.find(cl => cl.id === id);
      return {
        code, offre_titre: reference.offre_titre, offre_description: reference.offre_description, offre_image_url: reference.offre_image_url || null,
        client_id: id, client_nom: c?.etablissement || "Client", client_email: c?.email || null,
        statut: "envoye",
      };
    });
    const rows = await creerOffresClients(lignes);
    setAjoutEnCours(false);
    if (!rows) { showToast("Erreur lors de l'ajout des pharmacies", "error"); return; }
    setOffresPretes(prev => [...prev, ...rows]);
    setSelectionAjoutIds(new Set());
    setRechercheAjout("");
    setAjoutClientsOuvert(false);
    showToast(`${rows.length} pharmacie${rows.length > 1 ? "s" : ""} ajoutée${rows.length > 1 ? "s" : ""} à l'offre`, "ok");
  }

  function toutRecommencer() {
    setTitre(""); setDescription(""); setImageUrl(""); setSelectionIds(new Set()); setOffresPretes(null); setOffresEnvoyees(new Set());
    setAjoutClientsOuvert(false); setSelectionAjoutIds(new Set()); setRechercheAjout("");
    chargerHistorique();
  }

  const STATUT_BADGE = {
    envoye: { label: "Envoyé — sans réponse", bg: "#FBF0DA", color: "#7A5C00" },
    accepte: { label: "Accepté", bg: "#DCEAE0", color: "#27500A" },
    refuse: { label: "Refusé", bg: "#FCEEED", color: "#8A3530" },
  };

  const historiqueFiltre = (historique || []).filter(o => filtreHistorique === "toutes" ? true : o.statut === filtreHistorique);

  // Liste des offres distinctes déjà envoyées (par titre), pour pouvoir les reprendre et les compléter
  const offresDistinctes = Array.from(
    new Map((historique || []).map(o => [o.offre_titre, o])).values()
  );

  function reprendreOffre(offreTitreRef) {
    const lignesExistantes = (historique || []).filter(o => o.offre_titre === offreTitreRef);
    if (lignesExistantes.length === 0) return;
    setTitre(lignesExistantes[0].offre_titre);
    setDescription(lignesExistantes[0].offre_description || "");
    setImageUrl(lignesExistantes[0].offre_image_url || "");
    setOffresPretes(lignesExistantes);
    setOffresEnvoyees(new Set(lignesExistantes.map(l => l.id))); // déjà envoyées précédemment
  }
  const nbAcceptees = (historique || []).filter(o => o.statut === "accepte").length;
  const nbRefusees = (historique || []).filter(o => o.statut === "refuse").length;
  const nbSansReponse = (historique || []).filter(o => o.statut === "envoye").length;

  const titresDistincts = Array.from(new Set((historique || []).map(o => o.offre_titre))).sort();

  function reprendreOffre() {
    if (!titreAReprendre) return;
    const lignesExistantes = (historique || []).filter(o => o.offre_titre === titreAReprendre);
    if (lignesExistantes.length === 0) return;
    setOffresPretes(lignesExistantes);
    setOffresEnvoyees(new Set());
    setAjoutClientsOuvert(true);
    setTitreAReprendre("");
    showToast(`Offre "${titreAReprendre}" chargée — ajoute de nouvelles pharmacies ci-dessus`, "ok");
  }

  return (
    <div className="tr-grid">
      <div className="tr-card">
        <div className="tr-card-title"><Mail size={14}/> Nouvelle offre commerciale</div>
        {!offresPretes ? (
          <>
            {offresDistinctes.length > 0 && (
              <div className="tr-field">
                <label className="tr-label">Ou compléter une offre déjà envoyée</label>
                <select className="tr-select" defaultValue="" onChange={e => { if (e.target.value) reprendreOffre(e.target.value); e.target.value = ""; }}>
                  <option value="" disabled>Choisir une offre existante...</option>
                  {offresDistinctes.map(o => (
                    <option key={o.offre_titre} value={o.offre_titre}>{o.offre_titre}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="tr-field">
              <label className="tr-label">Titre de l'offre</label>
              <input className="tr-input" placeholder="Ex: Offre spéciale rentrée" value={titre} onChange={e => setTitre(e.target.value)} />
            </div>
            <div className="tr-field">
              <label className="tr-label">Description</label>
              <textarea className="tr-input" style={{ height:120, resize:"vertical" }} placeholder="Détail de l'offre, conditions, dates de validité..." value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="tr-field">
              <label className="tr-label">Image d'illustration (optionnel — URL)</label>
              <input className="tr-input" placeholder="https://..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
              <p style={{ fontSize:11, color:"var(--gris)", marginTop:6, marginBottom:0 }}>L'image ne peut pas s'afficher dans l'email lui-même (limite technique), mais apparaîtra sur la page que le client ouvre en cliquant sur le lien.</p>
            </div>
            <div className="tr-field">
              <label className="tr-label">Pharmacies concernées ({selectionIds.size} sélectionnée{selectionIds.size > 1 ? "s" : ""})</label>
              <div className="tr-search">
                <Search size={15} />
                <input className="tr-input" placeholder="Rechercher un établissement ou une ville..." value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              </div>
              <div className="tr-clients-list">
                {clientsFiltres.slice(0, 60).map(c => (
                  <div key={c.id} className="tr-client-row" onClick={() => toggleSelection(c.id)} style={{ cursor:"pointer" }}>
                    <div style={{ width:18, height:18, borderRadius:4, border:"1.5px solid", borderColor: selectionIds.has(c.id) ? "var(--orange)" : "var(--gris-clair)", background: selectionIds.has(c.id) ? "var(--orange)" : "white", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {selectionIds.has(c.id) && <CheckCircle2 size={12} color="white" strokeWidth={3}/>}
                    </div>
                    <div className="tr-client-row-main">
                      <div className="tr-client-row-name">{c.etablissement}</div>
                      <div className="tr-client-row-meta">{c.ville}{!c.email ? " · pas d'email connu" : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button className="tr-btn tr-btn-primary tr-btn-full" onClick={creerEtPreparer} disabled={envoiEnCours}>
              <Mail size={14}/> {envoiEnCours ? "Création..." : "Créer l'offre et préparer les envois"}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontFamily:"'Oswald',sans-serif", fontSize:16, fontWeight:600, marginBottom:4 }}>{offresPretes[0]?.offre_titre}</div>
            <div style={{ fontSize:13, color:"var(--gris)", marginBottom:14, lineHeight:1.5 }}>
              Clique sur chaque pharmacie pour ouvrir l'email pré-rempli (un par un, ta messagerie s'ouvre à chaque clic).
            </div>
            {offresPretes.map(row => (
              <div key={row.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"10px 12px", border:"1.5px solid var(--gris-clair)", borderRadius:8, marginBottom:8 }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13.5 }}>{row.client_nom}</div>
                  <div style={{ fontSize:11.5, color:"var(--gris)" }}>{row.client_email || "pas d'email connu"}</div>
                </div>
                <button className="tr-btn tr-btn-sm" style={{ background: offresEnvoyees.has(row.id) ? "var(--vert)" : "var(--orange)", color:"white", border:"none" }}
                  onClick={() => envoyerUnEmail(row)}>
                  {offresEnvoyees.has(row.id) ? <><CheckCircle2 size={12}/> Envoyé</> : <><Mail size={12}/> Envoyer</>}
                </button>
              </div>
            ))}

            {!ajoutClientsOuvert ? (
              <button className="tr-btn tr-btn-outline tr-btn-full" style={{ marginTop:6 }} onClick={() => setAjoutClientsOuvert(true)}>
                <Plus size={14}/> Ajouter d'autres pharmacies à cette offre
              </button>
            ) : (
              <div style={{ background:"#FAFAF8", border:"1.5px solid var(--gris-clair)", borderRadius:10, padding:14, marginTop:6 }}>
                <label className="tr-label">Ajouter des pharmacies ({selectionAjoutIds.size} sélectionnée{selectionAjoutIds.size > 1 ? "s" : ""})</label>
                <div className="tr-search">
                  <Search size={15} />
                  <input className="tr-input" placeholder="Rechercher un établissement ou une ville..." value={rechercheAjout} onChange={(e) => setRechercheAjout(e.target.value)} />
                </div>
                <div className="tr-clients-list" style={{ maxHeight:240 }}>
                  {clientsFiltresAjout.slice(0, 60).map(c => (
                    <div key={c.id} className="tr-client-row" onClick={() => toggleSelectionAjout(c.id)} style={{ cursor:"pointer" }}>
                      <div style={{ width:18, height:18, borderRadius:4, border:"1.5px solid", borderColor: selectionAjoutIds.has(c.id) ? "var(--orange)" : "var(--gris-clair)", background: selectionAjoutIds.has(c.id) ? "var(--orange)" : "white", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {selectionAjoutIds.has(c.id) && <CheckCircle2 size={12} color="white" strokeWidth={3}/>}
                      </div>
                      <div className="tr-client-row-main">
                        <div className="tr-client-row-name">{c.etablissement}</div>
                        <div className="tr-client-row-meta">{c.ville}{!c.email ? " · pas d'email connu" : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button className="tr-btn tr-btn-outline" style={{ flex:1, fontSize:12 }} onClick={() => { setAjoutClientsOuvert(false); setSelectionAjoutIds(new Set()); }}>Annuler</button>
                  <button className="tr-btn tr-btn-primary" style={{ flex:2, fontSize:12 }} onClick={ajouterClientsAOffre} disabled={ajoutEnCours || selectionAjoutIds.size === 0}>
                    {ajoutEnCours ? "Ajout..." : `Ajouter ${selectionAjoutIds.size} pharmacie${selectionAjoutIds.size > 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            )}

            <button className="tr-btn tr-btn-outline tr-btn-full" style={{ marginTop:10 }} onClick={toutRecommencer}>
              <Plus size={14}/> Nouvelle offre (différente)
            </button>
          </>
        )}
      </div>

      <div className="tr-card">
        <div className="tr-card-title" style={{ justifyContent:"space-between" }}>
          <span style={{ display:"flex", alignItems:"center", gap:7 }}><History size={14}/> Historique des offres</span>
          <button className="tr-btn tr-btn-sm tr-btn-outline" onClick={chargerHistorique}><RefreshCw size={12}/> Actualiser</button>
        </div>

        {titresDistincts.length > 0 && (
          <div style={{ background:"#F5F2EC", borderRadius:8, padding:12, marginBottom:16 }}>
            <label className="tr-label">Compléter une offre déjà envoyée</label>
            <select className="tr-select" value={titreAReprendre} onChange={e => setTitreAReprendre(e.target.value)} style={{ marginBottom:8 }}>
              <option value="">— Choisir une offre —</option>
              {titresDistincts.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="tr-btn tr-btn-outline tr-btn-full" style={{ fontSize:12 }} disabled={!titreAReprendre} onClick={reprendreOffre}>
              <Plus size={13}/> Ajouter des pharmacies à cette offre
            </button>
          </div>
        )}

        <div className="tr-mode-row" style={{ marginBottom:16 }}>
          <button className={`tr-mode-btn ${filtreHistorique === "toutes" ? "active" : ""}`} onClick={() => setFiltreHistorique("toutes")}>Toutes ({(historique || []).length})</button>
          <button className={`tr-mode-btn ${filtreHistorique === "envoye" ? "active" : ""}`} onClick={() => setFiltreHistorique("envoye")}>Sans réponse ({nbSansReponse})</button>
          <button className={`tr-mode-btn ${filtreHistorique === "accepte" ? "active" : ""}`} onClick={() => setFiltreHistorique("accepte")}>Acceptées ({nbAcceptees})</button>
          <button className={`tr-mode-btn ${filtreHistorique === "refuse" ? "active" : ""}`} onClick={() => setFiltreHistorique("refuse")}>Refusées ({nbRefusees})</button>
        </div>
        {chargementHistorique && <div className="tr-empty"><RefreshCw size={22} style={{ marginBottom:8, opacity:0.5 }}/><br/>Chargement...</div>}
        {!chargementHistorique && historiqueFiltre.length === 0 && <div className="tr-empty">Aucune offre à afficher ici.</div>}
        {!chargementHistorique && historiqueFiltre.map(o => {
          const badge = STATUT_BADGE[o.statut] || STATUT_BADGE.envoye;
          return (
            <div key={o.id} style={{ border:"1.5px solid var(--gris-clair)", borderRadius:10, padding:14, marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:6 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>{o.client_nom}</div>
                  <div style={{ fontSize:12, color:"var(--gris)" }}>{o.offre_titre}</div>
                </div>
                <span className="tr-badge" style={{ background:badge.bg, color:badge.color }}>{badge.label}</span>
              </div>
              <div style={{ fontSize:11, color:"var(--gris)" }}>
                Envoyée le {formatDateCourt(o.created_at?.slice(0,10))}
                {o.reponse_le ? ` · réponse le ${formatDateCourt(o.reponse_le.slice(0,10))}` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Sous-composant : vue Semaine
// ============================================================
function SemaineView({ departs, definirDepartJour, rdvParJourCalcule, joursTries, ouvrirPlanB, domicile, definirDomicile, appliquerDomicileAuJour, agendaRdvs, setAgendaRdvs, supprimerVisite, supprimerRdvAgenda, periodesBloquees, setPeriodesBloquees, clients, clientsById, onOuvrirFiche, onChercherCreneau, setVue }) {
  const [nouveauJour, setNouveauJour] = useState("");
  const [adresseInput, setAdresseInput] = useState("");
  const [heureInput, setHeureInput] = useState("08:30");
  const [domicileInput, setDomicileInput] = useState(domicile ? domicile.adresse : "");
  const [domicileHeureInput, setDomicileHeureInput] = useState(domicile ? domicile.heure : "08:30");
  const [enregistrementDomicile, setEnregistrementDomicile] = useState(false);
  const [showPeriodeForm, setShowPeriodeForm] = useState(false);
  const [periodeDebut, setPeriodeDebut] = useState("");
  const [periodeFin, setPeriodeFin] = useState("");
  const [periodeNom, setPeriodeNom] = useState("");
  const [hotelSuggConfirmees, setHotelSuggConfirmees] = useState({});

  const aujourdHui = dateToKey(new Date());
  const joursAgenda = (agendaRdvs || []).map(r => r.jour).filter(Boolean);

  function estBloque(dateKey) {
    return (periodesBloquees || []).some(p => dateKey >= p.debut && dateKey <= p.fin);
  }

  // Ajoute la veille de chaque jour ayant un point de départ particulier (ex: hôtel réservé),
  // pour pouvoir y proposer des clients proches en fin de journée précédente, même si ce jour-là est vide.
  const veillesDeparts = Object.keys(departs)
    .filter(d => departs[d] && (!domicile || departs[d].adresse !== domicile.adresse))
    .map(d => {
      const veille = new Date(d + "T00:00:00");
      veille.setDate(veille.getDate() - 1);
      return dateToKey(veille);
    });

  const joursAffiches = Array.from(new Set([...joursTries, ...Object.keys(departs), ...joursAgenda, ...veillesDeparts]))
    .filter(d => d >= aujourdHui && !estBloque(d))
    .sort();

  const CIBLAGE_OK = ["COMPTE CLE", "PLATINIUM", "GOLD", "SILVER", "BRONZE", "PROSPECTS 1"];

  function getSuggestions(dateKey) {
    const seq = rdvParJourCalcule[dateKey] || [];
    const rdvAgenda = (agendaRdvs || []).filter(r => r.jour === dateKey && !r.overrideTournee);
    const totalRdv = seq.length + rdvAgenda.length;
    if (totalRdv >= 5) return [];

    const departJour = departs[dateKey];
    const departJourSpecial = departJour && (!domicile || departJour.adresse !== domicile.adresse) ? departJour : null;

    // Si le lendemain a un point de départ particulier (ex: hôtel réservé pour une nuitée),
    // on cherche aussi des clients proches de cet endroit pour terminer la journée dans ce secteur.
    const lendemainDate = new Date(dateKey + "T00:00:00");
    lendemainDate.setDate(lendemainDate.getDate() + 1);
    const lendemainKey = dateToKey(lendemainDate);
    const departLendemain = departs[lendemainKey];
    const departLendemainSpecial = departLendemain && (!domicile || departLendemain.adresse !== domicile.adresse) ? departLendemain : null;

    // Sur un jour totalement vide, on ne propose des suggestions que s'il y a un ancrage pertinent
    // (point de départ précis ce jour-là, ou hôtel programmé le lendemain) — pas juste le domicile,
    // pour éviter de suggérer sur absolument tous les jours libres.
    if (totalRdv === 0 && !departJourSpecial && !departLendemainSpecial) return [];

    const dejaPlanifies = new Set([
      ...Object.values(rdvParJourCalcule).flat().map(r => r.client.id),
      ...(agendaRdvs || []).filter(r => r.clientId).map(r => r.clientId),
    ]);

    const pointsNormaux = [
      ...(departJour ? [departJour.coords] : domicile ? [domicile.coords] : []),
      ...seq.filter(r => r.coords).map(r => r.coords),
    ].filter(Boolean);
    const pointHotel = departLendemainSpecial ? departLendemainSpecial.coords : null;

    // Dernier point connu de la journée (dernière visite, ou point de départ, ou domicile) —
    // sert de départ pour calculer le détour réel jusqu'à l'hôtel, pas juste la distance au point final.
    let dernierPointJournee = null;
    if (seq.length > 0) {
      const avecCoords = seq.filter(r => r.coords);
      if (avecCoords.length > 0) {
        dernierPointJournee = [...avecCoords].sort((a, b) => (a.heureArrivee || 0) - (b.heureArrivee || 0)).slice(-1)[0].coords;
      }
    }
    if (!dernierPointJournee) dernierPointJournee = departJour ? departJour.coords : (domicile ? domicile.coords : null);
    const routeDirecte = (dernierPointJournee && pointHotel) ? estimerTrajetMin(dernierPointJournee, pointHotel) : null;

    if (pointsNormaux.length === 0 && !pointHotel) return [];

    return (clients || [])
      .filter(c => c.coords && CIBLAGE_OK.includes(c.ciblage) && !dejaPlanifies.has(c.id))
      .map(c => {
        // Seuil plus large pour un client sur le chemin de l'hôtel du lendemain : finir la journée
        // là-bas est acceptable même avec un peu plus de route, contrairement à un simple détour entre deux visites.
        const distNormal = pointsNormaux.length ? Math.min(...pointsNormaux.map(p => estimerTrajetMin(p, c.coords) || 999)) : Infinity;

        let detourViaHotel = Infinity;
        if (dernierPointJournee && pointHotel && routeDirecte !== null) {
          const aC = estimerTrajetMin(dernierPointJournee, c.coords);
          const cB = estimerTrajetMin(c.coords, pointHotel);
          if (aC !== null && cB !== null) detourViaHotel = aC + cB - routeDirecte;
        }
        const distHotelDirecte = pointHotel ? (estimerTrajetMin(pointHotel, c.coords) ?? 999) : Infinity;
        const meilleurHotel = Math.min(detourViaHotel, distHotelDirecte);

        const viaHotel = meilleurHotel < distNormal;
        return { client: c, trajet: viaHotel ? meilleurHotel : distNormal, score: CIBLAGE_SCORE[c.ciblage] || 0, viaHotel };
      })
      .filter(x => x.viaHotel ? x.trajet <= 45 : x.trajet <= 20)
      .sort((a, b) => a.trajet - b.trajet || b.score - a.score)
      .slice(0, 5 - totalRdv);
  }

  // Les suggestions "via hôtel" sont d'abord estimées à vol d'oiseau (ci-dessus, pour un affichage
  // immédiat), puis vérifiées ici avec un vrai calcul d'itinéraire routier — indispensable en cas
  // d'obstacle géographique (estuaire, côte...) où la ligne droite sous-estime fortement le trajet réel.
  useEffect(() => {
    let annule = false;
    async function verifier() {
      const resultats = {};
      for (const dateKey of joursAffiches) {
        const brut = getSuggestions(dateKey).filter(s => s.viaHotel);
        if (brut.length === 0) continue;
        const lendemainDate = new Date(dateKey + "T00:00:00");
        lendemainDate.setDate(lendemainDate.getDate() + 1);
        const lendemainKey = dateToKey(lendemainDate);
        const departLendemain = departs[lendemainKey];
        if (!departLendemain || !departLendemain.coords) continue;
        const affinees = await Promise.all(brut.map(async s => {
          const trajetReel = await estimerTrajetMinReel(departLendemain.coords, s.client.coords);
          return { ...s, trajet: trajetReel ?? 999 };
        }));
        resultats[dateKey] = affinees.filter(s => s.trajet <= 45).sort((a, b) => a.trajet - b.trajet);
      }
      if (!annule) setHotelSuggConfirmees(prev => ({ ...prev, ...resultats }));
    }
    verifier();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(joursAffiches), JSON.stringify(departs), domicile?.adresse]);

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

  function ajouterPeriode() {
    if (!periodeDebut || !periodeFin || !periodeNom.trim()) return;
    setPeriodesBloquees(prev => [...(prev || []), { id: uid(), nom: periodeNom.trim(), debut: periodeDebut, fin: periodeFin }]);
    setPeriodeDebut(""); setPeriodeFin(""); setPeriodeNom(""); setShowPeriodeForm(false);
  }

  function supprimerPeriode(id) {
    setPeriodesBloquees(prev => (prev || []).filter(p => p.id !== id));
  }

  return (
    <div className="tr-grid">
      <div>
        {/* Domicile */}
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

        {/* Départ jour précis */}
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

        {/* Périodes bloquées */}
        <div className="tr-card">
          <div className="tr-card-title" style={{ justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}><span>🚫</span> Périodes bloquées</span>
            <button className="tr-btn tr-btn-sm tr-btn-outline" onClick={() => setShowPeriodeForm(s => !s)} style={{ fontSize: 11 }}>
              <Plus size={12} /> Ajouter
            </button>
          </div>
          {showPeriodeForm && (
            <div style={{ background: "#F5F2EC", borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div className="tr-field">
                <label className="tr-label">Nom</label>
                <input className="tr-input" placeholder="Congés, Séminaire IBSA..." value={periodeNom} onChange={e => setPeriodeNom(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="tr-label">Du</label>
                  <input className="tr-input" type="date" value={periodeDebut} min={aujourdHui} onChange={e => setPeriodeDebut(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="tr-label">Au</label>
                  <input className="tr-input" type="date" value={periodeFin} min={periodeDebut || aujourdHui} onChange={e => setPeriodeFin(e.target.value)} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="tr-btn tr-btn-outline" style={{ flex: 1, fontSize: 12 }} onClick={() => setShowPeriodeForm(false)}>Annuler</button>
                <button className="tr-btn tr-btn-primary" style={{ flex: 2, fontSize: 12 }} onClick={ajouterPeriode} disabled={!periodeDebut || !periodeFin || !periodeNom.trim()}>Enregistrer</button>
              </div>
            </div>
          )}
          {(periodesBloquees || []).length === 0 && !showPeriodeForm && (
            <div style={{ fontSize: 12.5, color: "var(--gris)" }}>Aucune période bloquée</div>
          )}
          {(periodesBloquees || []).map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px dashed var(--gris-clair)", fontSize: 13 }}>
              <div>
                <strong style={{ color: "var(--rouge)" }}>🚫 {p.nom}</strong>
                <div style={{ fontSize: 11, color: "var(--gris)" }}>{formatDateCourt(p.debut)} → {formatDateCourt(p.fin)}</div>
              </div>
              <button onClick={() => supprimerPeriode(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--rouge)", padding: 4 }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Vue semaine */}
      <div className="tr-card">
        <div className="tr-card-title"><Calendar size={14} /> Vue de la semaine</div>
        {joursAffiches.length === 0 ? (
          <div className="tr-empty">Aucun jour planifié. Commence par définir ton domicile ou un point de départ à gauche.</div>
        ) : (
          joursAffiches.map((dateKey) => {
            const depart = departs[dateKey];
            const seq = rdvParJourCalcule[dateKey] || [];
            const clientIdsSeq = new Set(seq.map(item => item.client.id));
            const rdvAgendaJour = (agendaRdvs || []).filter(r =>
              r.jour === dateKey && !r.overrideTournee && !(r.clientId && clientIdsSeq.has(r.clientId))
            );
            const totalRdv = seq.length + rdvAgendaJour.length;
            const suggestionsBrutes = getSuggestions(dateKey);
            const suggestionsNormales = suggestionsBrutes.filter(s => !s.viaHotel);
            const suggestionsHotelConfirmees = hotelSuggConfirmees[dateKey] || [];
            const suggestions = [...suggestionsNormales, ...suggestionsHotelConfirmees].slice(0, Math.max(0, 5 - totalRdv));

            return (
              <div className="tr-jour-block" key={dateKey}>
                <div className="tr-jour-block-head">
                  <span>{formatDateFr(dateKey)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {totalRdv} RDV{depart ? ` · Départ ${depart.heure}` : ""}
                    {suggestions.length > 0 && (
                      <span style={{ fontSize: 10, background: "var(--or)", color: "white", borderRadius: 999, padding: "2px 7px", fontFamily: "'Oswald',sans-serif" }}>
                        💡 {suggestions.length}
                      </span>
                    )}
                  </span>
                </div>
                <div className="tr-jour-block-body">
                  {!depart && rdvAgendaJour.length === 0 && seq.length === 0 && (
                    <div style={{ fontSize: 12.5, color: "var(--gris)", padding: "6px 0" }}>Pas de point de départ défini pour ce jour</div>
                  )}
                  {seq.length === 0 && rdvAgendaJour.length === 0 && depart && (
                    <div style={{ fontSize: 12.5, color: "var(--gris)", padding: "6px 0" }}>Aucun RDV ce jour</div>
                  )}

                  {/* Toutes les visites triées chronologiquement + suggestions intercalées */}
                  {(() => {
                    // Construire liste unifiée triée par heure
                    const lignes = [];

                    // Visites Tournée
                    seq.forEach(item => {
                      const override = (agendaRdvs || []).find(r => r.overrideTournee === item.client.id && r.jour === dateKey);
                      const heureMin = override ? hhmmToMin(override.debut) : item.heureArrivee;
                      const heureAff = override ? override.debut.replace(":", "h") : minToHHMM(item.heureArrivee);
                      const heureInp = override ? override.debut : minToHHMMInput(item.heureArrivee);
                      lignes.push({ type: "tournee", heureMin, heureAff, heureInp, item });
                    });

                    // RDV Agenda
                    rdvAgendaJour.forEach(r => {
                      const heureMin = r.debut ? hhmmToMin(r.debut) : 0;
                      lignes.push({ type: "agenda", heureMin, r });
                    });

                    // Trier par heure
                    lignes.sort((a, b) => a.heureMin - b.heureMin);

                    // Intercaler les suggestions normales entre les RDV ; les suggestions "près de l'hôtel"
                    // restent en fin de journée puisqu'elles n'ont de sens qu'en dernière étape avant la nuitée.
                    const result = [];
                    let suggIdx = 0;
                    const suggsTriees = suggestions.filter(s => !s.viaHotel);
                    const suggsHotel = suggestions.filter(s => s.viaHotel);

                    lignes.forEach((l, i) => {
                      result.push(l);
                      // Après chaque RDV, insérer la prochaine suggestion si disponible
                      if (suggIdx < suggsTriees.length) {
                        result.push({ type: "suggestion", s: suggsTriees[suggIdx] });
                        suggIdx++;
                      }
                    });

                    // Suggestions normales restantes à la fin
                    while (suggIdx < suggsTriees.length) {
                      result.push({ type: "suggestion", s: suggsTriees[suggIdx] });
                      suggIdx++;
                    }

                    // Suggestions "près de l'hôtel" toujours en toute dernière position de la journée
                    suggsHotel.forEach(s => result.push({ type: "suggestion", s }));

                    return result.map((l, idx) => {
                      if (l.type === "tournee") {
                        const { heureAff, heureInp, item } = l;
                        return (
                          <div key={item.client.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 4px", borderBottom: "1px dashed var(--gris-clair)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRESSION_COLOR[item.client.pression] || "var(--gris)", flexShrink: 0 }} />
                            <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 13, minWidth: 42, color: "var(--ardoise)", flexShrink: 0 }}>{heureAff}</span>
                            <span style={{ flex: 1, fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ardoise)", cursor: "pointer" }}
                              onClick={() => onOuvrirFiche && onOuvrirFiche(item.client)}>
                              {item.client.etablissement}
                            </span>
                            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                              <BoutonAgenda pharmacie={item.client} date={dateKey} heure={heureInp} duree={item.client.dureeDefaut || 45} onSave={(rdv) => setAgendaRdvs((prev) => [...(prev || []), rdv])} />
                              <button title="Lapin" onClick={() => ouvrirPlanB(dateKey, item)}
                                style={{ background: "transparent", border: "1.5px solid var(--ardoise)", color: "var(--ardoise)", borderRadius: 6, cursor: "pointer", padding: "4px 6px", display: "inline-flex", alignItems: "center" }}>
                                <ShieldAlert size={11} />
                              </button>
                              <button title="Supprimer" onClick={() => { if (window.confirm("Supprimer " + item.client.etablissement + " ?")) supprimerVisite(dateKey, item.client.id); }}
                                style={{ background: "transparent", border: "1.5px solid var(--rouge)", color: "var(--rouge)", borderRadius: 6, cursor: "pointer", padding: "4px 6px", display: "inline-flex", alignItems: "center" }}>
                                <X size={11} />
                              </button>
                            </div>
                          </div>
                        );
                      }
                      if (l.type === "agenda") {
                        const { r } = l;
                        const heureAff = r.debut ? r.debut.replace(":", "h") : "—";
                        const titre = r.titre || "RDV Agenda";
                        const isPersonnel = r.type === "personal" || r.source === "google";
                        return (
                          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderBottom: "1px dashed var(--gris-clair)", borderLeft: "3px solid " + (isPersonnel ? "var(--gris)" : "var(--vert)"), background: "var(--vert-clair)", borderRadius: "0 6px 6px 0" }}>
                            <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 600, fontSize: 13, minWidth: 42, color: "var(--ardoise)", flexShrink: 0 }}>{heureAff}</span>
                            <span style={{ flex: 1, fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titre}</span>
                            <span style={{ fontSize: 10, color: isPersonnel ? "var(--gris)" : "var(--vert)", fontWeight: 600, flexShrink: 0 }}>{isPersonnel ? "Perso" : "Agenda"}</span>
                            <button title="Supprimer" onClick={() => { if (window.confirm("Supprimer " + titre + " ?")) supprimerRdvAgenda(r.id); }}
                              style={{ background: "transparent", border: "1.5px solid var(--rouge)", color: "var(--rouge)", borderRadius: 6, cursor: "pointer", padding: "4px 6px", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                              <X size={11} />
                            </button>
                          </div>
                        );
                      }
                      if (l.type === "suggestion") {
                        const { s } = l;
                        return (
                          <div key={"sugg-" + s.client.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderLeft: "3px solid var(--or)", background: "#FFFBEC", borderRadius: "0 6px 6px 0", marginTop: 1 }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>{s.viaHotel ? "🏨" : "💡"}</span>
                            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ardoise)" }}>
                              {s.client.etablissement}
                              <span style={{ fontWeight: 400, color: "var(--gris)", marginLeft: 5 }}>{s.trajet} min{s.viaHotel ? " de l'hôtel" : ""}</span>
                            </span>
                            <span style={{ fontSize: 10, fontFamily: "'Oswald',sans-serif", color: "var(--or)", flexShrink: 0 }}>{s.client.ciblage}</span>
                            <button onClick={() => { if (onChercherCreneau) onChercherCreneau(s.client, { type: "date", date: dateKey }); if (setVue) setVue("prochain-rdv"); }}
                              style={{ background: "var(--or)", border: "none", color: "white", borderRadius: 6, cursor: "pointer", padding: "4px 8px", fontSize: 11, fontFamily: "'Oswald',sans-serif", textTransform: "uppercase", flexShrink: 0 }}>
                              + Planifier
                            </button>
                          </div>
                        );
                      }
                      return null;
                    });
                  })()}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
