import React, { useState, useEffect } from "react";
import { Calendar, X, Plus, ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";

// ============================================================
// Constantes
// ============================================================
const HEURES_DEBUT = 8;
const HEURES_FIN = 19;
const HAUTEUR_HEURE = 52; // px par heure
const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

const TYPE_COLORS = {
  tournee: { bg: "#E6F1FB", border: "#185FA5", text: "#0C447C" },
  google:  { bg: "#EAF3DE", border: "#3B6D11", text: "#27500A" },
  rdv:     { bg: "#FAECE7", border: "#993C1D", text: "#712B13" },
};

// ============================================================
// Utilitaires
// ============================================================
function dateToKey(d) {
  return d.toISOString().slice(0, 10);
}

function getLundiDeLaSemaine(offset = 0) {
  const now = new Date();
  const jour = now.getDay(); // 0 = dim
  const diff = jour === 0 ? -6 : 1 - jour;
  const lundi = new Date(now);
  lundi.setDate(now.getDate() + diff + offset * 7);
  lundi.setHours(0, 0, 0, 0);
  return lundi;
}

function getNumeroSemaine(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const jourSemaine = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - jourSemaine);
  const debutAnnee = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - debutAnnee) / 86400000) + 1) / 7);
}

function timeToMinutes(t) {
  const [h, m] = (t || "08:00").split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesToAffichage(min) {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

function isToday(d) {
  const today = new Date();
  return d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ============================================================
// Modal d'ajout / modification de RDV
// ============================================================
function ModalRdv({ rdv, onSave, onDelete, onClose, joursDisponibles }) {
  const [titre, setTitre] = useState(rdv?.titre || "");
  const [type, setType] = useState(rdv?.type || "rdv");
  const [jour, setJour] = useState(rdv?.jour || joursDisponibles[0] || "");
  const [debut, setDebut] = useState(rdv?.debut || "09:00");
  const [fin, setFin] = useState(rdv?.fin || "09:30");
  const [note, setNote] = useState(rdv?.note || "");

  function handleSave() {
    if (!titre.trim() || !jour) return;
    onSave({ id: rdv?.id || uid(), titre: titre.trim(), type, jour, debut, fin, note });
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(28,38,48,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white", borderRadius: 12, padding: 22,
          maxWidth: 400, width: "100%", maxHeight: "90vh", overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontFamily: "'Oswald', sans-serif", textTransform: "uppercase", fontSize: 13, letterSpacing: "0.06em", color: "#8A93A0" }}>
            {rdv ? "Modifier le RDV" : "Nouveau rendez-vous"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A93A0", padding: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Titre */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Titre / Code client</label>
          <input style={inputStyle} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex: Réunion IBSA ou PHARM-0042" autoFocus />
        </div>

        {/* Type */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Type</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { value: "tournee", label: "Visite Tournée" },
              { value: "rdv", label: "RDV pro/perso" },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setType(value)}
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 6, border: "1.5px solid",
                  borderColor: type === value ? TYPE_COLORS[value].border : "#DCD7CB",
                  background: type === value ? TYPE_COLORS[value].bg : "white",
                  color: type === value ? TYPE_COLORS[value].text : "#8A93A0",
                  fontFamily: "'Oswald', sans-serif", fontSize: 12, textTransform: "uppercase",
                  letterSpacing: "0.03em", cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Jour */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Jour</label>
          <input type="date" style={inputStyle} value={jour} onChange={(e) => setJour(e.target.value)} />
        </div>

        {/* Horaires */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Début</label>
            <input type="time" style={inputStyle} value={debut} onChange={(e) => setDebut(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Fin</label>
            <input type="time" style={inputStyle} value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Note (optionnel)</label>
          <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Infos complémentaires..." />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          {rdv && (
            <button
              onClick={() => onDelete(rdv.id)}
              style={{ ...btnStyle, background: "transparent", border: "1.5px solid #C75450", color: "#C75450", flex: "0 0 auto", padding: "10px 14px" }}
            >
              <X size={14} />
            </button>
          )}
          <button onClick={onClose} style={{ ...btnStyle, background: "transparent", border: "1.5px solid #DCD7CB", color: "#8A93A0", flex: 1 }}>
            Annuler
          </button>
          <button onClick={handleSave} style={{ ...btnStyle, background: "#E8714A", color: "white", border: "none", flex: 1 }} disabled={!titre.trim() || !jour}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em",
  color: "#8A93A0", marginBottom: 5, fontWeight: 600,
};
const inputStyle = {
  width: "100%", padding: "9px 11px", border: "1.5px solid #DCD7CB", borderRadius: 6,
  fontSize: 14, fontFamily: "inherit", color: "#1C2630", background: "#F5F2EC",
  boxSizing: "border-box",
};
const btnStyle = {
  fontFamily: "'Oswald', sans-serif", textTransform: "uppercase", letterSpacing: "0.04em",
  fontSize: 13, padding: "10px 16px", borderRadius: 6, cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
};

// ============================================================
// Composant principal AgendaView
// ============================================================
export default function AgendaView({ planning, rdvParJourCalcule, agendaRdvs, setAgendaRdvs }) {
  const [semaineOffset, setSemaineOffset] = useState(0);
  const [modalRdv, setModalRdv] = useState(null); // null | { mode: "new"|"edit", rdv? }

  const lundi = getLundiDeLaSemaine(semaineOffset);
  const jours = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    return d;
  });
  const numSemaine = getNumeroSemaine(lundi);
  const rangeDates = `${lundi.getDate()} – ${jours[4].getDate()} ${lundi.toLocaleString("fr-FR", { month: "long" })} ${lundi.getFullYear()}`;

  // RDV Tournée de la semaine (issus du planning existant)
  function getRdvTournee(dateKey) {
    return (rdvParJourCalcule[dateKey] || []).map((item) => ({
      id: `tournee-${item.client.id}`,
      titre: item.client.etablissement,
      type: "tournee",
      jour: dateKey,
      debut: minutesToHHMM(item.heureArrivee),
      fin: minutesToHHMM(item.fin),
      readOnly: true,
    }));
  }

  // RDV manuels (agenda) du jour
  function getRdvAgenda(dateKey) {
    return (agendaRdvs || []).filter((r) => r.jour === dateKey);
  }

  function tousLesRdvDuJour(dateKey) {
    return [...getRdvTournee(dateKey), ...getRdvAgenda(dateKey)];
  }

  function ouvrirNouveauRdv(jour) {
    setModalRdv({ mode: "new", rdv: { jour: dateToKey(jour), debut: "09:00", fin: "09:30", type: "rdv" } });
  }

  function ouvrirEditionRdv(rdv) {
    if (rdv.readOnly) return;
    setModalRdv({ mode: "edit", rdv });
  }

  function sauvegarderRdv(rdv) {
    setAgendaRdvs((prev) => {
      const filtered = (prev || []).filter((r) => r.id !== rdv.id);
      return [...filtered, rdv];
    });
    setModalRdv(null);
  }

  function supprimerRdv(id) {
    setAgendaRdvs((prev) => (prev || []).filter((r) => r.id !== id));
    setModalRdv(null);
  }

  const heures = Array.from({ length: HEURES_FIN - HEURES_DEBUT }, (_, i) => HEURES_DEBUT + i);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: "#1C2630" }}>
      {/* ---- En-tête navigation ---- */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Oswald', sans-serif", textTransform: "uppercase", fontSize: 18, fontWeight: 600, letterSpacing: "0.02em" }}>
            Semaine {numSemaine}
          </div>
          <div style={{ fontSize: 12, color: "#8A93A0", marginTop: 2 }}>{rangeDates}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setSemaineOffset(0)} style={{ ...btnStyle, background: "transparent", border: "1.5px solid #DCD7CB", color: "#8A93A0", padding: "7px 12px", fontSize: 12 }}>
            Aujourd'hui
          </button>
          <button onClick={() => setSemaineOffset((s) => s - 1)} style={{ ...btnStyle, background: "transparent", border: "1.5px solid #DCD7CB", color: "#1C2630", padding: "7px 10px" }}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setSemaineOffset((s) => s + 1)} style={{ ...btnStyle, background: "transparent", border: "1.5px solid #DCD7CB", color: "#1C2630", padding: "7px 10px" }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ---- Légende ---- */}
      <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { type: "tournee", label: "Visite Tournée" },
          { type: "rdv", label: "RDV pro/perso" },
        ].map(({ type, label }) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#8A93A0" }}>
            <div style={{
              width: 12, height: 12, borderRadius: 2, background: TYPE_COLORS[type].bg,
              borderLeft: `3px solid ${TYPE_COLORS[type].border}`,
            }} />
            {label}
          </div>
        ))}
      </div>

      {/* ---- Grille agenda ---- */}
      <div style={{ background: "white", border: "1px solid #DCD7CB", borderRadius: 10, overflow: "hidden" }}>

        {/* En-têtes jours */}
        <div style={{ display: "grid", gridTemplateColumns: "44px repeat(5, 1fr)", borderBottom: "1px solid #DCD7CB" }}>
          <div style={{ borderRight: "1px solid #DCD7CB" }} />
          {jours.map((jour, i) => (
            <div
              key={i}
              style={{
                padding: "8px 6px", textAlign: "center",
                borderRight: i < 4 ? "1px solid #DCD7CB" : "none",
                cursor: "pointer",
              }}
              onClick={() => ouvrirNouveauRdv(jour)}
              title="Cliquer pour ajouter un RDV"
            >
              <div style={{ fontSize: 10.5, color: "#8A93A0", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>
                {JOURS_SEMAINE[i]}
              </div>
              <div style={{
                fontSize: 19, fontFamily: "'Oswald', sans-serif", fontWeight: 600,
                width: 32, height: 32, borderRadius: "50%", margin: "0 auto",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isToday(jour) ? "#E8714A" : "transparent",
                color: isToday(jour) ? "white" : "#1C2630",
              }}>
                {jour.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Corps grille */}
        <div style={{ overflowY: "auto", maxHeight: 520, position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "44px repeat(5, 1fr)" }}>

            {/* Colonne heures */}
            <div style={{ borderRight: "1px solid #DCD7CB" }}>
              {heures.map((h) => (
                <div key={h} style={{ height: HAUTEUR_HEURE, borderBottom: "1px solid #F0EDE7", display: "flex", alignItems: "flex-start", padding: "3px 4px 0" }}>
                  <span style={{ fontSize: 10, color: "#8A93A0", marginTop: -6 }}>{h}h</span>
                </div>
              ))}
            </div>

            {/* Colonnes jours */}
            {jours.map((jour, colIdx) => {
              const dateKey = dateToKey(jour);
              const rdvsDuJour = tousLesRdvDuJour(dateKey);

              return (
                <div
                  key={colIdx}
                  style={{
                    position: "relative",
                    borderRight: colIdx < 4 ? "1px solid #DCD7CB" : "none",
                    height: HAUTEUR_HEURE * heures.length,
                  }}
                >
                  {/* Lignes de fond */}
                  {heures.map((h) => (
                    <div
                      key={h}
                      style={{
                        position: "absolute", left: 0, right: 0,
                        top: (h - HEURES_DEBUT) * HAUTEUR_HEURE,
                        height: HAUTEUR_HEURE,
                        borderBottom: "1px solid #F0EDE7",
                      }}
                      onClick={() => ouvrirNouveauRdv(jour)}
                    />
                  ))}

                  {/* Événements */}
                  {rdvsDuJour.map((rdv) => {
                    const startMin = timeToMinutes(rdv.debut);
                    const endMin = timeToMinutes(rdv.fin);
                    const top = (startMin - HEURES_DEBUT * 60) / 60 * HAUTEUR_HEURE;
                    const height = Math.max((endMin - startMin) / 60 * HAUTEUR_HEURE, 22);
                    const colors = TYPE_COLORS[rdv.type] || TYPE_COLORS.rdv;

                    return (
                      <div
                        key={rdv.id}
                        onClick={(e) => { e.stopPropagation(); ouvrirEditionRdv(rdv); }}
                        style={{
                          position: "absolute", left: 2, right: 2,
                          top, height,
                          background: colors.bg,
                          borderLeft: `3px solid ${colors.border}`,
                          borderRadius: 4,
                          padding: "2px 5px",
                          cursor: rdv.readOnly ? "default" : "pointer",
                          overflow: "hidden", zIndex: 2,
                          opacity: rdv.readOnly ? 0.9 : 1,
                        }}
                        title={rdv.readOnly ? rdv.titre : "Cliquer pour modifier"}
                      >
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {rdv.titre}
                        </div>
                        {height > 30 && (
                          <div style={{ fontSize: 9.5, color: colors.text, opacity: 0.8 }}>
                            {minutesToAffichage(timeToMinutes(rdv.debut))} – {minutesToAffichage(timeToMinutes(rdv.fin))}
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

      {/* ---- Bouton ajout flottant ---- */}
      <button
        onClick={() => setModalRdv({ mode: "new", rdv: { jour: dateToKey(new Date()), debut: "09:00", fin: "09:30", type: "rdv" } })}
        style={{
          position: "fixed", bottom: 24, right: 24,
          width: 48, height: 48, borderRadius: "50%",
          background: "#E8714A", color: "white", border: "none",
          fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(232,113,74,0.4)", zIndex: 100,
        }}
        title="Ajouter un rendez-vous"
      >
        <Plus size={22} />
      </button>

      {/* ---- Modal ---- */}
      {modalRdv && (
        <ModalRdv
          rdv={modalRdv.rdv}
          onSave={sauvegarderRdv}
          onDelete={supprimerRdv}
          onClose={() => setModalRdv(null)}
          joursDisponibles={jours.map(dateToKey)}
        />
      )}
    </div>
  );
}
