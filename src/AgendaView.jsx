import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Calendar, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

const HEURES_DEBUT = 8;
const HEURES_FIN = 19;
const HAUTEUR_HEURE = 56;
const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

const TYPE_COLORS = {
  tournee: { bg: "#E6F1FB", border: "#185FA5", text: "#0C447C" },
  google:  { bg: "#EAF3DE", border: "#3B6D11", text: "#27500A" },
  rdv:     { bg: "#FAECE7", border: "#993C1D", text: "#712B13" },
};

function dateToKey(d) {
  return d.toISOString().slice(0, 10);
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

// Parse iCal text → liste d'événements
function parseIcal(text) {
  const events = [];
  const blocks = text.split("BEGIN:VEVENT");
  blocks.shift();
  for (const block of blocks) {
    try {
      const get = (key) => {
        const m = block.match(new RegExp(`${key}[^:]*:([^\r\n]+)`));
        return m ? m[1].trim() : null;
      };
      const summary = get("SUMMARY") || "RDV";
      const dtstart = get("DTSTART");
      const dtend = get("DTEND");
      if (!dtstart) continue;

      function parseIcalDate(s) {
        if (!s) return null;
        // format 20260615T090000Z ou 20260615T090000 ou 20260615
        const clean = s.replace(/[^0-9T]/g, "");
        if (clean.length === 8) {
          // date seule (journée entière)
          return new Date(
            parseInt(clean.slice(0,4)),
            parseInt(clean.slice(4,6))-1,
            parseInt(clean.slice(6,8))
          );
        }
        const y=parseInt(clean.slice(0,4)), mo=parseInt(clean.slice(4,6))-1;
        const d=parseInt(clean.slice(6,8)), h=parseInt(clean.slice(9,11)||"0");
        const mi=parseInt(clean.slice(11,13)||"0");
        const date = new Date(Date.UTC(y,mo,d,h,mi));
        // convert UTC to local
        return new Date(date.getTime());
      }

      const start = parseIcalDate(dtstart);
      const end = parseIcalDate(dtend);
      if (!start) continue;

      const jour = dateToKey(start);
      const isAllDay = dtstart.length <= 8 || !dtstart.includes("T");
      const debutMin = isAllDay ? 8*60 : start.getHours()*60+start.getMinutes();
      const finMin = end ? (isAllDay ? 18*60 : end.getHours()*60+end.getMinutes()) : debutMin+30;

      events.push({
        id: "gc-"+uid(),
        titre: summary,
        type: "google",
        jour,
        debut: minToHHMM(debutMin),
        fin: minToHHMM(Math.min(finMin, 19*60)),
        readOnly: true,
      });
    } catch(e) { continue; }
  }
  return events;
}

// Modal ajout/modif RDV manuel
function ModalRdv({ rdv, onSave, onDelete, onClose, joursDisponibles }) {
  const [titre, setTitre] = useState(rdv?.titre || "");
  const [type, setType] = useState(rdv?.type || "rdv");
  const [jour, setJour] = useState(rdv?.jour || joursDisponibles[0] || "");
  const [debut, setDebut] = useState(rdv?.debut || "09:00");
  const [fin, setFin] = useState(rdv?.fin || "09:30");

  const lbl = { display:"block", fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#8A93A0", marginBottom:5, fontWeight:600 };
  const inp = { width:"100%", padding:"9px 11px", border:"1.5px solid #DCD7CB", borderRadius:6, fontSize:14, fontFamily:"inherit", color:"#1C2630", background:"#F5F2EC", boxSizing:"border-box" };
  const btn = { fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", letterSpacing:"0.04em", fontSize:13, padding:"10px 16px", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(28,38,48,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }} onClick={onClose}>
      <div style={{ background:"white", borderRadius:12, padding:22, maxWidth:380, width:"100%" }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:13, color:"#8A93A0" }}>{rdv?"Modifier":"Nouveau RDV"}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#8A93A0" }}><X size={18}/></button>
        </div>
        <div style={{ marginBottom:12 }}><label style={lbl}>Titre</label><input style={inp} value={titre} onChange={e=>setTitre(e.target.value)} placeholder="Ex: Réunion IBSA" autoFocus/></div>
        <div style={{ marginBottom:12 }}>
          <label style={lbl}>Type</label>
          <div style={{ display:"flex", gap:6 }}>
            {[{value:"tournee",label:"Visite"},{value:"rdv",label:"RDV perso"}].map(({value,label})=>(
              <button key={value} onClick={()=>setType(value)} style={{ flex:1, padding:"8px", borderRadius:6, border:"1.5px solid", borderColor:type===value?TYPE_COLORS[value].border:"#DCD7CB", background:type===value?TYPE_COLORS[value].bg:"white", color:type===value?TYPE_COLORS[value].text:"#8A93A0", fontFamily:"'Oswald',sans-serif", fontSize:12, textTransform:"uppercase", cursor:"pointer" }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:12 }}><label style={lbl}>Jour</label><input type="date" style={inp} value={jour} onChange={e=>setJour(e.target.value)}/></div>
        <div style={{ display:"flex", gap:10, marginBottom:18 }}>
          <div style={{ flex:1 }}><label style={lbl}>Début</label><input type="time" style={inp} value={debut} onChange={e=>setDebut(e.target.value)}/></div>
          <div style={{ flex:1 }}><label style={lbl}>Fin</label><input type="time" style={inp} value={fin} onChange={e=>setFin(e.target.value)}/></div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {rdv && <button onClick={()=>onDelete(rdv.id)} style={{ ...btn, background:"transparent", border:"1.5px solid #C75450", color:"#C75450", padding:"10px 12px" }}><X size={14}/></button>}
          <button onClick={onClose} style={{ ...btn, flex:1, background:"transparent", border:"1.5px solid #DCD7CB", color:"#8A93A0" }}>Annuler</button>
          <button onClick={()=>{ if(titre.trim()&&jour) onSave({id:rdv?.id||uid(),titre:titre.trim(),type,jour,debut,fin,readOnly:false}); }} style={{ ...btn, flex:1, background:"#E8714A", color:"white", border:"none" }} disabled={!titre.trim()||!jour}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// Panneau de config Google Agenda
function PanneauGoogle({ icalUrl, onSave, googleEvents, onRefresh, syncing, syncError }) {
  const [url, setUrl] = useState(icalUrl || "");
  const lbl = { display:"block", fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#8A93A0", marginBottom:5, fontWeight:600 };
  const inp = { width:"100%", padding:"9px 11px", border:"1.5px solid #DCD7CB", borderRadius:6, fontSize:12, fontFamily:"inherit", color:"#1C2630", background:"#F5F2EC", boxSizing:"border-box", wordBreak:"break-all" };
  const btn = { fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:12, padding:"9px 14px", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, border:"none" };

  return (
    <div style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, padding:16, marginBottom:16 }}>
      <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:13, color:"#8A93A0", marginBottom:12, display:"flex", alignItems:"center", gap:7 }}>
        <Calendar size={14}/> Sync Google Agenda
      </div>

      {!icalUrl ? (
        <>
          <p style={{ fontSize:12.5, color:"#8A93A0", marginBottom:10, lineHeight:1.5 }}>
            Colle ici ton <strong style={{color:"#1C2630"}}>adresse secrète iCal</strong> Google Agenda pour importer tes RDV automatiquement.
          </p>
          <div style={{ marginBottom:10 }}><label style={lbl}>URL iCal secrète</label><input style={inp} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/..."/></div>
          <button onClick={()=>{ if(url.trim()) onSave(url.trim()); }} style={{ ...btn, background:"#E8714A", color:"white", width:"100%", justifyContent:"center" }} disabled={!url.trim()}>
            <CheckCircle2 size={14}/> Connecter mon Google Agenda
          </button>
        </>
      ) : (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
          <div style={{ fontSize:12.5, color:"#5B8C6E" }}>
            <CheckCircle2 size={13} style={{ display:"inline", marginRight:5, verticalAlign:-2 }}/>
            {googleEvents.length} événement{googleEvents.length>1?"s":""} importé{googleEvents.length>1?"s":""}
            {syncError && <span style={{ color:"#C75450", marginLeft:8 }}>· Erreur de sync</span>}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={onRefresh} style={{ ...btn, background:"transparent", border:"1.5px solid #DCD7CB", color:"#1C2630", fontSize:11 }} disabled={syncing}>
              <RefreshCw size={12} style={{ animation:syncing?"spin 1s linear infinite":"none" }}/> {syncing?"...":"Actualiser"}
            </button>
            <button onClick={()=>onSave("")} style={{ ...btn, background:"transparent", border:"1.5px solid #C75450", color:"#C75450", fontSize:11 }}>
              <X size={12}/> Déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Composant principal
export default function AgendaView({ planning, rdvParJourCalcule, agendaRdvs, setAgendaRdvs }) {
  const [semaineOffset, setSemaineOffset] = useState(0);
  const [modalRdv, setModalRdv] = useState(null);
  const [icalUrl, setIcalUrl] = useState(() => { try { return localStorage.getItem("tournee_ical_url") || ""; } catch { return ""; } });
  const [googleEvents, setGoogleEvents] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const lundi = getLundi(semaineOffset);
  const jours = Array.from({length:5},(_,i)=>{ const d=new Date(lundi); d.setDate(lundi.getDate()+i); return d; });
  const numSem = getNumSemaine(lundi);
  const rangeDates = `${lundi.getDate()} – ${jours[4].getDate()} ${lundi.toLocaleString("fr-FR",{month:"long"})} ${lundi.getFullYear()}`;

  // Fetch iCal via proxy CORS
  const fetchIcal = useCallback(async (url) => {
    if (!url) return;
    setSyncing(true);
    setSyncError(false);
    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      const json = await res.json();
      const events = parseIcal(json.contents || "");
      setGoogleEvents(events);
    } catch(e) {
      setSyncError(true);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => { if (icalUrl) fetchIcal(icalUrl); }, [icalUrl, fetchIcal]);

  function saveIcalUrl(url) {
    try { localStorage.setItem("tournee_ical_url", url); } catch {}
    setIcalUrl(url);
    if (!url) setGoogleEvents([]);
  }

  function getRdvTournee(dateKey) {
    return (rdvParJourCalcule[dateKey] || []).map(item => ({
      id: "t-"+item.client.id, titre: item.client.etablissement,
      type: "tournee", jour: dateKey,
      debut: minToHHMM(item.heureArrivee), fin: minToHHMM(item.fin),
      readOnly: true,
    }));
  }

  function tousLesRdv(dateKey) {
    return [
      ...getRdvTournee(dateKey),
      ...googleEvents.filter(e => e.jour === dateKey),
      ...(agendaRdvs || []).filter(e => e.jour === dateKey),
    ];
  }

  function sauvegarderRdv(rdv) {
    setAgendaRdvs(prev => { const f=(prev||[]).filter(r=>r.id!==rdv.id); return [...f,rdv]; });
    setModalRdv(null);
  }

  function supprimerRdv(id) {
    setAgendaRdvs(prev => (prev||[]).filter(r=>r.id!==id));
    setModalRdv(null);
  }

  const heures = Array.from({length:HEURES_FIN-HEURES_DEBUT},(_,i)=>HEURES_DEBUT+i);

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", color:"#1C2630" }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* En-tête */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:18, fontWeight:600 }}>Semaine {numSem}</div>
          <div style={{ fontSize:12, color:"#8A93A0", marginTop:2 }}>{rangeDates}</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <button onClick={()=>setShowConfig(s=>!s)} style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:11, padding:"7px 12px", borderRadius:6, border:"1.5px solid", borderColor:icalUrl?"#5B8C6E":"#DCD7CB", background:icalUrl?"#DCEAE0":"white", color:icalUrl?"#5B8C6E":"#8A93A0", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
            <Calendar size={13}/> {icalUrl ? "Google connecté" : "Connecter Google"}
          </button>
          <button onClick={()=>setSemaineOffset(0)} style={{ fontFamily:"'Oswald',sans-serif", fontSize:11, padding:"7px 12px", borderRadius:6, border:"1.5px solid #DCD7CB", background:"white", color:"#8A93A0", cursor:"pointer" }}>Aujourd'hui</button>
          <button onClick={()=>setSemaineOffset(s=>s-1)} style={{ padding:"7px 10px", borderRadius:6, border:"1.5px solid #DCD7CB", background:"white", cursor:"pointer" }}><ChevronLeft size={16}/></button>
          <button onClick={()=>setSemaineOffset(s=>s+1)} style={{ padding:"7px 10px", borderRadius:6, border:"1.5px solid #DCD7CB", background:"white", cursor:"pointer" }}><ChevronRight size={16}/></button>
        </div>
      </div>

      {/* Panneau Google */}
      {showConfig && (
        <PanneauGoogle icalUrl={icalUrl} onSave={saveIcalUrl} googleEvents={googleEvents} onRefresh={()=>fetchIcal(icalUrl)} syncing={syncing} syncError={syncError}/>
      )}

      {/* Légende */}
      <div style={{ display:"flex", gap:14, marginBottom:12, flexWrap:"wrap" }}>
        {[{type:"tournee",label:"Visite Tournée"},{type:"google",label:"Google Agenda"},{type:"rdv",label:"RDV perso"}].map(({type,label})=>(
          <div key={type} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11.5, color:"#8A93A0" }}>
            <div style={{ width:12, height:12, borderRadius:2, background:TYPE_COLORS[type].bg, borderLeft:`3px solid ${TYPE_COLORS[type].border}` }}/>
            {label}
          </div>
        ))}
      </div>

      {/* Grille */}
      <div style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, overflow:"hidden" }}>
        {/* Jours header */}
        <div style={{ display:"grid", gridTemplateColumns:`44px repeat(5,1fr)`, borderBottom:"1px solid #DCD7CB" }}>
          <div style={{ borderRight:"1px solid #DCD7CB" }}/>
          {jours.map((jour,i)=>(
            <div key={i} style={{ padding:"8px 4px", textAlign:"center", borderRight:i<4?"1px solid #DCD7CB":"none", cursor:"pointer" }} onClick={()=>setModalRdv({rdv:{jour:dateToKey(jour),debut:"09:00",fin:"09:30",type:"rdv"}})}>
              <div style={{ fontSize:10, color:"#8A93A0", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:2 }}>{JOURS_SEMAINE[i]}</div>
              <div style={{ fontSize:18, fontFamily:"'Oswald',sans-serif", fontWeight:600, width:30, height:30, borderRadius:"50%", margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"center", background:isToday(jour)?"#E8714A":"transparent", color:isToday(jour)?"white":"#1C2630" }}>{jour.getDate()}</div>
            </div>
          ))}
        </div>

        {/* Corps */}
        <div style={{ overflowY:"auto", maxHeight:500 }}>
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
              const rdvs = tousLesRdv(dateKey);
              return (
                <div key={colIdx} style={{ position:"relative", borderRight:colIdx<4?"1px solid #DCD7CB":"none", height:HAUTEUR_HEURE*heures.length }}>
                  {heures.map(h=>(
                    <div key={h} style={{ position:"absolute", left:0, right:0, top:(h-HEURES_DEBUT)*HAUTEUR_HEURE, height:HAUTEUR_HEURE, borderBottom:"1px solid #F0EDE7" }} onClick={()=>setModalRdv({rdv:{jour:dateKey,debut:`${String(h).padStart(2,"0")}:00`,fin:`${String(h).padStart(2,"0")}:30`,type:"rdv"}})}/>
                  ))}
                  {rdvs.map(rdv=>{
                    const startMin = timeToMin(rdv.debut);
                    const endMin = timeToMin(rdv.fin);
                    const top = (startMin - HEURES_DEBUT*60)/60*HAUTEUR_HEURE;
                    const height = Math.max((endMin-startMin)/60*HAUTEUR_HEURE, 20);
                    const c = TYPE_COLORS[rdv.type]||TYPE_COLORS.rdv;
                    return (
                      <div key={rdv.id} onClick={e=>{ e.stopPropagation(); if(!rdv.readOnly) setModalRdv({rdv}); }}
                        style={{ position:"absolute", left:2, right:2, top, height, background:c.bg, borderLeft:`3px solid ${c.border}`, borderRadius:4, padding:"2px 5px", cursor:rdv.readOnly?"default":"pointer", overflow:"hidden", zIndex:2 }}>
                        <div style={{ fontSize:10.5, fontWeight:600, color:c.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{rdv.titre}</div>
                        {height>28 && <div style={{ fontSize:9.5, color:c.text, opacity:0.8 }}>{minToAff(timeToMin(rdv.debut))} – {minToAff(timeToMin(rdv.fin))}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bouton + */}
      <button onClick={()=>setModalRdv({rdv:{jour:dateToKey(new Date()),debut:"09:00",fin:"09:30",type:"rdv"}})}
        style={{ position:"fixed", bottom:24, right:24, width:48, height:48, borderRadius:"50%", background:"#E8714A", color:"white", border:"none", fontSize:24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(232,113,74,0.4)", zIndex:100 }}>
        <Plus size={22}/>
      </button>

      {modalRdv && (
        <ModalRdv rdv={modalRdv.rdv} onSave={sauvegarderRdv} onDelete={supprimerRdv} onClose={()=>setModalRdv(null)} joursDisponibles={jours.map(dateToKey)}/>
      )}
    </div>
  );
}
