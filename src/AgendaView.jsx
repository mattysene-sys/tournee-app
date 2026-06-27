import React, { useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Calendar, RefreshCw, CheckCircle2, Clock, Send } from "lucide-react";

// ─── Hook Google Calendar (intégré) ──────────────────────────────────────────
const CLIENT_ID = '185834811620-ai8nof64ohu3792boete33h42i4skr3a.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

let _gcalTokenClient = null;
let _gcalAccessToken = null;

function useGoogleCalendar() {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadGoogleScript = useCallback(() => {
    return new Promise((resolve) => {
      if (window.google?.accounts) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = resolve;
      document.body.appendChild(script);
    });
  }, []);

  const authorize = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loadGoogleScript();
      await new Promise((resolve, reject) => {
        _gcalTokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (response) => {
            if (response.error) { reject(new Error(response.error)); }
            else { _gcalAccessToken = response.access_token; setIsReady(true); resolve(); }
          },
        });
        _gcalTokenClient.requestAccessToken({ prompt: 'consent' });
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [loadGoogleScript]);

  const createEvent = useCallback(async ({ pharmacie, date, heure = '09:00', duree = 30, notes = '' }) => {
    if (!_gcalAccessToken) throw new Error("Non autorise - connecter Google Agenda.");
    const [annee, mois, jour] = date.split('-');
    const [h, m] = heure.split(':');
    const debut = new Date(annee, mois - 1, jour, h, m);
    const fin = new Date(debut.getTime() + duree * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    const getCouleur = (ciblage) => {
      if (!ciblage) return '1';
      const c = ciblage.toUpperCase();
      if (c.includes('COMPTE CLE') || c.includes('PLATINIUM')) return '11';
      if (c.includes('GOLD')) return '5';
      if (c.includes('SILVER')) return '7';
      return '1';
    };
    const event = {
      summary: `Visite ${pharmacie.etablissement || pharmacie.nom}`,
      location: [pharmacie.adresse, pharmacie.ville, pharmacie.cp].filter(Boolean).join(', '),
      description: [
        pharmacie.contact ? `Contact : ${pharmacie.contact}` : '',
        pharmacie.tel1   ? `Tél : ${pharmacie.tel1}` : '',
        pharmacie.email  ? `Email : ${pharmacie.email}` : '',
        pharmacie.ciblage    ? `Ciblage : ${pharmacie.ciblage}` : '',
        pharmacie.groupement ? `Groupement : ${pharmacie.groupement}` : '',
        notes ? `Notes : ${notes}` : '',
      ].filter(Boolean).join('\n'),
      start: { dateTime: toISO(debut), timeZone: 'Europe/Paris' },
      end:   { dateTime: toISO(fin),   timeZone: 'Europe/Paris' },
      colorId: getCouleur(pharmacie.ciblage),
    };
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${_gcalAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      const err = await response.json();
      if (err.error?.code === 401) { _gcalAccessToken = null; setIsReady(false); throw new Error('Session expirée. Reconnecte Google Agenda.'); }
      throw new Error(err.error?.message || 'Erreur API Google Calendar');
    }
    return await response.json();
  }, []);

  return { isReady, isLoading, error, authorize, createEvent };
}


const HEURES_DEBUT = 8;
const HEURES_FIN = 19;
const HAUTEUR_HEURE = 72;
const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

const TYPE_COLORS = {
  tournee: { bg: "#E6F1FB", border: "#185FA5", text: "#0C447C" },
  google:  { bg: "#EAF3DE", border: "#3B6D11", text: "#27500A" },
  rdv:     { bg: "#FAECE7", border: "#993C1D", text: "#712B13" },
};

// ✅ CORRECTION FUSEAU : utilise l'heure locale, pas UTC
function dateToKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}

function getLundi(offset = 0) {
  const now = new Date();
  const jour = now.getDay();
  const diff = jour === 0 ? -6 : 1 - jour;
  const lundi = new Date(now);
  lundi.setDate(now.getDate() + diff + offset * 7);
  lundi.setHours(0, 0, 0, 0);
  return lundi;
}

function getNumSemaine(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const js = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - js);
  const jan1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - jan1) / 86400000) + 1) / 7);
}

function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minToHHMM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function minToAff(min) {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2,"0")}h${String(m).padStart(2,"0")}`;
}

function isToday(d) {
  const t = new Date();
  return d.getDate()===t.getDate() && d.getMonth()===t.getMonth() && d.getFullYear()===t.getFullYear();
}

function uid() { return Math.random().toString(36).slice(2,10); }

// ─── Modal ───────────────────────────────────────────────────────────────────
function ModalRdv({ rdv, onSave, onDelete, onClose, isTournee, clients = [] }) {
  const [titre,         setTitre]         = useState(rdv?.titre || "");
  const [type,          setType]          = useState(rdv?.type  || "rdv");
  const [jour,          setJour]          = useState(rdv?.jour  || "");
  const [debut,         setDebut]         = useState(rdv?.debut || "09:00");
  const [fin,           setFin]           = useState(rdv?.fin   || "09:30");
  const [rechercheClient, setRechercheClient] = useState("");
  const [clientChoisi,  setClientChoisi]  = useState(null); // client sélectionné depuis la base
  const [showSuggestions, setShowSuggestions] = useState(false);

  const lbl = { display:"block", fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#8A93A0", marginBottom:5, fontWeight:600 };
  const inp = { width:"100%", padding:"9px 11px", border:"1.5px solid #DCD7CB", borderRadius:6, fontSize:14, fontFamily:"inherit", color:"#1C2630", background:"#F5F2EC", boxSizing:"border-box" };
  const btn = { fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", letterSpacing:"0.04em", fontSize:13, padding:"10px 16px", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 };

  // Suggestions filtrées depuis la base clients
  const suggestions = rechercheClient.trim().length >= 2
    ? clients.filter(c =>
        c.etablissement.toLowerCase().includes(rechercheClient.toLowerCase()) ||
        (c.ville || "").toLowerCase().includes(rechercheClient.toLowerCase())
      ).slice(0, 6)
    : [];

  function choisirClient(client) {
    setClientChoisi(client);
    setTitre(client.etablissement);
    setRechercheClient(client.etablissement);
    setShowSuggestions(false);
    setType("tournee"); // une visite client = type visite
  }

  function effacerClient() {
    setClientChoisi(null);
    setTitre("");
    setRechercheClient("");
    setType("rdv");
  }

  const titreEffectif = isTournee ? rdv.titre : titre.trim();
  const peutSauvegarder = titreEffectif && jour;

  const PRESSION_COLOR = { Rouge: "#C75450", Orange: "#E8714A", Vert: "#5B8C6E" };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(28,38,48,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }} onClick={onClose}>
      <div style={{ background:"white", borderRadius:12, padding:22, maxWidth:420, width:"100%", maxHeight:"90vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>

        {/* En-tête */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:13, color:"#8A93A0" }}>
            {isTournee ? "Repositionner la visite" : rdv?.id ? "Modifier" : "Nouveau RDV"}
          </span>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#8A93A0" }}><X size={18}/></button>
        </div>

        {/* Visite Tournée repositionnée */}
        {isTournee && (
          <div style={{ background:"#E6F1FB", border:"1px solid #185FA5", borderRadius:8, padding:"8px 11px", marginBottom:12, fontSize:12.5, color:"#0C447C" }}>
            <strong>{rdv.titre}</strong><br/>
            <span style={{ opacity:0.8 }}>Visite Tournée — titre non modifiable</span>
          </div>
        )}

        {/* Recherche client depuis la base */}
        {!isTournee && (
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Client (base pharmacies)</label>
            <div style={{ position:"relative" }}>
              {clientChoisi ? (
                /* Client sélectionné — fiche résumée */
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 11px", background:"#E6F1FB", border:"1.5px solid #185FA5", borderRadius:6 }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", background: PRESSION_COLOR[clientChoisi.pression] || "#DCD7CB", flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{clientChoisi.etablissement}</div>
                    <div style={{ fontSize:11, color:"#8A93A0" }}>{clientChoisi.ville}{clientChoisi.ciblage ? ` · ${clientChoisi.ciblage}` : ""}{clientChoisi.tel1 ? ` · ${clientChoisi.tel1}` : ""}</div>
                  </div>
                  <button onClick={effacerClient} style={{ background:"none", border:"none", cursor:"pointer", color:"#8A93A0", padding:0, flexShrink:0 }}><X size={14}/></button>
                </div>
              ) : (
                <>
                  <input
                    style={{ ...inp, paddingRight:32 }}
                    placeholder="Tape le nom d'une pharmacie ou d'une ville..."
                    value={rechercheClient}
                    onChange={e => { setRechercheClient(e.target.value); setTitre(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    autoFocus
                  />
                  {rechercheClient && (
                    <button onClick={effacerClient} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#8A93A0", padding:0 }}>
                      <X size={14}/>
                    </button>
                  )}
                  {/* Liste de suggestions */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"white", border:"1.5px solid #DCD7CB", borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", zIndex:300, overflow:"hidden" }}>
                      {suggestions.map(c => (
                        <div
                          key={c.id}
                          onClick={() => choisirClient(c)}
                          style={{ display:"flex", alignItems:"center", gap:9, padding:"9px 12px", cursor:"pointer", borderBottom:"1px solid #F0EDE7" }}
                          onMouseEnter={e => e.currentTarget.style.background="#F5F2EC"}
                          onMouseLeave={e => e.currentTarget.style.background="white"}
                        >
                          <span style={{ width:8, height:8, borderRadius:"50%", background: PRESSION_COLOR[c.pression] || "#DCD7CB", flexShrink:0 }}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:600, fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.etablissement}</div>
                            <div style={{ fontSize:11, color:"#8A93A0" }}>{c.ville}{c.ciblage ? ` · ${c.ciblage}` : ""}</div>
                          </div>
                          {c.tel1 && <span style={{ fontSize:11, color:"#8A93A0", flexShrink:0 }}>{c.tel1}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {showSuggestions && rechercheClient.trim().length >= 2 && suggestions.length === 0 && (
                    <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"white", border:"1.5px solid #DCD7CB", borderRadius:8, padding:"10px 12px", fontSize:12.5, color:"#8A93A0", zIndex:300 }}>
                      Aucun client trouvé — tu peux quand même saisir un titre libre ci-dessous
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Titre libre si pas de client sélectionné */}
            {!clientChoisi && (
              <div style={{ marginTop:10 }}>
                <label style={lbl}>Ou titre libre</label>
                <input style={inp} value={titre} onChange={e=>setTitre(e.target.value)} placeholder="Ex: Réunion IBSA, Formation..."/>
              </div>
            )}
          </div>
        )}

        {/* Type — seulement si pas de client pharmacie sélectionné */}
        {!isTournee && !clientChoisi && (
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Type</label>
            <div style={{ display:"flex", gap:6 }}>
              {[{value:"tournee",label:"Visite"},{value:"rdv",label:"RDV perso"}].map(({value,label})=>(
                <button key={value} onClick={()=>setType(value)} style={{ flex:1, padding:"8px", borderRadius:6, border:"1.5px solid", borderColor:type===value?TYPE_COLORS[value].border:"#DCD7CB", background:type===value?TYPE_COLORS[value].bg:"white", color:type===value?TYPE_COLORS[value].text:"#8A93A0", fontFamily:"'Oswald',sans-serif", fontSize:12, textTransform:"uppercase", cursor:"pointer" }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Jour */}
        <div style={{ marginBottom:12 }}>
          <label style={lbl}>Jour {isTournee && <span style={{fontWeight:400,textTransform:"none",fontSize:10}}>(peut changer de semaine)</span>}</label>
          <input type="date" style={inp} value={jour} onChange={e=>setJour(e.target.value)}/>
        </div>

        {/* Heures */}
        <div style={{ display:"flex", gap:10, marginBottom:18 }}>
          <div style={{ flex:1 }}>
            <label style={lbl}>Début</label>
            <input type="time" style={inp} value={debut} onChange={e=>setDebut(e.target.value)}/>
          </div>
          <div style={{ flex:1 }}>
            <label style={lbl}>Fin</label>
            <input type="time" style={inp} value={fin} onChange={e=>setFin(e.target.value)}/>
          </div>
        </div>

        {/* Boutons */}
        <div style={{ display:"flex", gap:8 }}>
          {rdv?.id && (
            <button onClick={()=>onDelete(rdv.id, rdv)} style={{ ...btn, background:"transparent", border:"1.5px solid #C75450", color:"#C75450", padding:"10px 12px" }}>
              <X size={14}/>
            </button>
          )}
          <button onClick={onClose} style={{ ...btn, flex:1, background:"transparent", border:"1.5px solid #DCD7CB", color:"#8A93A0" }}>Annuler</button>
          <button
            onClick={()=>{
              if (peutSauvegarder) {
                onSave({
                  id: rdv?.id || uid(),
                  titre: titreEffectif,
                  type: isTournee ? "tournee" : (clientChoisi ? "tournee" : type),
                  jour, debut, fin,
                  readOnly: false,
                  overrideTournee: isTournee ? rdv.clientId : undefined,
                  clientId: clientChoisi ? clientChoisi.id : undefined,
                });
              }
            }}
            style={{ ...btn, flex:2, background: peutSauvegarder ? "#E8714A" : "#DCD7CB", color: peutSauvegarder ? "white" : "#8A93A0", border:"none", cursor: peutSauvegarder ? "pointer" : "not-allowed" }}
            disabled={!peutSauvegarder}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panneau Google ───────────────────────────────────────────────────────────
function PanneauGoogle({ googleEvents, onImport, onClear }) {
  const fileRef = React.useRef(null);
  const btn = { fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:12, padding:"9px 14px", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, border:"none" };

  function parseIcal(text) {
    const events = [];
    const blocks = text.split("BEGIN:VEVENT");
    blocks.shift();
    for (const block of blocks) {
      try {
        const get = (key) => { const m = block.match(new RegExp(`${key}[^:]*:([^\r\n]+)`)); return m ? m[1].trim() : null; };
        const summary = get("SUMMARY") || "RDV";
        const dtstart = get("DTSTART"), dtend = get("DTEND");
        if (!dtstart) continue;

        // ✅ CORRECTION FUSEAU : parse en heure locale, pas UTC
        function parseDate(s) {
          const clean = s.replace(/[^0-9T]/g,"");
          const isAllDay = !s.includes("T");
          const y  = parseInt(clean.slice(0,4));
          const mo = parseInt(clean.slice(4,6)) - 1;
          const d  = parseInt(clean.slice(6,8));
          if (isAllDay) return { date: new Date(y, mo, d), isAllDay: true };
          const h  = parseInt(clean.slice(9,11) || "0");
          const mi = parseInt(clean.slice(11,13) || "0");
          // Si UTC (se termine par Z), convertir en local
          const isUTC = s.endsWith("Z");
          const date = isUTC ? new Date(Date.UTC(y,mo,d,h,mi)) : new Date(y,mo,d,h,mi);
          return { date, isAllDay: false };
        }

        const { date: start, isAllDay } = parseDate(dtstart);
        const endParsed = dtend ? parseDate(dtend) : null;
        const end = endParsed?.date || null;

        // ✅ Utilise heure locale pour construire la clé de jour
        const jourDate = new Date(start);
        const jour = dateToKey(jourDate);

        const dh = isAllDay ? 8  : start.getHours();
        const dm = isAllDay ? 0  : start.getMinutes();
        const fh = end ? (isAllDay ? 18 : end.getHours())   : dh + 1;
        const fm = end ? (isAllDay ? 0  : end.getMinutes()) : dm;

        events.push({
          id: "gc-" + uid(),
          titre: summary,
          type: "google",
          jour,
          debut: `${String(dh).padStart(2,"0")}:${String(dm).padStart(2,"0")}`,
          fin:   `${String(Math.min(fh,19)).padStart(2,"0")}:${String(fm).padStart(2,"0")}`,
          readOnly: true,
        });
      } catch { continue; }
    }
    return events;
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onImport(parseIcal(ev.target.result));
    reader.readAsText(file);
  }

  return (
    <div style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, padding:16, marginBottom:16 }}>
      <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:13, color:"#8A93A0", marginBottom:10, display:"flex", alignItems:"center", gap:7 }}>
        <Calendar size={14}/> Importer Google Agenda (.ics)
      </div>
      {googleEvents.length === 0 ? (
        <>
          <p style={{ fontSize:12.5, color:"#8A93A0", marginBottom:12, lineHeight:1.6 }}>
            Google Agenda → <strong style={{color:"#1C2630"}}>Paramètres ⚙️ → Importer et exporter → Exporter</strong> → dézippe → importe le <strong style={{color:"#1C2630"}}>.ics</strong> ici.
          </p>
          <input ref={fileRef} type="file" accept=".ics" style={{display:"none"}} onChange={handleFile}/>
          <button onClick={()=>fileRef.current?.click()} style={{ ...btn, background:"#E8714A", color:"white", width:"100%", justifyContent:"center" }}>
            <Plus size={14}/> Choisir le fichier .ics
          </button>
        </>
      ) : (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
          <div style={{ fontSize:12.5, color:"#5B8C6E" }}>
            <CheckCircle2 size={13} style={{ display:"inline", marginRight:5, verticalAlign:-2 }}/>{googleEvents.length} événement{googleEvents.length>1?"s":""} importé{googleEvents.length>1?"s":""}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <input ref={fileRef} type="file" accept=".ics" style={{display:"none"}} onChange={handleFile}/>
            <button onClick={()=>fileRef.current?.click()} style={{ ...btn, background:"transparent", border:"1.5px solid #DCD7CB", color:"#1C2630", fontSize:11 }}>
              <RefreshCw size={12}/> Réimporter
            </button>
            <button onClick={onClear} style={{ ...btn, background:"transparent", border:"1.5px solid #C75450", color:"#C75450", fontSize:11 }}>
              <X size={12}/> Effacer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panneau Export vers Google Agenda ───────────────────────────────────────
function PanneauExport({ rdvParJourCalcule, agendaRdvs, totalRdvPlanifies, isReady, gcalLoading, authorize, createEvent, onClose }) {
  const [recherche, setRecherche] = useState("");
  const [selectionIds, setSelectionIds] = useState(new Set()); // Set de "clientId|dateKey"
  const [statut, setStatut] = useState(null); // null | 'en_cours' | 'ok' | 'erreur'
  const [progress, setProgress] = useState({ fait: 0, total: 0 });
  const [erreurs, setErreurs] = useState([]);

  // Construire la liste de tous les RDV planifiés
  const tousRdvs = [];
  Object.entries(rdvParJourCalcule).forEach(([dateKey, items]) => {
    items.forEach(item => {
      const override = (agendaRdvs || []).find(r => r.overrideTournee === item.client.id && r.jour === dateKey);
      tousRdvs.push({
        key: `${item.client.id}|${dateKey}`,
        client: item.client,
        date: dateKey,
        debut: override ? override.debut : minToHHMM(item.heureArrivee),
        fin:   override ? override.fin   : minToHHMM(item.fin),
        duree: override
          ? (timeToMin(override.fin) - timeToMin(override.debut))
          : (item.client.dureeDefaut || 20),
      });
    });
  });

  // Filtrer par recherche
  const rdvsFiltres = recherche.trim().length >= 1
    ? tousRdvs.filter(r =>
        r.client.etablissement.toLowerCase().includes(recherche.toLowerCase()) ||
        (r.client.ville || "").toLowerCase().includes(recherche.toLowerCase())
      )
    : tousRdvs;

  function toggleSelection(key) {
    setSelectionIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toutSelectionner() {
    setSelectionIds(new Set(rdvsFiltres.map(r => r.key)));
  }

  function toutDeselectionner() {
    setSelectionIds(new Set());
  }

  async function envoyer() {
    const aEnvoyer = tousRdvs.filter(r => selectionIds.has(r.key));
    if (aEnvoyer.length === 0) return;

    if (!isReady) {
      await authorize();
      return;
    }

    setStatut("en_cours");
    setProgress({ fait: 0, total: aEnvoyer.length });
    setErreurs([]);

    const errs = [];
    for (let i = 0; i < aEnvoyer.length; i++) {
      const r = aEnvoyer[i];
      try {
        await createEvent({ pharmacie: r.client, date: r.date, heure: r.debut, duree: r.duree });
      } catch (err) {
        errs.push(`${r.client.etablissement} : ${err.message}`);
      }
      setProgress({ fait: i + 1, total: aEnvoyer.length });
      await new Promise(res => setTimeout(res, 200));
    }
    setErreurs(errs);
    setStatut(errs.length === aEnvoyer.length ? "erreur" : "ok");
  }

  const nbSelectionnes = selectionIds.size;
  const inp = { width:"100%", padding:"9px 34px 9px 11px", border:"1.5px solid #DCD7CB", borderRadius:6, fontSize:14, fontFamily:"inherit", color:"#1C2630", background:"#F5F2EC", boxSizing:"border-box" };
  const btnBase = { fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", letterSpacing:"0.04em", fontSize:12, padding:"8px 13px", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5, border:"none" };

  return (
    <div style={{ background:"white", border:"1.5px solid #185FA5", borderRadius:10, padding:16, marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:13, color:"#0C447C", display:"flex", alignItems:"center", gap:7 }}>
          <Send size={14}/> Envoyer vers Google Agenda
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#8A93A0" }}><X size={16}/></button>
      </div>

      {/* Barre de recherche */}
      <div style={{ position:"relative", marginBottom:10 }}>
        <input
          style={inp}
          placeholder="Rechercher un client ou une ville..."
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          autoFocus
        />
        {recherche && (
          <button onClick={()=>setRecherche("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#8A93A0", padding:0 }}>
            <X size={14}/>
          </button>
        )}
      </div>

      {/* Actions de sélection */}
      <div style={{ display:"flex", gap:6, marginBottom:10, alignItems:"center", flexWrap:"wrap" }}>
        <button onClick={toutSelectionner} style={{ ...btnBase, background:"#F5F2EC", color:"#1C2630", border:"1px solid #DCD7CB" }}>
          Tout sélectionner ({rdvsFiltres.length})
        </button>
        {nbSelectionnes > 0 && (
          <button onClick={toutDeselectionner} style={{ ...btnBase, background:"transparent", color:"#8A93A0", border:"1px solid #DCD7CB" }}>
            Tout désélectionner
          </button>
        )}
        {nbSelectionnes > 0 && (
          <span style={{ fontSize:12, color:"#185FA5", fontWeight:600, marginLeft:"auto" }}>
            {nbSelectionnes} sélectionné{nbSelectionnes > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Liste des RDV */}
      <div style={{ maxHeight:280, overflowY:"auto", border:"1px solid #DCD7CB", borderRadius:8, marginBottom:12 }}>
        {rdvsFiltres.length === 0 && (
          <div style={{ padding:16, textAlign:"center", color:"#8A93A0", fontSize:13 }}>
            Aucun résultat
          </div>
        )}
        {rdvsFiltres.map((r, i) => {
          const selected = selectionIds.has(r.key);
          const dateAff = new Date(r.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"short" });
          return (
            <div
              key={r.key}
              onClick={() => toggleSelection(r.key)}
              style={{
                display:"flex", alignItems:"center", gap:10, padding:"9px 12px",
                borderBottom: i < rdvsFiltres.length - 1 ? "1px solid #F0EDE7" : "none",
                cursor:"pointer",
                background: selected ? "#EEF4FB" : "white",
                transition:"background 0.1s",
              }}
            >
              {/* Checkbox */}
              <div style={{
                width:18, height:18, borderRadius:4, border:"1.5px solid",
                borderColor: selected ? "#185FA5" : "#DCD7CB",
                background: selected ? "#185FA5" : "white",
                display:"flex", alignItems:"center", justifyContent:"center",
                flexShrink:0, transition:"all 0.15s",
              }}>
                {selected && <CheckCircle2 size={12} color="white" strokeWidth={3}/>}
              </div>
              {/* Infos */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:"#1C2630" }}>
                  {r.client.etablissement}
                </div>
                <div style={{ fontSize:11, color:"#8A93A0" }}>
                  {dateAff} · {r.debut.replace(":"," h ").replace(/^0/,"")} – {r.fin.replace(":"," h ").replace(/^0/,"")} · {r.client.ville}
                </div>
              </div>
              {r.client.ciblage && (
                <span style={{ fontSize:10, fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", padding:"2px 7px", borderRadius:999, background:"#F5F2EC", color:"#8A93A0", flexShrink:0 }}>
                  {r.client.ciblage}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Barre de progression */}
      {statut === "en_cours" && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:"#8A93A0", marginBottom:5 }}>Envoi en cours... {progress.fait}/{progress.total}</div>
          <div style={{ height:5, background:"#DCD7CB", borderRadius:99, overflow:"hidden" }}>
            <div style={{ height:"100%", background:"#185FA5", borderRadius:99, transition:"width 0.3s", width: progress.total ? `${100*progress.fait/progress.total}%` : "0%" }}/>
          </div>
        </div>
      )}
      {statut === "ok" && (
        <div style={{ fontSize:12.5, color:"#27500A", background:"#DCEAE0", borderRadius:7, padding:"8px 11px", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
          <CheckCircle2 size={13}/> {progress.total - erreurs.length} visite{progress.total - erreurs.length > 1 ? "s" : ""} ajoutée{progress.total - erreurs.length > 1 ? "s" : ""} à Google Agenda
          {erreurs.length > 0 && <span style={{color:"#C75450", marginLeft:8}}>· {erreurs.length} erreur{erreurs.length>1?"s":""}</span>}
        </div>
      )}
      {statut === "erreur" && erreurs.length > 0 && (
        <div style={{ fontSize:12, color:"#8A3530", background:"#FCEEED", borderRadius:7, padding:"8px 11px", marginBottom:10 }}>{erreurs[0]}</div>
      )}

      {/* Bouton envoyer */}
      <button
        onClick={envoyer}
        disabled={nbSelectionnes === 0 || statut === "en_cours"}
        style={{ ...btnBase, background: nbSelectionnes === 0 || statut === "en_cours" ? "#DCD7CB" : "#185FA5", color: nbSelectionnes === 0 || statut === "en_cours" ? "#8A93A0" : "white", width:"100%", justifyContent:"center", padding:"11px", fontSize:13 }}>
        <Send size={14}/>
        {!isReady
          ? "Connecter Google Agenda"
          : statut === "en_cours"
          ? `Envoi ${progress.fait}/${progress.total}...`
          : nbSelectionnes === 0
          ? "Sélectionne des visites ci-dessus"
          : `Envoyer ${nbSelectionnes} visite${nbSelectionnes > 1 ? "s" : ""} vers Google Agenda`}
      </button>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function AgendaView({ planning, rdvParJourCalcule, agendaRdvs, setAgendaRdvs, clients = [] }) {
  const [semaineOffset, setSemaineOffset] = useState(0);
  const [modalRdv, setModalRdv]           = useState(null);
  const [googleEvents, setGoogleEvents]   = useState(() => { try { return JSON.parse(localStorage.getItem("tournee_google_events") || "[]"); } catch { return []; } });
  const [showConfig, setShowConfig]       = useState(false);

  // ── Export vers Google Agenda ──
  const { isReady, isLoading: gcalLoading, authorize, createEvent } = useGoogleCalendar();
  const [exportStatut, setExportStatut] = useState(null); // null | 'en_cours' | 'ok' | 'erreur'
  const [exportProgress, setExportProgress] = useState({ fait: 0, total: 0 });
  const [exportErreurs, setExportErreurs] = useState([]);
  const [showExportPanel, setShowExportPanel] = useState(false);

  async function exporterVersGoogleAgenda() {
    const rdvsAExporter = [];
    Object.entries(rdvParJourCalcule).forEach(([dateKey, items]) => {
      items.forEach(item => {
        const override = (agendaRdvs || []).find(r => r.overrideTournee === item.client.id && r.jour === dateKey);
        rdvsAExporter.push({
          client: item.client,
          date: dateKey,
          debut: override ? override.debut : minToHHMM(item.heureArrivee),
          fin:   override ? override.fin   : minToHHMM(item.fin),
          duree: override
            ? (timeToMin(override.fin) - timeToMin(override.debut))
            : (item.client.dureeDefaut || 20),
        });
      });
    });

    if (rdvsAExporter.length === 0) {
      setExportStatut("erreur");
      setExportErreurs(["Aucun RDV planifié à exporter."]);
      return;
    }

    if (!isReady) {
      await authorize();
      // Après authorize, l'utilisateur devra recliquer
      return;
    }

    setExportStatut("en_cours");
    setExportProgress({ fait: 0, total: rdvsAExporter.length });
    setExportErreurs([]);

    const erreurs = [];
    for (let i = 0; i < rdvsAExporter.length; i++) {
      const r = rdvsAExporter[i];
      try {
        await createEvent({ pharmacie: r.client, date: r.date, heure: r.debut, duree: r.duree });
      } catch (err) {
        erreurs.push(`${r.client.etablissement} : ${err.message}`);
      }
      setExportProgress({ fait: i + 1, total: rdvsAExporter.length });
      await new Promise(res => setTimeout(res, 200));
    }

    setExportErreurs(erreurs);
    setExportStatut(erreurs.length === rdvsAExporter.length ? "erreur" : "ok");
  }

  // Compter les RDV planifiés (toutes semaines)
  const totalRdvPlanifies = Object.values(rdvParJourCalcule).reduce((acc, items) => acc + items.length, 0);

  const [dragInfo, setDragInfo]       = useState(null);
  const [dropPreview, setDropPreview] = useState(null);
  const gridRef                       = useRef(null);
  const colRefs                       = useRef([]);

  const lundi  = getLundi(semaineOffset);
  const jours  = Array.from({length:5},(_,i)=>{ const d=new Date(lundi); d.setDate(lundi.getDate()+i); return d; });
  const numSem = getNumSemaine(lundi);
  const rangeDates = `${lundi.getDate()} – ${jours[4].getDate()} ${lundi.toLocaleString("fr-FR",{month:"long"})} ${lundi.getFullYear()}`;

  function importerEvents(events) {
    setGoogleEvents(events);
    try { localStorage.setItem("tournee_google_events", JSON.stringify(events)); } catch {}
    setShowConfig(false);
  }
  function effacerEvents() {
    setGoogleEvents([]);
    try { localStorage.removeItem("tournee_google_events"); } catch {}
  }

  function getRdvTournee(dateKey) {
    return (rdvParJourCalcule[dateKey] || []).map(item => {
      const clientId = item.client.id;
      const override = (agendaRdvs || []).find(r => r.overrideTournee === clientId && r.jour === dateKey);
      return {
        id: "t-" + clientId, clientId,
        titre: item.client.etablissement,
        type: "tournee", jour: dateKey,
        debut: override ? override.debut : minToHHMM(item.heureArrivee),
        fin:   override ? override.fin   : minToHHMM(item.fin),
        isTournee: true,
      };
    });
  }

  function tousLesRdv(dateKey) {
    return [
      ...getRdvTournee(dateKey),
      ...googleEvents.filter(e => e.jour === dateKey),
      ...(agendaRdvs || []).filter(e => e.jour === dateKey && !e.overrideTournee),
    ];
  }

  function sauvegarderRdv(rdv) {
    setAgendaRdvs(prev => {
      const filtered = (prev || []).filter(r => {
        if (rdv.overrideTournee) return !(r.overrideTournee === rdv.overrideTournee && r.jour === rdv.jour);
        return r.id !== rdv.id;
      });
      return [...filtered, rdv];
    });
    setModalRdv(null);
  }

  function supprimerRdv(id, rdv) {
    if (id.startsWith("t-")) {
      const clientId = id.replace("t-","");
      setAgendaRdvs(prev => (prev||[]).filter(r => !(r.overrideTournee === clientId)));
    } else {
      setAgendaRdvs(prev => (prev||[]).filter(r => r.id !== id));
    }
    setModalRdv(null);
  }

  function getPosFromEvent(e) {
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX, y: touch.clientY };
  }

  function posToJourMin(clientX, clientY) {
    let colIdx = -1;
    for (let i = 0; i < colRefs.current.length; i++) {
      const el = colRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) { colIdx = i; break; }
    }
    if (colIdx === -1) return null;
    const colEl = colRefs.current[colIdx];
    const rect  = colEl.getBoundingClientRect();
    const relY  = clientY - rect.top + colEl.scrollTop;
    const minBrut = (relY / HAUTEUR_HEURE) * 60 + HEURES_DEBUT * 60;
    const min   = Math.round(minBrut / 15) * 15;
    const clamped = Math.max(HEURES_DEBUT * 60, Math.min(HEURES_FIN * 60 - 15, min));
    return { colIdx, min: clamped };
  }

  const handleDragStart = useCallback((e, rdv, isTournee) => {
    if (rdv.type === "google") return;
    e.stopPropagation();
    const { y } = getPosFromEvent(e);
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const offsetPx = y - rect.top;
    const offsetMin = Math.round((offsetPx / HAUTEUR_HEURE) * 60);
    setDragInfo({ rdv, isTournee, offsetMin });
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try {
        const ghost = el.cloneNode(true);
        ghost.style.opacity = "0.01";
        ghost.style.position = "fixed";
        ghost.style.top = "-1000px";
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => document.body.removeChild(ghost), 0);
      } catch {}
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    if (!dragInfo) return;
    const { x, y } = getPosFromEvent(e);
    const pos = posToJourMin(x, y);
    if (!pos) return;
    const { colIdx, min } = pos;
    const dureeMin = timeToMin(dragInfo.rdv.fin) - timeToMin(dragInfo.rdv.debut);
    const debutSnap = Math.max(HEURES_DEBUT*60, min - dragInfo.offsetMin);
    const finSnap   = debutSnap + dureeMin;
    setDropPreview({
      jour:  dateToKey(jours[colIdx]),
      debut: minToHHMM(debutSnap),
      fin:   minToHHMM(Math.min(finSnap, HEURES_FIN*60)),
    });
  }, [dragInfo, jours]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    if (!dragInfo || !dropPreview) { setDragInfo(null); setDropPreview(null); return; }
    const { rdv, isTournee } = dragInfo;
    const updated = {
      id:    rdv.id.startsWith("t-") ? uid() : rdv.id,
      titre: rdv.titre,
      type:  rdv.type,
      jour:  dropPreview.jour,
      debut: dropPreview.debut,
      fin:   dropPreview.fin,
      readOnly: false,
      overrideTournee: isTournee ? rdv.clientId : undefined,
    };
    setAgendaRdvs(prev => {
      let filtered = (prev||[]);
      if (isTournee) {
        filtered = filtered.filter(r => r.overrideTournee !== rdv.clientId);
      } else {
        filtered = filtered.filter(r => r.id !== rdv.id);
      }
      return [...filtered, updated];
    });
    setDragInfo(null);
    setDropPreview(null);
  }, [dragInfo, dropPreview, setAgendaRdvs]);

  const handleDragEnd = useCallback(() => {
    setDragInfo(null);
    setDropPreview(null);
  }, []);

  const heures = Array.from({length:HEURES_FIN-HEURES_DEBUT},(_,i)=>HEURES_DEBUT+i);

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", color:"#1C2630", userSelect: dragInfo ? "none" : "auto" }}>
      <style>{`
        .agenda-event-drag { cursor: grab; }
        .agenda-event-drag:active { cursor: grabbing; opacity: 0.5; }
        .agenda-drop-preview { position:absolute; left:2px; right:2px; background:rgba(232,113,74,0.18); border:2px dashed #E8714A; border-radius:4px; pointer-events:none; z-index:10; }
        .agenda-col-dropzone { position:absolute; inset:0; }
      `}</style>

      {/* En-tête */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:18, fontWeight:600 }}>Semaine {numSem}</div>
          <div style={{ fontSize:12, color:"#8A93A0", marginTop:2 }}>{rangeDates}</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <button
            onClick={()=>{ setShowExportPanel(s=>!s); setExportStatut(null); setExportErreurs([]); }}
            disabled={totalRdvPlanifies === 0}
            style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:11, padding:"7px 12px", borderRadius:6, border:"1.5px solid", borderColor: exportStatut==="ok" ? "#5B8C6E" : "#185FA5", background: exportStatut==="ok" ? "#DCEAE0" : "#E6F1FB", color: exportStatut==="ok" ? "#27500A" : "#0C447C", cursor:"pointer", display:"flex", alignItems:"center", gap:5, opacity: totalRdvPlanifies===0 ? 0.4 : 1 }}>
            <Send size={12}/>{exportStatut==="ok" ? "Envoyé ✓" : `Envoyer planning (${totalRdvPlanifies})`}
          </button>
          <button onClick={()=>setShowConfig(s=>!s)} style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:11, padding:"7px 12px", borderRadius:6, border:"1.5px solid", borderColor:googleEvents.length>0?"#5B8C6E":"#DCD7CB", background:googleEvents.length>0?"#DCEAE0":"white", color:googleEvents.length>0?"#5B8C6E":"#8A93A0", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
            <Calendar size={13}/>{googleEvents.length>0?`Google (${googleEvents.length})` :"Importer .ics"}
          </button>
          <button onClick={()=>setSemaineOffset(0)} style={{ fontFamily:"'Oswald',sans-serif", fontSize:11, padding:"7px 12px", borderRadius:6, border:"1.5px solid #DCD7CB", background:"white", color:"#8A93A0", cursor:"pointer" }}>Aujourd'hui</button>
          <button onClick={()=>setSemaineOffset(s=>s-1)} style={{ padding:"7px 10px", borderRadius:6, border:"1.5px solid #DCD7CB", background:"white", cursor:"pointer" }}><ChevronLeft size={16}/></button>
          <button onClick={()=>setSemaineOffset(s=>s+1)} style={{ padding:"7px 10px", borderRadius:6, border:"1.5px solid #DCD7CB", background:"white", cursor:"pointer" }}><ChevronRight size={16}/></button>
        </div>
      </div>

      {/* Panneau export vers Google Agenda */}
      {showExportPanel && (
        <PanneauExport
          rdvParJourCalcule={rdvParJourCalcule}
          agendaRdvs={agendaRdvs}
          totalRdvPlanifies={totalRdvPlanifies}
          isReady={isReady}
          gcalLoading={gcalLoading}
          authorize={authorize}
          createEvent={createEvent}
          onClose={()=>setShowExportPanel(false)}
        />
      )}

      {showConfig && <PanneauGoogle googleEvents={googleEvents} onImport={importerEvents} onClear={effacerEvents}/>}

      {/* Légende */}
      <div style={{ display:"flex", gap:14, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        {[{type:"tournee",label:"Visite Tournée"},{type:"google",label:"Google Agenda"},{type:"rdv",label:"RDV perso"}].map(({type,label})=>(
          <div key={type} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11.5, color:"#8A93A0" }}>
            <div style={{ width:12, height:12, borderRadius:2, background:TYPE_COLORS[type].bg, borderLeft:`3px solid ${TYPE_COLORS[type].border}` }}/>{label}
          </div>
        ))}
        <div style={{ fontSize:11, color:"#8A93A0", marginLeft:"auto", display:"flex", alignItems:"center", gap:4, opacity:0.7 }}>
          <Clock size={11}/> Glisser pour déplacer · Cliquer pour modifier
        </div>
      </div>

      {/* Grille */}
      <div
        ref={gridRef}
        style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, overflow:"hidden" }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* En-têtes colonnes */}
        <div style={{ display:"grid", gridTemplateColumns:`44px repeat(5,1fr)`, borderBottom:"1px solid #DCD7CB" }}>
          <div style={{ borderRight:"1px solid #DCD7CB" }}/>
          {jours.map((jour,i)=>(
            <div key={i} style={{ padding:"8px 4px", textAlign:"center", borderRight:i<4?"1px solid #DCD7CB":"none", cursor:"pointer" }}
              onClick={()=>setModalRdv({ rdv:{ jour:dateToKey(jour), debut:"09:00", fin:"09:30", type:"rdv" }, isTournee:false })}>
              <div style={{ fontSize:10, color:"#8A93A0", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:2 }}>{JOURS_SEMAINE[i]}</div>
              <div style={{ fontSize:18, fontFamily:"'Oswald',sans-serif", fontWeight:600, width:30, height:30, borderRadius:"50%", margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"center", background:isToday(jour)?"#E8714A":"transparent", color:isToday(jour)?"white":"#1C2630" }}>{jour.getDate()}</div>
            </div>
          ))}
        </div>

        {/* Corps */}
        <div style={{ overflowY:"auto", maxHeight:700 }}>
          <div style={{ display:"grid", gridTemplateColumns:`44px repeat(5,1fr)` }}>
            {/* Heures */}
            <div style={{ borderRight:"1px solid #DCD7CB" }}>
              {heures.map(h=>(
                <div key={h} style={{ height:HAUTEUR_HEURE, borderBottom:"1px solid #F0EDE7", display:"flex", alignItems:"flex-start", padding:"3px 4px 0" }}>
                  <span style={{ fontSize:10, color:"#8A93A0", marginTop:-6 }}>{h}h</span>
                </div>
              ))}
            </div>

            {/* Colonnes jours */}
            {jours.map((jour,colIdx)=>{
              const dateKey = dateToKey(jour);
              const rdvs    = tousLesRdv(dateKey);
              const preview = dropPreview?.jour === dateKey ? dropPreview : null;

              return (
                <div
                  key={colIdx}
                  ref={el => colRefs.current[colIdx] = el}
                  style={{ position:"relative", borderRight:colIdx<4?"1px solid #DCD7CB":"none", height:HAUTEUR_HEURE*heures.length }}
                >
                  {heures.map(h=>(
                    <div key={h} style={{ position:"absolute", left:0, right:0, top:(h-HEURES_DEBUT)*HAUTEUR_HEURE, height:HAUTEUR_HEURE, borderBottom:"1px solid #F0EDE7", cursor:"pointer" }}
                      onClick={()=>setModalRdv({ rdv:{ jour:dateKey, debut:`${String(h).padStart(2,"0")}:00`, fin:`${String(h+1).padStart(2,"0")}:00`, type:"rdv" }, isTournee:false })}/>
                  ))}

                  {preview && (
                    <div className="agenda-drop-preview" style={{
                      top: (timeToMin(preview.debut) - HEURES_DEBUT*60)/60*HAUTEUR_HEURE,
                      height: Math.max((timeToMin(preview.fin)-timeToMin(preview.debut))/60*HAUTEUR_HEURE, 22),
                    }}>
                      <div style={{ fontSize:10, padding:"2px 5px", color:"#E8714A", fontWeight:600 }}>
                        {minToAff(timeToMin(preview.debut))} – {minToAff(timeToMin(preview.fin))}
                      </div>
                    </div>
                  )}

                  {rdvs.map(rdv=>{
                    const startMin = timeToMin(rdv.debut);
                    const endMin   = timeToMin(rdv.fin);
                    const top      = (startMin - HEURES_DEBUT*60)/60*HAUTEUR_HEURE;
                    const height   = Math.max((endMin-startMin)/60*HAUTEUR_HEURE, 22);
                    const c        = TYPE_COLORS[rdv.type] || TYPE_COLORS.rdv;
                    const draggable = rdv.type !== "google";
                    const isDragging = dragInfo?.rdv?.id === rdv.id;

                    return (
                      <div
                        key={rdv.id}
                        draggable={draggable}
                        onDragStart={draggable ? (e)=>handleDragStart(e, rdv, rdv.isTournee) : undefined}
                        onDragEnd={handleDragEnd}
                        onClick={e=>{
                          e.stopPropagation();
                          if (dragInfo) return;
                          if (rdv.type === "google") return;
                          setModalRdv({ rdv, isTournee: rdv.isTournee });
                        }}
                        style={{
                          position:"absolute", left:2, right:2, top, height,
                          background: isDragging ? "transparent" : c.bg,
                          border: isDragging ? `2px dashed ${c.border}` : "none",
                          borderLeft: isDragging ? `2px dashed ${c.border}` : `3px solid ${c.border}`,
                          borderRadius:4, padding:"2px 5px",
                          cursor: draggable ? "grab" : "default",
                          overflow:"hidden", zIndex:2,
                          opacity: isDragging ? 0.4 : 1,
                          transition:"opacity 0.1s",
                        }}
                        onMouseEnter={e=>{ if(draggable && !isDragging) e.currentTarget.style.filter="brightness(0.94)"; }}
                        onMouseLeave={e=>{ e.currentTarget.style.filter=""; }}
                      >
                        <div style={{ fontSize:10.5, fontWeight:600, color:c.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {rdv.titre}
                          {draggable && <span style={{ fontSize:9, opacity:0.5, marginLeft:4 }}>⠿</span>}
                        </div>
                        {height>28 && (
                          <div style={{ fontSize:9.5, color:c.text, opacity:0.8 }}>
                            {minToAff(startMin)} – {minToAff(endMin)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bouton + flottant */}
      <button
        onClick={()=>setModalRdv({ rdv:{ jour:dateToKey(new Date()), debut:"09:00", fin:"09:30", type:"rdv" }, isTournee:false })}
        style={{ position:"fixed", bottom:24, right:24, width:48, height:48, borderRadius:"50%", background:"#E8714A", color:"white", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(232,113,74,0.4)", zIndex:100 }}>
        <Plus size={22}/>
      </button>

      {modalRdv && (
        <ModalRdv
          rdv={modalRdv.rdv}
          isTournee={modalRdv.isTournee}
          onSave={sauvegarderRdv}
          onDelete={supprimerRdv}
          onClose={()=>setModalRdv(null)}
          clients={clients}
        />
      )}
    </div>
  );
}
