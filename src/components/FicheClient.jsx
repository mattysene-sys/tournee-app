// src/components/FicheClient.jsx
import React, { useState } from "react";
import { Phone, Mail, X, Save, User, MapPin, AlertCircle, CheckCircle2 } from "lucide-react";

const PRESSION_COLOR = { Rouge: "#C75450", Orange: "#E8714A", Vert: "#5B8C6E" };

const lbl = {
  display: "block", fontSize: 11, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "#8A93A0", marginBottom: 5, fontWeight: 600,
};
const inp = {
  width: "100%", padding: "9px 11px", border: "1.5px solid #DCD7CB",
  borderRadius: 6, fontSize: 14, fontFamily: "inherit", color: "#1C2630",
  background: "#F5F2EC", boxSizing: "border-box",
};
const btn = {
  fontFamily: "'Oswald',sans-serif", textTransform: "uppercase",
  letterSpacing: "0.04em", fontSize: 13, padding: "10px 16px",
  borderRadius: 6, cursor: "pointer", display: "inline-flex",
  alignItems: "center", justifyContent: "center", gap: 6, border: "none",
};

export default function FicheClient({ client, onSave, onClose }) {
  const [mobile, setMobile]   = useState(client.mobile_titulaire || "");
  const [mail, setMail]       = useState(client.mail_titulaire   || "");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

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

  const contactComplet = mobile.trim() && mail.trim();

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(28,38,48,0.55)",
        display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }}
      onClick={onClose}
    >
      <div
        style={{ background:"white", borderRadius:12, padding:22,
          maxWidth:420, width:"100%", maxHeight:"90vh", overflowY:"auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* En-tête */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase",
              fontSize:13, color:"#8A93A0", marginBottom:4 }}>
              Fiche client
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ width:10, height:10, borderRadius:"50%", flexShrink:0,
                background: PRESSION_COLOR[client.pression] || "#DCD7CB" }}/>
              <span style={{ fontFamily:"'Oswald',sans-serif", fontSize:17,
                fontWeight:600, color:"#1C2630" }}>
                {client.etablissement}
              </span>
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:"none", border:"none", cursor:"pointer", color:"#8A93A0", padding:0 }}>
            <X size={18}/>
          </button>
        </div>

        {/* Infos lecture seule */}
        <div style={{ background:"#F5F2EC", borderRadius:8, padding:"10px 12px",
          marginBottom:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[
            { label:"Ville", value: client.ville },
            { label:"CP",    value: client.cp },
            { label:"Ciblage", value: client.ciblage },
            { label:"Pression", value: client.pression },
            { label:"UGA",   value: client.uga },
            { label:"Groupement", value: client.groupement },
          ].map(({ label, value }) =>
            value ? (
              <div key={label}>
                <div style={{ fontSize:10, color:"#8A93A0", textTransform:"uppercase",
                  letterSpacing:"0.05em", fontWeight:600 }}>{label}</div>
                <div style={{ fontSize:13, color:"#1C2630", fontWeight:500 }}>{value}</div>
              </div>
            ) : null
          )}
        </div>

        {/* Téléphones existants (depuis Excel) */}
        {(client.tel1 || client.tel2) && (
          <div style={{ marginBottom:12 }}>
            <div style={lbl}>Tél. standard (Excel)</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {client.tel1 && (
                <a href={`tel:${client.tel1}`}
                  style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px",
                    background:"#F5F2EC", border:"1px solid #DCD7CB", borderRadius:6,
                    fontSize:13, color:"#1C2630", textDecoration:"none" }}>
                  <Phone size={12}/> {client.tel1}
                </a>
              )}
              {client.tel2 && (
                <a href={`tel:${client.tel2}`}
                  style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px",
                    background:"#F5F2EC", border:"1px solid #DCD7CB", borderRadius:6,
                    fontSize:13, color:"#1C2630", textDecoration:"none" }}>
                  <Phone size={12}/> {client.tel2}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Email existant (depuis Excel) */}
        {client.email && (
          <div style={{ marginBottom:12 }}>
            <div style={lbl}>Mail (Excel)</div>
            <a href={`mailto:${client.email}`}
              style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px",
                background:"#F5F2EC", border:"1px solid #DCD7CB", borderRadius:6,
                fontSize:13, color:"#1C2630", textDecoration:"none" }}>
              <Mail size={12}/> {client.email}
            </a>
          </div>
        )}

        {/* Séparateur */}
        <div style={{ borderTop:"2px solid #F0EDE7", margin:"14px 0",
          display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ background:"white", padding:"0 8px", fontSize:11,
            color:"#8A93A0", textTransform:"uppercase", letterSpacing:"0.06em",
            marginTop:-10, fontWeight:600 }}>
            Contact direct titulaire
          </span>
        </div>

        {/* Indicateur complétude */}
        {!contactComplet && (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px",
            background:"#FBF0E9", border:"1px solid #E8714A", borderRadius:7,
            marginBottom:12, fontSize:12.5, color:"#993C1D" }}>
            <AlertCircle size={14} style={{ flexShrink:0 }}/>
            <span>
              {!mobile.trim() && !mail.trim()
                ? "Mobile et mail titulaire manquants"
                : !mobile.trim()
                ? "Mobile titulaire manquant"
                : "Mail titulaire manquant"}
            </span>
          </div>
        )}

        {/* Champ Mobile */}
        <div style={{ marginBottom:12 }}>
          <label style={lbl}>
            📱 Mobile titulaire
            {!mobile.trim() && <span style={{ color:"#C75450", marginLeft:4 }}>●</span>}
          </label>
          <div style={{ display:"flex", gap:8 }}>
            <input
              style={{ ...inp, flex:1 }}
              type="tel"
              inputMode="numeric"
              placeholder="06 XX XX XX XX"
              value={mobile}
              onChange={e => { setSaved(false); setMobile(e.target.value); }}
            />
            {mobile.trim() && (
              <a href={`tel:${mobile}`}
                style={{ padding:"9px 12px", background:"#DCEAE0", border:"1.5px solid #5B8C6E",
                  borderRadius:6, display:"inline-flex", alignItems:"center", color:"#27500A",
                  textDecoration:"none" }}>
                <Phone size={14}/>
              </a>
            )}
          </div>
        </div>

        {/* Champ Mail */}
        <div style={{ marginBottom:18 }}>
          <label style={lbl}>
            ✉️ Mail titulaire
            {!mail.trim() && <span style={{ color:"#C75450", marginLeft:4 }}>●</span>}
          </label>
          <div style={{ display:"flex", gap:8 }}>
            <input
              style={{ ...inp, flex:1 }}
              type="email"
              placeholder="titulaire@pharmacie.fr"
              value={mail}
              onChange={e => { setSaved(false); setMail(e.target.value); }}
            />
            {mail.trim() && (
              <a href={`mailto:${mail}`}
                style={{ padding:"9px 12px", background:"#E6F1FB", border:"1.5px solid #185FA5",
                  borderRadius:6, display:"inline-flex", alignItems:"center", color:"#0C447C",
                  textDecoration:"none" }}>
                <Mail size={14}/>
              </a>
            )}
          </div>
        </div>

        {/* Boutons */}
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onClose}
            style={{ ...btn, flex:1, background:"transparent",
              border:"1.5px solid #DCD7CB", color:"#8A93A0" }}>
            Fermer
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ ...btn, flex:2,
              background: saved ? "#5B8C6E" : saving ? "#DCD7CB" : "#E8714A",
              color: saving ? "#8A93A0" : "white",
              cursor: saving ? "not-allowed" : "pointer" }}>
            {saved
              ? <><CheckCircle2 size={14}/> Enregistré</>
              : saving
              ? "Enregistrement..."
              : <><Save size={14}/> Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Petit badge indicateur à placer dans les listes.
 * Affiche un point rouge si mobile OU mail manquant.
 */
export function BadgeContactManquant({ client, onClick }) {
  const mobileMissing = !client.mobile_titulaire;
  const mailMissing   = !client.mail_titulaire;
  if (!mobileMissing && !mailMissing) return null;

  const tooltip = mobileMissing && mailMissing
    ? "Mobile + mail manquants"
    : mobileMissing ? "Mobile manquant" : "Mail manquant";

  return (
    <button
      onClick={e => { e.stopPropagation(); onClick && onClick(); }}
      title={tooltip}
      style={{ background:"none", border:"none", cursor:"pointer",
        padding:"2px 4px", display:"inline-flex", alignItems:"center",
        gap:3, color:"#C75450", fontSize:11, fontWeight:600, flexShrink:0 }}
    >
      <span style={{ width:7, height:7, borderRadius:"50%",
        background:"#C75450", display:"inline-block" }}/>
      {mobileMissing && mailMissing ? "2" : "1"}
    </button>
  );
}
