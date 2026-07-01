import React, { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { MapPin, Clock, Upload, RefreshCw, Calendar, AlertCircle, CheckCircle2, Sparkles, Trophy, ShieldAlert, Phone, Mail, History, X, Search, ChevronDown, ChevronLeft, ChevronRight, Plus, Save } from "lucide-react";
import AgendaView from "./AgendaView";
import BoutonAgenda from "./components/BoutonAgenda";
import AssistantVocal from "./components/AssistantVocal";

// ============================================================
// Constantes
// ============================================================
const VITESSE_MOYENNE_KMH = 38;
const COEF_ROUTE = 1.3;
const JOURNEE_DEBUT = 8 * 60;
const JOURNEE_FIN = 19 * 60;

const PRESSION_SCORE = { Rouge: 3, Orange: 2, Vert: 1 };
const CIBLAGE_SCORE = {
  "COMPTE CLE": 8, PLATINIUM: 7, OR: 6, ARGENT: 5,
  BRONZE: 4, "PERSPECTIVES 1": 3, "PERSPECTIVES 2": 2, "PERSPECTIVES 3": 1,
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

function dateToKey(d) { return d.toISOString().slice(0, 10); }

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

function uid() { return Math.random().toString(36).slice(2, 10); }

// ============================================================
// Utilitaire contact manquant
// ============================================================
function contactManquant(client) {
  return !client.mobile_titulaire || !client.mail_titulaire;
}

// ============================================================
// Composant FicheClient (modal édition contact)
// ============================================================
function FicheClient({ client, onSave, onClose }) {
  const [mobile, setMobile] = useState(client.mobile_titulaire || "");
  const [mail, setMail]     = useState(client.mail_titulaire   || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(client.id, {
      mobile_titulaire: mobile.trim() || null,
      mail_titulaire:   mail.trim()   || null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const mobileMissing = !mobile.trim();
  const mailMissing   = !mail.trim();

  const lbl = { display:"block", fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#8A93A0", marginBottom:5, fontWeight:600 };
  const inp = { width:"100%", padding:"9px 11px", border:"1.5px solid #DCD7CB", borderRadius:6, fontSize:14, fontFamily:"inherit", color:"#1C2630", background:"#F5F2EC", boxSizing:"border-box" };
  const btn = { fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", letterSpacing:"0.04em", fontSize:13, padding:"10px 16px", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, border:"none" };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(28,38,48,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:20 }} onClick={onClose}>
      <div style={{ background:"white", borderRadius:12, padding:22, maxWidth:420, width:"100%", maxHeight:"90vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:13, color:"#8A93A0", marginBottom:4 }}>Fiche client</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ width:10, height:10, borderRadius:"50%", flexShrink:0, background: PRESSION_COLOR[client.pression] || "var(--gris-clair)" }}/>
              <span style={{ fontFamily:"'Oswald',sans-serif", fontSize:17, fontWeight:600, color:"#1C2630" }}>{client.etablissement}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#8A93A0", padding:0 }}><X size={18}/></button>
        </div>

        {/* Infos lecture seule */}
        <div style={{ background:"#F5F2EC", borderRadius:8, padding:"10px 12px", marginBottom:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[
            { label:"Ville", value: client.ville },
            { label:"CP", value: client.cp },
            { label:"Ciblage", value: client.ciblage },
            { label:"Pression", value: client.pression },
            { label:"UGA", value: client.uga },
            { label:"Groupement", value: client.groupement },
          ].filter(x => x.value).map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize:10, color:"#8A93A0", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600 }}>{label}</div>
              <div style={{ fontSize:13, color:"#1C2630", fontWeight:500 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tél standard depuis Excel */}
        {(client.tel1 || client.tel2) && (
          <div style={{ marginBottom:12 }}>
            <div style={lbl}>Tél. standard (Excel)</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {client.tel1 && (
                <a href={`tel:${client.tel1}`} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", background:"#F5F2EC", border:"1px solid #DCD7CB", borderRadius:6, fontSize:13, color:"#1C2630", textDecoration:"none" }}>
                  <Phone size={12}/> {client.tel1}
                </a>
              )}
              {client.tel2 && (
                <a href={`tel:${client.tel2}`} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", background:"#F5F2EC", border:"1px solid #DCD7CB", borderRadius:6, fontSize:13, color:"#1C2630", textDecoration:"none" }}>
                  <Phone size={12}/> {client.tel2}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Mail depuis Excel */}
        {client.email && (
          <div style={{ marginBottom:12 }}>
            <div style={lbl}>Mail (Excel)</div>
            <a href={`mailto:${client.email}`} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", background:"#F5F2EC", border:"1px solid #DCD7CB", borderRadius:6, fontSize:13, color:"#1C2630", textDecoration:"none" }}>
              <Mail size={12}/> {client.email}
            </a>
          </div>
        )}

        {/* Séparateur */}
        <div style={{ display:"flex", alignItems:"center", gap:8, margin:"14px 0" }}>
          <div style={{ flex:1, height:1, background:"#F0EDE7" }}/>
          <span style={{ fontSize:11, color:"#8A93A0", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600, whiteSpace:"nowrap" }}>Contact direct titulaire</span>
          <div style={{ flex:1, height:1, background:"#F0EDE7" }}/>
        </div>

        {/* Alerte si incomplet */}
        {(mobileMissing || mailMissing) && (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:"#FBF0E9", border:"1px solid #E8714A", borderRadius:7, marginBottom:12, fontSize:12.5, color:"#993C1D" }}>
            <AlertCircle size={14} style={{ flexShrink:0 }}/>
            <span>
              {mobileMissing && mailMissing ? "Mobile et mail titulaire manquants"
                : mobileMissing ? "Mobile titulaire manquant"
                : "Mail titulaire manquant"}
            </span>
          </div>
        )}

        {/* Mobile */}
        <div style={{ marginBottom:12 }}>
          <label style={lbl}>
            📱 Mobile titulaire
            {mobileMissing && <span style={{ color:"#C75450", marginLeft:4 }}>●</span>}
          </label>
          <div style={{ display:"flex", gap:8 }}>
            <input style={{ ...inp, flex:1 }} type="tel" inputMode="numeric" placeholder="06 XX XX XX XX" value={mobile} onChange={e => { setSaved(false); setMobile(e.target.value); }}/>
            {mobile.trim() && (
              <a href={`tel:${mobile}`} style={{ padding:"9px 12px", background:"#DCEAE0", border:"1.5px solid #5B8C6E", borderRadius:6, display:"inline-flex", alignItems:"center", color:"#27500A", textDecoration:"none" }}>
                <Phone size={14}/>
              </a>
            )}
          </div>
        </div>

        {/* Mail */}
        <div style={{ marginBottom:18 }}>
          <label style={lbl}>
            ✉️ Mail titulaire
            {mailMissing && <span style={{ color:"#C75450", marginLeft:4 }}>●</span>}
          </label>
          <div style={{ display:"flex", gap:8 }}>
            <input style={{ ...inp, flex:1 }} type="email" placeholder="titulaire@pharmacie.fr" value={mail} onChange={e => { setSaved(false); setMail(e.target.value); }}/>
            {mail.trim() && (
              <a href={`mailto:${mail}`} style={{ padding:"9px 12px", background:"#E6F1FB", border:"1.5px solid #185FA5", borderRadius:6, display:"inline-flex", alignItems:"center", color:"#0C447C", textDecoration:"none" }}>
                <Mail size={14}/>
              </a>
            )}
          </div>
        </div>

        {/* Boutons */}
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onClose} style={{ ...btn, flex:1, background:"transparent", border:"1.5px solid #DCD7CB", color:"#8A93A0" }}>Fermer</button>
          <button onClick={handleSave} disabled={saving} style={{ ...btn, flex:2, background: saved ? "#5B8C6E" : saving ? "#DCD7CB" : "#E8714A", color: saving ? "#8A93A0" : "white", cursor: saving ? "not-allowed" : "pointer" }}>
            {saved ? <><CheckCircle2 size={14}/> Enregistré</> : saving ? "Enregistrement..." : <><Save size={14}/> Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Badge contact manquant (inline dans les listes)
// ============================================================
function BadgeContactManquant({ client, onClick }) {
  const mobileMissing = !client.mobile_titulaire;
  const mailMissing   = !client.mail_titulaire;
  if (!mobileMissing && !mailMissing) return null;
  const nb = (mobileMissing ? 1 : 0) + (mailMissing ? 1 : 0);
  const tooltip = mobileMissing && mailMissing ? "Mobile + mail manquants" : mobileMissing ? "Mobile manquant" : "Mail manquant";
  return (
    <button onClick={e => { e.stopPropagation(); onClick && onClick(); }} title={tooltip}
      style={{ background:"none", border:"1px solid #C75450", borderRadius:999, cursor:"pointer", padding:"2px 6px", display:"inline-flex", alignItems:"center", gap:3, color:"#C75450", fontSize:10, fontWeight:700, flexShrink:0 }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:"#C75450", display:"inline-block" }}/>
      {nb === 2 ? "📱✉️" : mobileMissing ? "📱" : "✉️"}
    </button>
  );
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
  if (!res.ok) throw new Error("Chargement impossible");
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

// Sauvegarde ciblée des contacts dans les colonnes dédiées Supabase
async function sauvegarderContactsDistants(code, clientId, mobile_titulaire, mail_titulaire) {
  // On stocke dans la colonne donnees en rechargeant — le sync habituel suffit
  // Cette fonction est un placeholder pour une future optimisation directe
  return true;
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
  } catch { return initial; }
}

function ecrireLocal(storageKey, valeur) {
  try { window.localStorage.setItem(storageKey, JSON.stringify(valeur)); } catch {}
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

  const pousserVersSupabase = useCallback((next) => {
    if (!code) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sauvegarderDonneesDistantes(code, next).then((ok) => {
        setSyncTick((t) => ({ ...t, dernier: ok ? "ok" : "erreur", heure: Date.now() }));
      });
    }, 1200);
  }, [code, setSyncTick]);

  const forcerSyncMaintenant = useCallback(async () => {
    if (!code) return false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const ok = await sauvegarderDonneesDistantes(code, donneesRef.current);
    setSyncTick((t) => ({ ...t, dernier: ok ? "ok" : "erreur", heure: Date.now() }));
    return ok;
  }, [code, setSyncTick]);

  const update = useCallback((cle, updater) => {
    setDonneesState((prev) => {
      const next = { ...prev, [cle]: typeof updater === "function" ? updater(prev[cle]) : updater };
      persistLocal(next);
      pousserVersSupabase(next);
      return next;
    });
  }, [persistLocal, pousserVersSupabase]);

  const remplacerTout = useCallback((next) => {
    setDonneesState(next);
    persistLocal(next);
  }, [persistLocal]);

  const setDonneesEtPersist = useCallback((updater) => {
    setDonneesState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistLocal(next);
      if (next !== prev) pousserVersSupabase(next);
      return next;
    });
  }, [persistLocal, pousserVersSupabase]);

  return { donnees, update, remplacerTout, setDonneesEtPersist, forcerSyncMaintenant };
}

// ============================================================
// Analyse Excel
// ============================================================
function excelDateToISO(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  if (typeof valeur === "number") {
    const d = XLSX.SSF.parse_date_code(valeur);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (valeur instanceof Date) return dateToKey(valeur);
  const s = String(valeur).trim();
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
    pression: colIdx("Indicateur pression"), id: colIdx("ID Client"),
    etablissement: colIdx("Établissement"), nom: colIdx("Nom"),
    cp: colIdx("CP"), ville: colIdx("Ville"), uga: colIdx("UGA"),
    derniereVisite: colIdx("Date dernière visite"), prochainRdv: colIdx("Date prochain RDV"),
    statutRdv: colIdx("RDV"), groupement: colIdx("Groupement"),
    contact: colIdx("Contact"), adresse: colIdx("Adresse 1"),
    email: colIdx("Courriel"), tel1: colIdx("Tél 1"), tel2: colIdx("Tél 2 :"),
    nbVisites: colIdx("Nb visites"), ciblage: colIdx("[Ciblage IBSA]"),
    latitude: colIdx("Latitude"), longitude: colIdx("Longitude"),
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
        ? { lat: parseFloat(r[idx.latitude]), lon: parseFloat(r[idx.longitude]) } : null,
      dureeDefaut: 20,
      // Champs contacts directs (remplis manuellement dans l'app)
      mobile_titulaire: null,
      mail_titulaire: null,
    });
  }
  return out;
}

// ============================================================
// Écran connexion
// ============================================================
function genererCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

function EcranConnexion({ onConnecte }) {
  const [mode, setMode] = useState("choix");
  const [codeSaisi, setCodeSaisi] = useState("");
  const [codeGenere, setCodeGenere] = useState("");
  const [statut, setStatut] = useState(null);
  const [erreur, setErreur] = useState("");

  async function creerEspace() {
    setStatut("verification"); setErreur("");
    let code = genererCode();
    try {
      let tentatives = 0;
      while ((await codeExisteDeja(code)) && tentatives < 5) { code = genererCode(); tentatives++; }
      const ok = await sauvegarderDonneesDistantes(code, { clients: [], geoCache: {}, planning: {}, departs: {}, agendaRdvs: [] });
      if (!ok) { setErreur("Connexion au serveur impossible. Vérifie ta connexion internet et réessaye."); setStatut(null); return; }
      setCodeGenere(code); setStatut("cree");
    } catch { setErreur("Connexion au serveur impossible. Vérifie ta connexion internet et réessaye."); setStatut(null); }
  }

  async function rejoindreEspace() {
    if (codeSaisi.trim().length !== 6) { setErreur("Le code doit comporter 6 chiffres."); return; }
    setStatut("verification"); setErreur("");
    try {
      const existe = await codeExisteDeja(codeSaisi.trim());
      if (!existe) { setErreur("Ce code n'existe pas. Vérifie qu'il est bien identique sur ton autre appareil."); setStatut(null); return; }
      onConnecte(codeSaisi.trim());
    } catch { setErreur("Connexion au serveur impossible. Vérifie ta connexion internet et réessaye."); setStatut(null); }
  }

  return (
    <div className="tournee-root">
      <style>{`
        .tournee-root { --ardoise:#1C2630;--creme:#F5F2EC;--orange:#E8714A;--orange-clair:#F4A07F;--gris:#8A93A0;--gris-clair:#DCD7CB;--rouge:#C75450; font-family:'Inter',system-ui,sans-serif;background:var(--creme);color:var(--ardoise);min-height:100vh;width:100%;display:flex;align-items:center;justify-content:center; }
        .tournee-root * { box-sizing:border-box; }
        .tr-gate { max-width:380px;width:100%;padding:28px 22px; }
        .tr-gate-title { font-family:'Oswald','Arial Narrow',sans-serif;font-size:28px;font-weight:600;text-transform:uppercase;text-align:center;margin-bottom:6px; }
        .tr-gate-sub { text-align:center;color:var(--gris);font-size:13px;margin-bottom:28px; }
        .tr-gate-card { background:white;border:1px solid var(--gris-clair);border-radius:12px;padding:20px;margin-bottom:14px; }
        .tr-gate-btn { font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:0.04em;font-size:14px;padding:13px 16px;border-radius:8px;border:none;cursor:pointer;width:100%;background:var(--orange);color:white;margin-bottom:10px; }
        .tr-gate-btn:disabled { background:var(--gris-clair);color:var(--gris); }
        .tr-gate-btn-outline { background:transparent;border:1.5px solid var(--ardoise);color:var(--ardoise); }
        .tr-gate-input { width:100%;padding:14px;border:1.5px solid var(--gris-clair);border-radius:8px;font-size:24px;text-align:center;letter-spacing:0.3em;font-family:'Oswald',sans-serif;margin-bottom:12px;background:var(--creme); }
        .tr-gate-input:focus { outline:none;border-color:var(--orange);background:white; }
        .tr-code-affiche { font-family:'Oswald',sans-serif;font-size:36px;font-weight:600;text-align:center;letter-spacing:0.25em;padding:18px;background:#FBF0E9;border-radius:10px;color:var(--orange);margin-bottom:14px; }
        .tr-gate-alert { background:#FCEEED;border:1px solid var(--rouge);color:#8A3530;border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:12px; }
        .tr-gate-link { text-align:center;font-size:13px;color:var(--gris);margin-top:6px; }
        .tr-gate-link button { background:none;border:none;color:var(--orange);cursor:pointer;font-weight:600;padding:0; }
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
            <p style={{ fontSize:13, color:"var(--gris)", marginBottom:14 }}>Un code à 6 chiffres va être créé. Note-le bien pour connecter tes autres appareils.</p>
            {erreur && <div className="tr-gate-alert">{erreur}</div>}
            <button className="tr-gate-btn" onClick={creerEspace} disabled={statut === "verification"}>{statut === "verification" ? "Création..." : "Créer mon espace"}</button>
            <div className="tr-gate-link"><button onClick={() => setMode("choix")}>Retour</button></div>
          </div>
        )}
        {mode === "creer" && statut === "cree" && (
          <div className="tr-gate-card">
            <p style={{ fontSize:13, color:"var(--gris)", marginBottom:10 }}>Ton code :</p>
            <div className="tr-code-affiche">{codeGenere}</div>
            <p style={{ fontSize:12.5, color:"var(--gris)", marginBottom:14 }}>Note ce code. Sur ton autre appareil, choisis « J'ai déjà un code » et saisis-le.</p>
            <button className="tr-gate-btn" onClick={() => onConnecte(codeGenere)}>Continuer</button>
          </div>
        )}
        {mode === "rejoindre" && (
          <div className="tr-gate-card">
            <input className="tr-gate-input" inputMode="numeric" maxLength={6} placeholder="——————" value={codeSaisi} onChange={(e) => setCodeSaisi(e.target.value.replace(/\D/g, "").slice(0, 6))}/>
            {erreur && <div className="tr-gate-alert">{erreur}</div>}
            <button className="tr-gate-btn" onClick={rejoindreEspace} disabled={statut === "verification"}>{statut === "verification" ? "Vérification..." : "Rejoindre"}</button>
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
  function seDeconnecter() { window.localStorage.removeItem("tournee_code"); setCode(null); }
  function onConnecte(c) { ecrireLocal("tournee_code", c); setCode(c); }
  if (!code) return <EcranConnexion onConnecte={onConnecte}/>;
  return <App code={code} onDeconnecter={seDeconnecter}/>;
}

// ============================================================
// Composant principal
// ============================================================
function App({ code, onDeconnecter }) {
  const [syncTick, setSyncTick] = useState({ dernier: null, heure: null });
  const { donnees, update, remplacerTout, setDonneesEtPersist, forcerSyncMaintenant } = useSyncedState(code, syncTick, setSyncTick);
  const { clients, geoCache, planning, departs, domicile } = donnees;
  const setClients     = useCallback((u) => update("clients", u), [update]);
  const setGeoCache    = useCallback((u) => update("geoCache", u), [update]);
  const setPlanning    = useCallback((u) => update("planning", u), [update]);
  const setDeparts     = useCallback((u) => update("departs", u), [update]);
  const setDomicile    = useCallback((u) => update("domicile", u), [update]);
  const setAgendaRdvs  = useCallback((u) => update("agendaRdvs", u), [update]);

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
              agendaRdvs: (() => {
                const d = distant.agendaRdvs || [];
                const l = local.agendaRdvs || [];
                const scoreD = d.filter(r => r.clientId).length;
                const scoreL = l.filter(r => r.clientId).length;
                if (scoreL > scoreD) return l;
                return d.length > 0 ? d : l;
              })(),
            };
          }
          if (!local.domicile && distant.domicile) return { ...local, domicile: distant.domicile };
          return local;
        });
      })
      .catch(() => {})
      .finally(() => { if (!annule) setChargementInitial(false); });
    return () => { annule = true; };
  }, [code]);

  const [vue, setVue]                         = useState("import");
  const [importStatus, setImportStatus]       = useState(null);
  const [geocodageProgress, setGeocodageProgress] = useState(null);
  const [recherche, setRecherche]             = useState("");
  const [clientSelectionne, setClientSelectionne] = useState(null);
  const [suggestions, setSuggestions]         = useState(null);
  const [calcEnCours, setCalcEnCours]         = useState(false);
  const [modeRecherche, setModeRecherche]     = useState("urgent");
  const [horizonJours, setHorizonJours]       = useState(90);
  const [dateChoisie, setDateChoisie]         = useState("");
  const [periodeDebut, setPeriodeDebut]       = useState("");
  const [periodeFin, setPeriodeFin]           = useState("");
  const [erreur, setErreur]                   = useState("");
  const [toast, setToast]                     = useState(null);
  const [rdvAnnule, setRdvAnnule]             = useState(null);
  const [planB, setPlanB]                     = useState(null);
  const [creneauRetenu, setCreneauRetenu]     = useState(null);
  const [ficheOuverte, setFicheOuverte]       = useState(null); // ← NOUVEAU
  const fileInputRef = useRef(null);

  function showToast(msg, type = "ok") { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }

  // ── NOUVEAU : Sauvegarde contact titulaire ──────────────────────────────────
  async function sauvegarderContact(clientId, { mobile_titulaire, mail_titulaire }) {
    setClients(prev => prev.map(c =>
      c.id === clientId ? { ...c, mobile_titulaire, mail_titulaire } : c
    ));
    // Mettre à jour ficheOuverte pour refléter immédiatement
    setFicheOuverte(prev => prev && prev.id === clientId ? { ...prev, mobile_titulaire, mail_titulaire } : prev);
    await forcerSyncMaintenant();
    showToast("Contact enregistré ✓", "ok");
  }
  // ───────────────────────────────────────────────────────────────────────────

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportStatus("lecture"); setErreur("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const parsed = parseClientsWorkbook(wb);
      if (parsed.length === 0) { setImportStatus(null); setErreur("Aucune ligne client détectée."); return; }
      // Conserver les contacts déjà saisis
      const contactsExistants = {};
      clients.forEach(c => { if (c.mobile_titulaire || c.mail_titulaire) contactsExistants[c.id] = { mobile_titulaire: c.mobile_titulaire, mail_titulaire: c.mail_titulaire }; });
      const parsedAvecContacts = parsed.map(c => ({ ...c, ...(contactsExistants[c.id] || {}) }));
      setClients(parsedAvecContacts);
      setImportStatus("geocodage");
      showToast(`${parsed.length} clients importés`, "ok");
      await geocoderTousLesClients(parsedAvecContacts);
      initialiserPlanificationDepuisImport(parsedAvecContacts);
      setImportStatus("synchronisation");
      await forcerSyncMaintenant();
      setImportStatus("termine");
      setVue("prochain-rdv");
    } catch { setImportStatus(null); setErreur("Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un .xlsx."); }
  }

  async function geocoderTousLesClients(listeClients) {
    const cache = { ...geoCache };
    const aGeocoder = [];
    const clesVues = new Set();
    listeClients.forEach((c) => {
      const cle = `${c.cp}|${c.ville}`;
      if (!cache[cle] && !clesVues.has(cle)) { clesVues.add(cle); aGeocoder.push({ cle, cp: c.cp, ville: c.ville }); }
    });
    setGeocodageProgress({ fait: 0, total: aGeocoder.length });
    for (let i = 0; i < aGeocoder.length; i++) {
      const { cle, cp, ville } = aGeocoder[i];
      try { const coords = await geocoder(`${cp} ${ville}, France`); if (coords) cache[cle] = coords; } catch {}
      setGeocodageProgress({ fait: i + 1, total: aGeocoder.length });
      await new Promise((r) => setTimeout(r, 250));
    }
    setGeoCache(cache);
    setClients((prev) => prev.map((c) => { const cle = `${c.cp}|${c.ville}`; return cache[cle] ? { ...c, coords: cache[cle] } : c; }));
  }

  const [regeoStatut, setRegeoStatut] = useState(null);
  async function regeocoder() {
    const sansCoords = clients.filter(c => !c.coords);
    if (sansCoords.length === 0) { showToast("Tous les clients sont déjà localisés ✓", "ok"); return; }
    setRegeoStatut({ fait: 0, total: sansCoords.length, enCours: true });
    const cache = { ...geoCache };
    const clesVues = new Set();
    const aGeocoder = [];
    sansCoords.forEach(c => { const cle = `${c.cp}|${c.ville}`; if (!clesVues.has(cle)) { clesVues.add(cle); aGeocoder.push({ cle, cp: c.cp, ville: c.ville, adresse: c.adresse }); } });
    let fait = 0;
    for (const { cle, cp, ville, adresse } of aGeocoder) {
      try { let coords = adresse ? await geocoder(`${adresse}, ${cp} ${ville}, France`) : null; if (!coords) coords = await geocoder(`${cp} ${ville}, France`); if (coords) cache[cle] = coords; } catch {}
      fait++;
      setRegeoStatut({ fait, total: aGeocoder.length, enCours: true });
      await new Promise(r => setTimeout(r, 300));
    }
    setGeoCache(cache);
    const avant = clients.filter(c => !c.coords).length;
    setClients(prev => prev.map(c => { const cle = `${c.cp}|${c.ville}`; return cache[cle] ? { ...c, coords: cache[cle] } : c; }));
    await forcerSyncMaintenant();
    const apres = clients.filter(c => !cache[`${c.cp}|${c.ville}`]).length;
    setRegeoStatut({ fait, total: aGeocoder.length, enCours: false, localises: avant - apres });
  }

  function initialiserPlanificationDepuisImport(listeClients) {
    setPlanning((prev) => {
      const np = { ...prev };
      listeClients.forEach((c) => {
        if (c.prochainRdv && c.statutRdv) {
          if (!np[c.prochainRdv]) np[c.prochainRdv] = [];
          const dejaPresent = np[c.prochainRdv].some((r) => r.clientId === c.id);
          if (!dejaPresent) np[c.prochainRdv].push({ clientId: c.id, heureArrivee: null, heureFin: null });
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
    setErreur(""); setSuggestions(null); setCreneauRetenu(null);
    if (!client.coords) { setErreur(`${client.etablissement} n'est pas localisé.`); return; }
    const departsEtendus = { ...departs };
    const aujourdHuiDate = new Date();
    aujourdHuiDate.setHours(0, 0, 0, 0);

    function ajouterDomicileSiAbsent(dateKey) {
      if (!departsEtendus[dateKey] && domicile) departsEtendus[dateKey] = { adresse: domicile.adresse, coords: domicile.coords, heure: domicile.heure || "08:30" };
    }
    function estJourOuvre(dateKey) { const j = new Date(dateKey + "T00:00:00").getDay(); return j >= 1 && j <= 5; }
    function ajouterFenetreJoursOuvres(joursAvecDepart, debut, fin) {
      let cur = new Date(debut);
      while (cur <= fin) {
        const jourSemaine = cur.getDay();
        if (jourSemaine >= 1 && jourSemaine <= 5) {
          const dk = dateToKey(cur);
          ajouterDomicileSiAbsent(dk);
          const aDesRdvPlanning = (planning[dk] || []).length > 0;
          const aDesRdvAgenda = (donnees.agendaRdvs || []).some(r => r.jour === dk);
          const aDesRdv = aDesRdvPlanning || aDesRdvAgenda;
          if ((departsEtendus[dk] || aDesRdv) && !joursAvecDepart.includes(dk)) {
            if (aDesRdv && !departsEtendus[dk] && domicile) departsEtendus[dk] = { adresse: domicile.adresse, coords: domicile.coords, heure: domicile.heure || "08:30" };
            if (departsEtendus[dk]) joursAvecDepart.push(dk);
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    let joursAvecDepart = [];
    if (mode.type === "date") {
      ajouterDomicileSiAbsent(mode.date);
      joursAvecDepart = Object.keys(departsEtendus).filter((d) => d === mode.date && departsEtendus[d].coords);
    } else if (mode.type === "semaine") {
      if (domicile) {
        const lundiCourant = new Date(aujourdHuiDate);
        const jourSem = lundiCourant.getDay();
        const diffLundi = jourSem === 0 ? -6 : 1 - jourSem;
        lundiCourant.setDate(lundiCourant.getDate() + diffLundi);
        for (let i = 0; i < 5; i++) { const d = new Date(lundiCourant); d.setDate(lundiCourant.getDate() + i); ajouterDomicileSiAbsent(dateToKey(d)); }
      }
      joursAvecDepart = Object.keys(departsEtendus).filter((d) => { const jour = new Date(d + "T00:00:00").getDay(); return departsEtendus[d].coords && jour >= 1 && jour <= 5; });
    } else if (mode.type === "urgent") {
      const debutUrgent = new Date(aujourdHuiDate);
      const jourUrgent = debutUrgent.getDay();
      if (jourUrgent === 0) debutUrgent.setDate(debutUrgent.getDate() + 1);
      if (jourUrgent === 6) debutUrgent.setDate(debutUrgent.getDate() + 2);
      const fin = new Date(debutUrgent); fin.setDate(fin.getDate() + 21);
      ajouterFenetreJoursOuvres(joursAvecDepart, debutUrgent, fin);
    } else if (mode.type === "periode") {
      ajouterFenetreJoursOuvres(joursAvecDepart, new Date(mode.debut + "T00:00:00"), new Date(mode.fin + "T00:00:00"));
    } else if (mode.type === "suivi") {
      const base = mode.derniereVisite ? new Date(mode.derniereVisite + "T00:00:00") : new Date(aujourdHuiDate);
      const debutFenetreDate = new Date(base); debutFenetreDate.setDate(debutFenetreDate.getDate() + Math.floor(mode.jours / 2));
      if (debutFenetreDate < aujourdHuiDate) debutFenetreDate.setTime(aujourdHuiDate.getTime());
      const finFenetreDate = new Date(base); finFenetreDate.setDate(finFenetreDate.getDate() + mode.jours);
      if (finFenetreDate < aujourdHuiDate) finFenetreDate.setTime(aujourdHuiDate.getTime());
      ajouterFenetreJoursOuvres(joursAvecDepart, debutFenetreDate, finFenetreDate);
    }

    let dateCibleSuivi = null;
    if (mode.type === "suivi") {
      const base = mode.derniereVisite ? new Date(mode.derniereVisite + "T00:00:00") : new Date(aujourdHuiDate);
      const cible = new Date(base); cible.setDate(cible.getDate() + mode.jours);
      dateCibleSuivi = cible < aujourdHuiDate ? new Date(aujourdHuiDate) : cible;
    }

    if (joursAvecDepart.length === 0) {
      setErreur(mode.type === "date" && !domicile
        ? "Pour proposer une date sans départ défini, enregistre d'abord ton domicile."
        : "Définis au moins un point de départ (onglet « Ma semaine »).");
      return;
    }
    joursAvecDepart = joursAvecDepart.filter(dk => estJourOuvre(dk));
    setCalcEnCours(true);
    const rdvParJour = construireRdvParJour(departsEtendus);
    await new Promise((r) => setTimeout(r, 250));
    const suggestionsParJour = [];
    joursAvecDepart.forEach((jourKey) => {
      const depart = departsEtendus[jourKey];
      const rdvJour = (rdvParJour[jourKey] || []).slice();
      const rdvAgendaJour = (donnees.agendaRdvs || []).filter(r => r.jour === jourKey && !r.overrideTournee);
      rdvAgendaJour.forEach(r => {
        const clientAgenda = r.clientId ? clientsById[r.clientId] : null;
        if (clientAgenda && clientAgenda.coords) rdvJour.push({ client: clientAgenda, coords: clientAgenda.coords, heureArrivee: hhmmToMin(r.debut), fin: hhmmToMin(r.fin) });
      });
      rdvJour.sort((a, b) => a.heureArrivee - b.heureArrivee);
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
        suggestionsParJour.push({ jour: jourKey, avant: prev.isDepart ? "Départ" : prev.client.etablissement, apres: next ? (next.isDepart ? null : next.client.etablissement) : null, coutSupplementaire, arrivee, fin, departAUtiliser: !departs[jourKey] ? depart : null });
      }
    });
    const ideal = suggestionsParJour.filter(s => s.coutSupplementaire <= 20);
    const acceptable = suggestionsParJour.filter(s => s.coutSupplementaire <= 45);
    const aUtiliser = ideal.length > 0 ? ideal : acceptable.length > 0 ? acceptable : suggestionsParJour;
    if (mode.type === "urgent") {
      aUtiliser.sort((a, b) => { if (a.jour !== b.jour) return a.jour < b.jour ? -1 : 1; return a.coutSupplementaire - b.coutSupplementaire; });
    } else if (mode.type === "suivi" && dateCibleSuivi) {
      const cibleTime = dateCibleSuivi.getTime();
      aUtiliser.sort((a, b) => { const ea = Math.abs(new Date(a.jour + "T00:00:00").getTime() - cibleTime); const eb = Math.abs(new Date(b.jour + "T00:00:00").getTime() - cibleTime); return ea !== eb ? ea - eb : a.coutSupplementaire - b.coutSupplementaire; });
    } else {
      aUtiliser.sort((a, b) => a.coutSupplementaire - b.coutSupplementaire);
    }
    setCalcEnCours(false);
    if (aUtiliser.length === 0) { setErreur(mode.type === "semaine" ? "Aucun créneau cette semaine. Vérifie que ton domicile est bien défini dans « Ma semaine »." : "Aucun créneau sur la période choisie."); return; }
    setClientSelectionne(client);
    if (mode.type === "urgent" || mode.type === "suivi" || mode.type === "periode") {
      const meilleureParJour = new Map();
      aUtiliser.forEach((s) => { if (!meilleureParJour.has(s.jour)) meilleureParJour.set(s.jour, s); });
      setSuggestions(Array.from(meilleureParJour.values()).slice(0, 5));
    } else {
      setSuggestions(aUtiliser.slice(0, 5));
    }
  }

  function retenirCreneau(sugg) {
    if (!clientSelectionne) return;
    if (sugg.departAUtiliser) setDeparts((d) => ({ ...d, [sugg.jour]: sugg.departAUtiliser }));
    setPlanning((p) => ({ ...p, [sugg.jour]: [...(p[sugg.jour] || []), { clientId: clientSelectionne.id, heureArrivee: sugg.arrivee, heureFin: sugg.fin }] }));
    setClients((prev) => prev.map((c) => c.id === clientSelectionne.id ? { ...c, prochainRdv: sugg.jour, statutRdv: "Fixe" } : c));
    showToast(`${clientSelectionne.etablissement} planifié le ${formatDateFr(sugg.jour)} à ${minToHHMM(sugg.arrivee)}`, "ok");
    setCreneauRetenu({ client: clientSelectionne, sugg });
    setSuggestions(null); setClientSelectionne(null);
  }

  function supprimerVisite(dateKey, clientId) {
    setPlanning((p) => { const np = { ...p }; if (np[dateKey]) { np[dateKey] = np[dateKey].filter((r) => r.clientId !== clientId); if (np[dateKey].length === 0) delete np[dateKey]; } return np; });
    setAgendaRdvs((prev) => (prev || []).filter((r) => !(r.overrideTournee === clientId && r.jour === dateKey)));
    setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, prochainRdv: null, statutRdv: null } : c));
    showToast("Visite supprimée", "ok");
  }

  function supprimerRdvAgenda(id) { setAgendaRdvs((prev) => (prev || []).filter((r) => r.id !== id)); showToast("RDV supprimé", "ok"); }

  async function definirDomicile(adresseTexte, heure) {
    try {
      const coords = await geocoder(adresseTexte + ", France");
      if (!coords) { showToast("Adresse introuvable", "erreur"); return false; }
      setDomicile({ adresse: adresseTexte, coords, heure: heure || "08:30" });
      showToast("Domicile enregistré", "ok"); return true;
    } catch { showToast("Service de géocodage indisponible", "erreur"); return false; }
  }

  function appliquerDomicileAuJour(dateKey, heure) {
    if (!domicile) return;
    setDeparts((d) => ({ ...d, [dateKey]: { adresse: domicile.adresse, coords: domicile.coords, heure: heure || domicile.heure || "08:30" } }));
    showToast(`Domicile utilisé comme départ du ${formatDateFr(dateKey)}`, "ok");
  }

  async function definirDepartJour(dateKey, adresseTexte, heure) {
    try {
      const coords = await geocoder(adresseTexte + ", France");
      if (!coords) { showToast("Adresse de départ introuvable", "erreur"); return; }
      setDeparts((d) => ({ ...d, [dateKey]: { adresse: adresseTexte, coords, heure } }));
      showToast("Point de départ enregistré", "ok");
    } catch { showToast("Service de géocodage indisponible", "erreur"); }
  }

  function chercherPlanB(pointRef, excludeId) {
    return clients
      .filter((c) => c.coords && c.id !== excludeId)
      .map((c) => ({ client: c, trajet: estimerTrajetMin(pointRef, c.coords), score: scoreClient(c) }))
      .filter((x) => x.trajet !== null && x.trajet <= 45)
      .sort((a, b) => { if (b.score !== a.score) return b.score - a.score; return a.trajet - b.trajet; })
      .slice(0, 8);
  }

  function ouvrirPlanB(dateKey, item) { setRdvAnnule({ dateKey, item }); setPlanB(chercherPlanB(item.coords, item.client.id)); }

  const rdvParJourCalcule = construireRdvParJour();
  const joursTries = Object.keys(planning).filter((d) => (planning[d] || []).length > 0).sort();
  const clientsFiltres = recherche.trim()
    ? clients.filter((c) => c.etablissement.toLowerCase().includes(recherche.toLowerCase()) || (c.ville || "").toLowerCase().includes(recherche.toLowerCase()))
    : clients;

  // Compteur contacts manquants
  const nbContactsManquants = clients.filter(c => contactManquant(c)).length;

  // Préparer les RDV d'aujourd'hui pour l'assistant vocal
  const aujourdHuiKey = dateToKey(new Date());
  const rdvAujourdhui = [
    ...(rdvParJourCalcule[aujourdHuiKey] || []).map(item => ({
      titre: item.client.etablissement,
      heure: minToHHMM(item.heureArrivee),
      // Fallback : mobile titulaire > tel1 > tel2
      mobile: item.client.mobile_titulaire || item.client.tel1 || item.client.tel2 || null,
      // Fallback : mail titulaire > mail général Excel
      email: item.client.mail_titulaire || item.client.email || null,
    })),
    ...(donnees.agendaRdvs || []).filter(r => r.jour === aujourdHuiKey).map(r => ({
      titre: r.titre || "RDV",
      heure: r.debut || "",
      mobile: null,
      email: null,
    })),
  ];

  return (
    <div className="tournee-root">
      <style>{`
        .tournee-root { --ardoise:#1C2630;--ardoise-clair:#2A3A47;--creme:#F5F2EC;--orange:#E8714A;--orange-clair:#F4A07F;--vert:#5B8C6E;--vert-clair:#DCEAE0;--gris:#8A93A0;--gris-clair:#DCD7CB;--rouge:#C75450;--or:#C8962E; font-family:'Inter',system-ui,sans-serif;background:var(--creme);color:var(--ardoise);min-height:100vh;width:100%; }
        .tournee-root * { box-sizing:border-box; }
        .tr-font-display { font-family:'Oswald','Arial Narrow',sans-serif;letter-spacing:0.02em; }
        .tr-shell { max-width:1180px;margin:0 auto;padding:28px 20px 80px; }
        .tr-header { display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid var(--ardoise);flex-wrap:wrap; }
        .tr-title { font-size:28px;font-weight:600;text-transform:uppercase;line-height:1; }
        .tr-title small { display:block;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:var(--gris);letter-spacing:0.06em;margin-top:6px;text-transform:none; }
        .tr-tabs { display:flex;gap:4px;background:var(--ardoise);padding:4px;border-radius:8px;flex-wrap:wrap; }
        .tr-tab { font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:12.5px;letter-spacing:0.03em;padding:8px 14px;border-radius:5px;border:none;cursor:pointer;background:transparent;color:var(--gris-clair);transition:all 0.15s ease; }
        .tr-tab.active { background:var(--orange);color:white; }
        .tr-tab:not(.active):hover { color:white; }
        .tr-tab:disabled { opacity:0.35;cursor:not-allowed; }
        .tr-grid { display:grid;grid-template-columns:380px 1fr;gap:22px; }
        @media (max-width:880px) { .tr-grid { grid-template-columns:1fr; } }
        .tr-card { background:white;border:1px solid var(--gris-clair);border-radius:10px;padding:18px; }
        .tr-card + .tr-card { margin-top:16px; }
        .tr-card-title { font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:13px;letter-spacing:0.06em;color:var(--gris);margin-bottom:12px;display:flex;align-items:center;gap:7px; }
        .tr-field { margin-bottom:12px; }
        .tr-label { display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--gris);margin-bottom:5px;font-weight:600; }
        .tr-input,.tr-select { width:100%;padding:9px 11px;border:1.5px solid var(--gris-clair);border-radius:6px;font-size:14px;font-family:inherit;color:var(--ardoise);background:var(--creme); }
        .tr-input:focus,.tr-select:focus { outline:none;border-color:var(--orange);background:white; }
        .tr-btn { font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:0.04em;font-size:13px;padding:10px 16px;border-radius:6px;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;transition:all 0.15s ease; }
        .tr-btn-primary { background:var(--orange);color:white; }
        .tr-btn-primary:hover { background:#d96138; }
        .tr-btn-primary:disabled { background:var(--gris-clair);color:var(--gris);cursor:not-allowed; }
        .tr-btn-outline { background:transparent;border:1.5px solid var(--ardoise);color:var(--ardoise); }
        .tr-btn-outline:hover { background:var(--ardoise);color:white; }
        .tr-btn-ghost { background:transparent;border:none;color:var(--gris); }
        .tr-btn-ghost:hover { color:var(--rouge); }
        .tr-btn-full { width:100%; }
        .tr-btn-sm { padding:5px 10px;font-size:11px; }
        .tr-empty { text-align:center;padding:30px 14px;color:var(--gris);font-size:13px; }
        .tr-alert { display:flex;align-items:flex-start;gap:9px;padding:11px 13px;background:#FCEEED;border:1px solid var(--rouge);border-radius:8px;color:#8A3530;font-size:13px;margin-bottom:14px; }
        .tr-toast { position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--ardoise);color:white;padding:11px 20px;border-radius:999px;font-size:13px;display:flex;align-items:center;gap:8px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:50; }
        .tr-toast.error { background:var(--rouge); }
        .tr-dropzone { border:2.5px dashed var(--gris-clair);border-radius:12px;padding:50px 24px;text-align:center;cursor:pointer;transition:all 0.2s ease;background:white; }
        .tr-dropzone:hover { border-color:var(--orange);background:#FBF7F2; }
        .tr-progress-bar { height:7px;background:var(--gris-clair);border-radius:99px;overflow:hidden;margin-top:10px; }
        .tr-progress-fill { height:100%;background:var(--orange);transition:width 0.2s ease; }
        .tr-search { position:relative;margin-bottom:12px; }
        .tr-mode-row { display:flex;gap:6px;flex-wrap:wrap; }
        .tr-mode-btn { font-family:'Oswald',sans-serif;font-size:11.5px;text-transform:uppercase;letter-spacing:0.02em;padding:7px 11px;border-radius:999px;border:1.5px solid var(--gris-clair);background:white;color:var(--ardoise);cursor:pointer;transition:all 0.15s ease;flex:1;min-width:90px; }
        .tr-mode-btn.active { background:var(--orange);border-color:var(--orange);color:white; }
        .tr-mode-btn:hover:not(.active) { border-color:var(--orange-clair); }
        .tr-search input { padding-left:34px; }
        .tr-search svg { position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--gris); }
        .tr-clients-list { max-height:480px;overflow-y:auto;display:grid;gap:7px; }
        .tr-client-row { display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:7px;cursor:pointer;border:1.5px solid var(--gris-clair);background:var(--creme); }
        .tr-client-row:hover { border-color:var(--orange-clair);background:#FBF0E9; }
        .tr-pression-dot { width:9px;height:9px;border-radius:50%;flex-shrink:0; }
        .tr-client-row-main { flex:1;min-width:0; }
        .tr-client-row-name { font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .tr-client-row-meta { font-size:11.5px;color:var(--gris); }
        .tr-badge { font-family:'Oswald',sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.03em;padding:3px 7px;border-radius:999px;white-space:nowrap; }
        .tr-badge-gold { background:#FBF0DA;color:var(--or); }
        .tr-badge-default { background:var(--gris-clair);color:var(--ardoise); }
        .tr-sugg-list { display:grid;gap:12px; }
        .tr-sugg-card { position:relative;background:white;border:1.5px solid var(--gris-clair);border-radius:10px;padding:16px 16px 16px 50px;cursor:pointer;transition:all 0.15s ease; }
        .tr-sugg-card:hover { border-color:var(--orange-clair);transform:translateY(-1px); }
        .tr-sugg-card.rang-1 { border-color:var(--or);background:#FFFFF1; }
        .tr-sugg-rank { position:absolute;left:14px;top:16px;width:26px;height:26px;border-radius:50%;background:var(--ardoise);color:white;font-family:'Oswald',sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center; }
        .tr-sugg-card.rang-1 .tr-sugg-rank { background:var(--or); }
        .tr-sugg-top { display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px;flex-wrap:wrap; }
        .tr-sugg-jour { font-family:'Oswald',sans-serif;text-transform:capitalize;font-size:15px;font-weight:600; }
        .tr-sugg-cout { font-family:'Oswald',sans-serif;font-size:13px;font-weight:600;color:var(--orange);background:#FBEFE9;padding:3px 9px;border-radius:999px;white-space:nowrap; }
        .tr-sugg-card.rang-1 .tr-sugg-cout { background:#FBF0DA;color:var(--or); }
        .tr-sugg-detail { font-size:13px;color:var(--gris);line-height:1.5; }
        .tr-sugg-detail strong { color:var(--ardoise); }
        .tr-sugg-time { font-family:'Oswald',sans-serif;font-size:13px;color:var(--ardoise);margin-top:6px; }
        .tr-jour-block { margin-bottom:14px; }
        .tr-jour-block-head { display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:var(--ardoise);color:white;border-radius:8px 8px 0 0;font-family:'Oswald',sans-serif;text-transform:capitalize;font-size:13px;letter-spacing:0.02em;gap:8px;flex-wrap:wrap; }
        .tr-jour-block-body { border:1px solid var(--gris-clair);border-top:none;border-radius:0 0 8px 8px;padding:8px 12px; }
        .tr-stop-line { display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px dashed var(--gris-clair);font-size:13px;flex-wrap:wrap; }
        .tr-stop-line:last-child { border-bottom:none; }
        .tr-stop-line-time { font-family:'Oswald',sans-serif;font-weight:600;min-width:50px; }
        .tr-stop-line-name { flex:1;font-weight:600;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .tr-stop-line-trajet { color:var(--gris);font-size:11px;white-space:nowrap; }
        .tr-stop-line-actions { display:flex;gap:6px;align-items:center;flex-shrink:0; }
        .tr-stop-line-agenda { border-left:3px solid var(--vert);padding-left:8px;background:var(--vert-clair);border-radius:0 6px 6px 0; }
        .tr-modal-overlay { position:fixed;inset:0;background:rgba(28,38,48,0.55);display:flex;align-items:center;justify-content:center;z-index:60;padding:20px; }
        .tr-modal { background:white;border-radius:12px;padding:22px;max-width:560px;width:100%;max-height:85vh;overflow-y:auto; }
        .tr-modal-head { display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px; }
        .tr-planb-item { display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;border:1px solid var(--gris-clair);margin-bottom:8px; }
        .tr-planb-rank { width:22px;height:22px;border-radius:50%;background:var(--ardoise);color:white;font-family:'Oswald',sans-serif;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
        .tr-creneau-retenu { background:#F0F7F3;border:1.5px solid var(--vert);border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap; }
        .tr-creneau-retenu-info { font-size:13px; }
        .tr-creneau-retenu-info strong { display:block;font-size:14px;color:var(--ardoise);margin-bottom:2px; }
        .tr-creneau-retenu-info span { color:var(--gris); }
      `}</style>

      <div className="tr-shell">
        <header className="tr-header">
          <div className="tr-title tr-font-display">
            Tournée
            <small>
              Code {code} ·{" "}
              {syncTick.dernier === "ok" ? "Synchronisé" : syncTick.dernier === "erreur" ? "Échec de synchro" : "Prochain RDV optimal · Plan B en cas d'imprévu"}
              {clients.length > 0 && nbContactsManquants > 0 && (
                <span style={{ marginLeft:8, color:"var(--rouge)", fontWeight:700 }}>
                  · 🔴 {nbContactsManquants} contact{nbContactsManquants > 1 ? "s" : ""} incomplet{nbContactsManquants > 1 ? "s" : ""}
                </span>
              )}
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

        {/* ── VUE : IMPORT ── */}
        {vue === "import" && (
          <div className="tr-grid">
            <div className="tr-card">
              <div className="tr-card-title"><Upload size={14}/> Importer la base clients</div>
              <div className="tr-dropzone" onClick={() => fileInputRef.current?.click()}>
                <Upload size={28} style={{ opacity:0.4, marginBottom:10 }}/>
                <div style={{ fontWeight:600, marginBottom:4 }}>{clients.length > 0 ? "Réimporter un fichier à jour" : "Cliquer pour importer ton fichier Excel"}</div>
                <div style={{ fontSize:12, color:"var(--gris)" }}>Format .xlsx — colonnes ID Client, Établissement, CP, Ville...</div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }} onChange={handleFile}/>
              </div>
              {importStatus === "lecture" && <div style={{ marginTop:14, fontSize:13, color:"var(--gris)" }}>Lecture du fichier...</div>}
              {importStatus === "geocodage" && geocodageProgress && (
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:13, color:"var(--gris)" }}>Localisation des villes ({geocodageProgress.fait}/{geocodageProgress.total})</div>
                  <div className="tr-progress-bar"><div className="tr-progress-fill" style={{ width:`${geocodageProgress.total ? (100 * geocodageProgress.fait) / geocodageProgress.total : 100}%` }}/></div>
                </div>
              )}
              {importStatus === "synchronisation" && <div style={{ marginTop:14, fontSize:13, color:"var(--gris)" }}>Envoi vers le serveur...</div>}
              {importStatus === "termine" && (
                <div style={{ marginTop:14, fontSize:13, color:"var(--vert)", display:"flex", alignItems:"center", gap:6 }}>
                  <CheckCircle2 size={15}/> {clients.length} clients prêts et synchronisés
                </div>
              )}
              {erreur && <div className="tr-alert" style={{ marginTop:14, marginBottom:0 }}><AlertCircle size={16} style={{ flexShrink:0, marginTop:1 }}/><span>{erreur}</span></div>}

              {clients.length > 0 && (() => {
                const sansCoords = clients.filter(c => !c.coords).length;
                return (
                  <div style={{ marginTop:16, padding:"12px 14px", background: sansCoords > 0 ? "#FBF0E9" : "#F0F7F3", borderRadius:8, border:`1px solid ${sansCoords > 0 ? "var(--orange-clair)" : "var(--vert-clair)"}` }}>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:6, color: sansCoords > 0 ? "var(--orange)" : "var(--vert)" }}>
                      {sansCoords > 0 ? `⚠️ ${sansCoords} client${sansCoords > 1 ? "s" : ""} non localisé${sansCoords > 1 ? "s" : ""}` : "✓ Tous les clients sont localisés"}
                    </div>
                    {sansCoords > 0 && <div style={{ fontSize:12, color:"var(--gris)", marginBottom:10, lineHeight:1.5 }}>Ces clients ne peuvent pas être inclus dans le calcul de trajets.</div>}
                    {regeoStatut?.enCours && (
                      <div style={{ marginBottom:10 }}>
                        <div style={{ fontSize:12, color:"var(--gris)", marginBottom:5 }}>Localisation en cours... {regeoStatut.fait}/{regeoStatut.total}</div>
                        <div className="tr-progress-bar"><div className="tr-progress-fill" style={{ width:`${regeoStatut.total ? 100 * regeoStatut.fait / regeoStatut.total : 0}%` }}/></div>
                      </div>
                    )}
                    {regeoStatut && !regeoStatut.enCours && (
                      <div style={{ fontSize:12, color:"var(--vert)", marginBottom:8 }}>
                        <CheckCircle2 size={12} style={{ display:"inline", marginRight:4, verticalAlign:-1 }}/>
                        {regeoStatut.localises > 0 ? `${regeoStatut.localises} client${regeoStatut.localises > 1 ? "s" : ""} localisé${regeoStatut.localises > 1 ? "s" : ""}` : "Aucun nouveau client localisé — vérifier les CP/villes"}
                      </div>
                    )}
                    {sansCoords > 0 && !regeoStatut?.enCours && (
                      <button className="tr-btn tr-btn-outline tr-btn-full" onClick={regeocoder} style={{ fontSize:12 }}>
                        <MapPin size={13}/> Localiser les {sansCoords} clients manquants
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Compteur contacts manquants */}
              {clients.length > 0 && nbContactsManquants > 0 && (
                <div style={{ marginTop:12, padding:"10px 14px", background:"#FBF0E9", borderRadius:8, border:"1px solid var(--orange-clair)", fontSize:13, color:"var(--orange)", fontWeight:600 }}>
                  📱 {nbContactsManquants} client{nbContactsManquants > 1 ? "s" : ""} sans contact direct — clique sur 🔴 pour compléter
                </div>
              )}
            </div>

            <div className="tr-card">
              <div className="tr-card-title"><MapPin size={14}/> Base clients {clients.length > 0 ? `(${clients.length})` : ""}</div>
              {clients.length === 0 ? (
                <div className="tr-empty">Importe ton fichier Excel pour voir ta base clients ici.</div>
              ) : (
                <>
                  <div className="tr-search">
                    <Search size={15}/>
                    <input className="tr-input" placeholder="Rechercher un établissement ou une ville..." value={recherche} onChange={(e) => setRecherche(e.target.value)}/>
                  </div>
                  <div className="tr-clients-list">
                    {clientsFiltres.slice(0, 80).map((c) => (
                      <div key={c.id} className="tr-client-row" onClick={() => setFicheOuverte(c)}>
                        <span className="tr-pression-dot" style={{ background: PRESSION_COLOR[c.pression] || "var(--gris)" }}/>
                        <div className="tr-client-row-main">
                          <div className="tr-client-row-name">{c.etablissement}</div>
                          <div className="tr-client-row-meta">{c.ville}{c.coords ? "" : " · non localisé"}</div>
                        </div>
                        {c.ciblage && <span className={`tr-badge ${["OR", "PLATINIUM", "COMPTE CLE"].includes(c.ciblage) ? "tr-badge-gold" : "tr-badge-default"}`}>{c.ciblage}</span>}
                        <BadgeContactManquant client={c} onClick={() => setFicheOuverte(c)}/>
                      </div>
                    ))}
                  </div>
                  {clientsFiltres.length > 80 && <div style={{ fontSize:12, color:"var(--gris)", marginTop:8, textAlign:"center" }}>{clientsFiltres.length - 80} autres résultats, affine ta recherche</div>}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── VUE : PROCHAIN RDV ── */}
        {vue === "prochain-rdv" && (
          <div className="tr-grid">
            <div className="tr-card">
              <div className="tr-card-title"><Sparkles size={14}/> Choisir un client</div>
              <div className="tr-field">
                <label className="tr-label">Type de recherche</label>
                <div className="tr-mode-row">
                  <button className={`tr-mode-btn ${modeRecherche === "urgent" ? "active" : ""}`} onClick={() => setModeRecherche("urgent")}>Urgent — dès que possible</button>
                  <button className={`tr-mode-btn ${modeRecherche === "suivi" ? "active" : ""}`} onClick={() => setModeRecherche("suivi")}>Suivi régulier</button>
                </div>
                <div className="tr-mode-row" style={{ marginTop:6 }}>
                  <button className={`tr-mode-btn ${modeRecherche === "semaine" ? "active" : ""}`} onClick={() => setModeRecherche("semaine")}>Semaine en cours</button>
                  <button className={`tr-mode-btn ${modeRecherche === "date" ? "active" : ""}`} onClick={() => setModeRecherche("date")}>Date précise</button>
                  <button className={`tr-mode-btn ${modeRecherche === "periode" ? "active" : ""}`} onClick={() => setModeRecherche("periode")}>Période</button>
                </div>
              </div>
              {modeRecherche === "suivi" && (
                <div className="tr-field">
                  <label className="tr-label">Revoir ce client tous les...</label>
                  <div className="tr-mode-row">
                    {[{v:30,l:"1 mois"},{v:90,l:"3 mois"},{v:180,l:"6 mois"}].map(({v,l}) => (
                      <button key={v} className={`tr-mode-btn ${horizonJours === v ? "active" : ""}`} onClick={() => setHorizonJours(v)}>{l}</button>
                    ))}
                  </div>
                  <p style={{ fontSize:11.5, color:"var(--gris)", marginTop:6, marginBottom:0 }}>L'appli vise une date autour de cet intervalle après la dernière visite.</p>
                </div>
              )}
              {modeRecherche === "date" && (
                <div className="tr-field">
                  <label className="tr-label">Date souhaitée</label>
                  <input className="tr-input" type="date" value={dateChoisie} min={dateToKey(new Date())} onChange={(e) => setDateChoisie(e.target.value)}/>
                </div>
              )}
              {modeRecherche === "periode" && (
                <div className="tr-field">
                  <label className="tr-label">Période souhaitée</label>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <input className="tr-input" type="date" value={periodeDebut} min={dateToKey(new Date())} onChange={(e) => setPeriodeDebut(e.target.value)} style={{ flex:1 }}/>
                    <span style={{ color:"var(--gris)", fontSize:12, flexShrink:0 }}>au</span>
                    <input className="tr-input" type="date" value={periodeFin} min={periodeDebut || dateToKey(new Date())} onChange={(e) => setPeriodeFin(e.target.value)} style={{ flex:1 }}/>
                  </div>
                </div>
              )}
              <div className="tr-search">
                <Search size={15}/>
                <input className="tr-input" placeholder="Rechercher un établissement ou une ville..." value={recherche} onChange={(e) => setRecherche(e.target.value)}/>
              </div>
              <div className="tr-clients-list">
                {clientsFiltres.slice(0, 60).map((c) => (
                  <div key={c.id} className="tr-client-row" onClick={() => {
                    if (modeRecherche === "date" && !dateChoisie) { setErreur("Choisis d'abord une date."); return; }
                    if (modeRecherche === "periode" && (!periodeDebut || !periodeFin)) { setErreur("Choisis une date de début et de fin."); return; }
                    const mode = modeRecherche === "urgent" ? { type:"urgent" }
                      : modeRecherche === "suivi" ? { type:"suivi", jours:horizonJours, derniereVisite:c.derniereVisite }
                      : modeRecherche === "date" ? { type:"date", date:dateChoisie }
                      : modeRecherche === "periode" ? { type:"periode", debut:periodeDebut, fin:periodeFin }
                      : { type:"semaine" };
                    chercherCreneau(c, mode);
                  }}>
                    <span className="tr-pression-dot" style={{ background: PRESSION_COLOR[c.pression] || "var(--gris)" }}/>
                    <div className="tr-client-row-main">
                      <div className="tr-client-row-name">{c.etablissement}</div>
                      <div className="tr-client-row-meta">{c.ville}{c.derniereVisite ? ` · vu le ${formatDateCourt(c.derniereVisite)}` : " · jamais vu"}</div>
                    </div>
                    {c.ciblage && <span className={`tr-badge ${["OR", "PLATINIUM", "COMPTE CLE"].includes(c.ciblage) ? "tr-badge-gold" : "tr-badge-default"}`}>{c.ciblage}</span>}
                    <BadgeContactManquant client={c} onClick={() => setFicheOuverte(c)}/>
                  </div>
                ))}
              </div>
            </div>

            <div>
              {erreur && <div className="tr-alert"><AlertCircle size={16} style={{ flexShrink:0, marginTop:1 }}/><span>{erreur}</span></div>}
              {calcEnCours && <div className="tr-card"><div className="tr-empty"><RefreshCw size={22} style={{ marginBottom:8, opacity:0.5 }}/><br/>Recherche du meilleur créneau...</div></div>}
              {creneauRetenu && !suggestions && !calcEnCours && (
                <div className="tr-creneau-retenu">
                  <div className="tr-creneau-retenu-info">
                    <strong>✓ {creneauRetenu.client.etablissement}</strong>
                    <span>Planifié le {formatDateFr(creneauRetenu.sugg.jour)} à {minToHHMM(creneauRetenu.sugg.arrivee)}</span>
                  </div>
                  <BoutonAgenda pharmacie={creneauRetenu.client} date={creneauRetenu.sugg.jour} heure={minToHHMMInput(creneauRetenu.sugg.arrivee)} duree={creneauRetenu.client.dureeDefaut || 20} onSave={(rdv) => setAgendaRdvs((prev) => [...(prev || []), rdv])}/>
                </div>
              )}
              {!suggestions && !calcEnCours && !erreur && !creneauRetenu && (
                <div className="tr-card"><div className="tr-empty"><Sparkles size={26} style={{ marginBottom:8, opacity:0.4 }}/><br/>Sélectionne un client à gauche.<br/>L'appli propose les meilleurs créneaux selon ta semaine planifiée.</div></div>
              )}
              {suggestions && clientSelectionne && !calcEnCours && (
                <div className="tr-card">
                  <div className="tr-card-title"><Trophy size={14}/> Top créneaux pour {clientSelectionne.etablissement}</div>
                  <div className="tr-sugg-list">
                    {suggestions.map((s, idx) => (
                      <div key={`${s.jour}-${idx}`} className={`tr-sugg-card ${idx === 0 ? "rang-1" : ""}`} onClick={() => retenirCreneau(s)}>
                        <div className="tr-sugg-rank">{idx + 1}</div>
                        <div className="tr-sugg-top">
                          <span className="tr-sugg-jour">{formatDateFr(s.jour)}</span>
                          <span className="tr-sugg-cout">{s.coutSupplementaire <= 0 ? "Sur la route" : `+${formatMin(s.coutSupplementaire)}`}</span>
                        </div>
                        <div className="tr-sugg-detail">Entre <strong>{s.avant}</strong>{s.apres ? <> et <strong>{s.apres}</strong></> : <> (fin de journée)</>}</div>
                        <div className="tr-sugg-time"><Clock size={11} style={{ display:"inline", marginRight:4, verticalAlign:-1 }}/>Arrivée à {minToHHMM(s.arrivee)} · fin à {minToHHMM(s.fin)}</div>
                      </div>
                    ))}
                  </div>
                  <button className="tr-btn tr-btn-ghost tr-btn-full" style={{ marginTop:12 }} onClick={() => { setSuggestions(null); setClientSelectionne(null); }}>Annuler</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── VUE : MA SEMAINE ── */}
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
            onOuvrirFiche={setFicheOuverte}
          />
        )}

        {/* ── VUE : AGENDA ── */}
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

      {/* ── MODAL PLAN B ── */}
      {rdvAnnule && (
        <div className="tr-modal-overlay" onClick={() => { setRdvAnnule(null); setPlanB(null); }}>
          <div className="tr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tr-modal-head">
              <div>
                <div className="tr-card-title" style={{ marginBottom:4 }}><ShieldAlert size={14}/> Plan B</div>
                <div style={{ fontSize:13, color:"var(--gris)" }}>{rdvAnnule.item.client.etablissement} décommandé — clients à proximité triés par priorité</div>
              </div>
              <button style={{ background:"none", border:"none", cursor:"pointer" }} onClick={() => { setRdvAnnule(null); setPlanB(null); }}><X size={18}/></button>
            </div>
            {planB && planB.length === 0 && <div className="tr-empty">Aucun client à moins de 45 min.</div>}
            {planB && planB.map((res, idx) => (
              <div className="tr-planb-item" key={res.client.id}>
                <div className="tr-planb-rank">{idx + 1}</div>
                <span className="tr-pression-dot" style={{ background: PRESSION_COLOR[res.client.pression] || "var(--gris)" }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:13.5 }}>{res.client.etablissement}</div>
                  <div style={{ fontSize:11.5, color:"var(--gris)" }}>{res.client.ville} · {formatMin(res.trajet)} de trajet{res.client.derniereVisite ? ` · vu le ${formatDateCourt(res.client.derniereVisite)}` : " · jamais vu"}</div>
                </div>
                {res.client.ciblage && <span className={`tr-badge ${["OR", "PLATINIUM", "COMPTE CLE"].includes(res.client.ciblage) ? "tr-badge-gold" : "tr-badge-default"}`}>{res.client.ciblage}</span>}
                {/* Appel direct si mobile dispo, sinon fallback tel1 */}
                {(res.client.mobile_titulaire || res.client.tel1) && (
                  <a href={`tel:${res.client.mobile_titulaire || res.client.tel1}`} className="tr-btn tr-btn-outline tr-btn-sm" style={{ flexShrink:0 }}><Phone size={12}/></a>
                )}
                <BadgeContactManquant client={res.client} onClick={() => { setRdvAnnule(null); setPlanB(null); setFicheOuverte(res.client); }}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL FICHE CLIENT ── */}
      {ficheOuverte && (
        <FicheClient
          client={ficheOuverte}
          onSave={sauvegarderContact}
          onClose={() => setFicheOuverte(null)}
        />
      )}

      {/* ── ASSISTANT VOCAL ── */}
      <AssistantVocal clients={clients} rdvDuJour={rdvAujourdhui} />

      {/* ── TOAST ── */}
      {toast && (
        <div className={`tr-toast ${toast.type === "erreur" ? "error" : ""}`}>
          {toast.type === "erreur" ? <AlertCircle size={15}/> : <CheckCircle2 size={15}/>}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sous-composant : vue Semaine
// ============================================================
function SemaineView({ departs, definirDepartJour, rdvParJourCalcule, joursTries, ouvrirPlanB, domicile, definirDomicile, appliquerDomicileAuJour, agendaRdvs, setAgendaRdvs, supprimerVisite, supprimerRdvAgenda, onOuvrirFiche }) {
  const [nouveauJour, setNouveauJour]             = useState("");
  const [adresseInput, setAdresseInput]           = useState("");
  const [heureInput, setHeureInput]               = useState("08:30");
  const [domicileInput, setDomicileInput]         = useState(domicile ? domicile.adresse : "");
  const [domicileHeureInput, setDomicileHeureInput] = useState(domicile ? domicile.heure : "08:30");
  const [enregistrementDomicile, setEnregistrementDomicile] = useState(false);

  const aujourdHui = dateToKey(new Date());
  const joursAgenda = (agendaRdvs || []).map(r => r.jour).filter(Boolean);
  const tousLesJours = Array.from(new Set([...joursTries, ...Object.keys(departs), ...joursAgenda])).sort();

  // Calculer le lundi de la semaine en cours
  const lundiSemaineCourante = (() => {
    const now = new Date();
    const jourSem = now.getDay();
    const diffLundi = jourSem === 0 ? -6 : 1 - jourSem;
    const lundi = new Date(now);
    lundi.setDate(now.getDate() + diffLundi);
    lundi.setHours(0, 0, 0, 0);
    return lundi.toISOString().slice(0, 10);
  })();

  // Par defaut : n'afficher que les jours a partir du lundi de cette semaine
  const [afficherPassés, setAfficherPassés] = useState(false);
  const joursAffiches = afficherPassés
    ? tousLesJours
    : tousLesJours.filter(d => d >= lundiSemaineCourante);
  const nbJoursPassés = tousLesJours.filter(d => d < lundiSemaineCourante).length;

  // Scroll automatique vers la semaine en cours a l'ouverture
  // On cherche le lundi de la semaine actuelle, puis le 1er jour planifie
  // dans une fenetre de 7 jours autour d'aujourd'hui
  const semaineEnCoursRef = useRef(null);
  const lundiSemaineRef = useRef(null);
  useEffect(() => {
    // Calculer le lundi de la semaine en cours
    const now = new Date();
    const jourSem = now.getDay();
    const diffLundi = jourSem === 0 ? -6 : 1 - jourSem;
    const lundi = new Date(now);
    lundi.setDate(now.getDate() + diffLundi);
    lundi.setHours(0, 0, 0, 0);
    lundiSemaineRef.current = lundi.toISOString().slice(0, 10);

    setTimeout(() => {
      if (semaineEnCoursRef.current) {
        semaineEnCoursRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 150);
  }, []);

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
          <div className="tr-card-title"><MapPin size={14}/> Mon domicile (départ par défaut)</div>
          {domicile && (
            <div style={{ fontSize:13, marginBottom:10, padding:"8px 10px", background:"var(--vert-clair)", borderRadius:7 }}>
              <strong>{domicile.adresse}</strong>
              <div style={{ fontSize:11.5, color:"var(--gris)" }}>Départ habituel à {domicile.heure}</div>
            </div>
          )}
          <div className="tr-field">
            <label className="tr-label">Adresse de domicile</label>
            <input className="tr-input" placeholder="Ex. 12 rue de la Paix, Bordeaux" value={domicileInput} onChange={(e) => setDomicileInput(e.target.value)}/>
          </div>
          <div className="tr-field">
            <label className="tr-label">Heure de départ habituelle</label>
            <input className="tr-input" type="time" value={domicileHeureInput} onChange={(e) => setDomicileHeureInput(e.target.value)}/>
          </div>
          <button className="tr-btn tr-btn-primary tr-btn-full" onClick={sauvegarderDomicile} disabled={enregistrementDomicile}>
            <MapPin size={14}/> {enregistrementDomicile ? "Enregistrement..." : domicile ? "Mettre à jour mon domicile" : "Enregistrer mon domicile"}
          </button>
          <p style={{ fontSize:11.5, color:"var(--gris)", marginTop:8, marginBottom:0 }}>Une fois enregistré, tu pourras l'appliquer en un clic à n'importe quel jour.</p>
        </div>
        <div className="tr-card">
          <div className="tr-card-title"><Calendar size={14}/> Point de départ d'un jour précis</div>
          <div className="tr-field">
            <label className="tr-label">Jour</label>
            <input className="tr-input" type="date" value={nouveauJour} min={aujourdHui} onChange={(e) => setNouveauJour(e.target.value)}/>
          </div>
          {domicile && (
            <button className="tr-btn tr-btn-outline tr-btn-full" style={{ marginBottom:12 }} onClick={utiliserDomicilePourNouveauJour} disabled={!nouveauJour}>
              <MapPin size={14}/> Utiliser mon domicile pour ce jour
            </button>
          )}
          <div className="tr-field">
            <label className="tr-label">Ou une autre adresse de départ</label>
            <input className="tr-input" placeholder="Ex. 12 rue X, Bordeaux" value={adresseInput} onChange={(e) => setAdresseInput(e.target.value)}/>
          </div>
          <div className="tr-field">
            <label className="tr-label">Heure de départ</label>
            <input className="tr-input" type="time" value={heureInput} onChange={(e) => setHeureInput(e.target.value)}/>
          </div>
          <button className="tr-btn tr-btn-outline tr-btn-full" onClick={ajouterDepart}>
            <MapPin size={14}/> Enregistrer cette adresse pour ce jour
          </button>
        </div>
      </div>

      <div className="tr-card">
        <div className="tr-card-title"><Calendar size={14}/> Vue de la semaine</div>

        {nbJoursPassés > 0 && (
          <button onClick={() => setAfficherPassés(p => !p)}
            style={{ marginBottom:12, background:"transparent", border:"1.5px solid var(--gris-clair)", borderRadius:6, padding:"7px 12px", fontSize:12, color:"var(--gris)", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", letterSpacing:"0.03em" }}>
            {afficherPassés ? "▲ Masquer les semaines précédentes" : `▼ ${nbJoursPassés} jour${nbJoursPassés > 1 ? "s" : ""} précédent${nbJoursPassés > 1 ? "s" : ""}`}
          </button>
        )}

        {joursAffiches.length === 0 ? (
          <div className="tr-empty">Aucun jour planifié. Commence par définir ton domicile ou un point de départ à gauche.</div>
        ) : (
          joursAffiches.map((dateKey) => {
            const depart = departs[dateKey];
            const seq = rdvParJourCalcule[dateKey] || [];
            const clientIdsSeq = new Set(seq.map(item => item.client.id));
            const rdvAgendaJour = (agendaRdvs || []).filter(r => r.jour === dateKey && !r.overrideTournee && !(r.clientId && clientIdsSeq.has(r.clientId)));
            const totalRdv = seq.length + rdvAgendaJour.length;

            // CORRECTIF : fusionner Tournée + Agenda puis trier par heure
            const itemsTournee = seq.map((item) => {
              const override = (agendaRdvs || []).find(r => r.overrideTournee === item.client.id && r.jour === dateKey);
              const heureAff = override ? override.debut.replace(":", "h") : minToHHMM(item.heureArrivee);
              const heureInp = override ? override.debut : minToHHMMInput(item.heureArrivee);
              const minutesDebut = override ? hhmmToMin(override.debut) : item.heureArrivee;
              return { kind: "tournee", minutesDebut, item, heureAff, heureInp };
            });
            const itemsAgenda = rdvAgendaJour.map((r) => ({
              kind: "agenda",
              minutesDebut: r.debut ? hhmmToMin(r.debut) : 0,
              r,
            }));
            const itemsTries = [...itemsTournee, ...itemsAgenda].sort((a, b) => a.minutesDebut - b.minutesDebut);

            // Attacher le ref au premier jour de la semaine en cours
            // (lundi de cette semaine, ou le plus proche dans la liste)
            const lundiCourant = lundiSemaineRef.current;
            const estDansSemaineCourante = lundiCourant && dateKey >= lundiCourant && dateKey <= (
              (() => { const v = new Date(lundiCourant + "T00:00:00"); v.setDate(v.getDate() + 6); return v.toISOString().slice(0,10); })()
            );
            // On attache le ref sur le PREMIER jour affiché dans la semaine courante
            const doitScroller = estDansSemaineCourante && !semaineEnCoursRef._attached;
            if (doitScroller) semaineEnCoursRef._attached = true;

            return (
              <div className="tr-jour-block" key={dateKey} ref={doitScroller ? semaineEnCoursRef : null}>
                <div className="tr-jour-block-head" style={{ background: dateKey === aujourdHui ? "var(--orange)" : "var(--ardoise)" }}>
                  <span>{formatDateFr(dateKey)}</span>
                  <span>{totalRdv} RDV{depart ? ` · Départ ${depart.heure}` : ""}</span>
                </div>
                <div className="tr-jour-block-body">
                  {!depart && rdvAgendaJour.length === 0 && <div style={{ fontSize:12.5, color:"var(--gris)", padding:"6px 0" }}>Pas de point de départ défini pour ce jour</div>}
                  {seq.length === 0 && rdvAgendaJour.length === 0 && depart && <div style={{ fontSize:12.5, color:"var(--gris)", padding:"6px 0" }}>Aucun RDV ce jour</div>}

                  {itemsTries.map((entry) => {
                    if (entry.kind === "tournee") {
                      const { item, heureAff, heureInp } = entry;
                      return (
                        <div className="tr-stop-line" key={`t-${item.client.id}`}>
                          <span className="tr-pression-dot" style={{ background: PRESSION_COLOR[item.client.pression] || "var(--gris)" }}/>
                          <span className="tr-stop-line-time">{heureAff}</span>
                          <span className="tr-stop-line-name" style={{ cursor:"pointer" }} onClick={() => onOuvrirFiche && onOuvrirFiche(item.client)}>{item.client.etablissement}</span>
                          <span className="tr-stop-line-trajet">{item.client.ville}</span>
                          <div className="tr-stop-line-actions">
                            {item.client.mobile_titulaire && (
                              <a href={`tel:${item.client.mobile_titulaire}`} className="tr-btn tr-btn-outline tr-btn-sm" style={{ flexShrink:0 }} title={`Appeler ${item.client.mobile_titulaire}`}><Phone size={12}/></a>
                            )}
                            <BoutonAgenda pharmacie={item.client} date={dateKey} heure={heureInp} duree={item.client.dureeDefaut || 20} onSave={(rdv) => setAgendaRdvs((prev) => [...(prev || []), rdv])}/>
                            <button className="tr-btn tr-btn-outline tr-btn-sm" onClick={() => ouvrirPlanB(dateKey, item)}>
                              <ShieldAlert size={12}/> Lapin
                            </button>
                            <button className="tr-btn tr-btn-sm" title="Supprimer ce RDV"
                              onClick={() => { if (window.confirm(`Supprimer ${item.client.etablissement} du ${dateKey} ?`)) supprimerVisite(dateKey, item.client.id); }}
                              style={{ background:"transparent", border:"1.5px solid var(--rouge)", color:"var(--rouge)", borderRadius:6, cursor:"pointer", padding:"5px 8px", display:"inline-flex", alignItems:"center" }}>
                              <X size={12}/>
                            </button>
                          </div>
                        </div>
                      );
                    }
                    const r = entry.r;
                    const heureAffichee = r.debut ? r.debut.replace(":", "h") : "—";
                    const titre = r.titre || "Agenda RDV";
                    const isPersonnel = r.type === "personnel" || r.source === "google";
                    // Trouver le client associé si ce RDV vient d'une pharmacie
                    const clientAgenda = r.clientId ? (rdvParJourCalcule[dateKey] || []).find(x => x.client.id === r.clientId)?.client || null : null;
                    return (
                      <div className="tr-stop-line tr-stop-line-agenda" key={`a-${r.id}`} style={{ borderLeftColor: isPersonnel ? "var(--gris)" : "var(--vert)" }}>
                        <span className="tr-stop-line-time">{heureAffichee}</span>
                        <span className="tr-stop-line-name">{titre}</span>
                        <span className="tr-stop-line-trajet" style={{ color: isPersonnel ? "var(--gris)" : "var(--vert)", fontWeight:600 }}>
                          {isPersonnel ? "Personnel" : "Agenda"}
                        </span>
                        <div className="tr-stop-line-actions">
                          {!isPersonnel && (
                            <BoutonAgenda
                              pharmacie={clientAgenda || { id: r.id, etablissement: titre, nom: titre, ville: "", adresse: "", cp: "", tel1: null, email: null, contact: null, ciblage: null, groupement: null }}
                              date={dateKey}
                              heure={r.debut || "09:00"}
                              duree={r.debut && r.fin ? ((() => { const [h1,m1] = r.debut.split(":").map(Number); const [h2,m2] = r.fin.split(":").map(Number); return (h2*60+m2)-(h1*60+m1); })()) : 30}
                              onSave={(rdvSaved) => setAgendaRdvs((prev) => prev.map(x => x.id === r.id ? { ...x, googleEventId: rdvSaved.googleEventId } : x))}
                            />
                          )}
                          <button title="Supprimer ce RDV"
                            onClick={() => { if (window.confirm(`Supprimer "${titre}" ?`)) supprimerRdvAgenda(r.id); }}
                            style={{ background:"transparent", border:"1.5px solid var(--rouge)", color:"var(--rouge)", borderRadius:6, cursor:"pointer", padding:"5px 8px", display:"inline-flex", alignItems:"center", flexShrink:0 }}>
                            <X size={12}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
