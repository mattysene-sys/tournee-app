// src/components/FicheClient.jsx
import React, { useState } from "react";
import { Phone, Mail, X, Save, User, AlertCircle, CheckCircle2 } from "lucide-react";
import { PRESSION_COLOR_HEX as PRESSION_COLOR } from "../settings/segmentation";

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
  const [mobile, setMobile]       = useState(client.mobile_titulaire || "");
  const [mail, setMail]           = useState(client.mail_titulaire   || "");
  const [nomContact, setNomContact] = useState(client.nom_contact    || client.contact || "");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [onglet, setOnglet]       = useState("titulaire"); // "titulaire" | "contact"

  async function handleSave() {
    setSaving(true);
    await onSave(client.id, {
      mobile_titulaire: mobile.trim() || null,
      mail_titulaire:   mail.trim()   || null,
      nom_contact:      nomContact.trim() || null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(28,38,48,0.55)",
        display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }}
      onClick={onClose}
    >
      <div
        style={{ background:"white", borderRadius:12, padding:22,
          maxWidth:440, width:"100%", maxHeight:"90vh", overflowY:"auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* En-tête */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
          <div>
            <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase",
              fontSize:12, color:"#8A93A0", marginBottom:4 }}>Fiche client</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ width:10, height:10, borderRadius:"50%", flexShrink:0,
                background: PRESSION_COLOR[client.pression] || "#DCD7CB" }}/>
              <span style={{ fontFamily:"'Oswald',sans-serif", fontSize:16,
                fontWeight:600, color:"#1C2630" }}>{client.etablissement}</span>
            </div>
            {client.ville && <div style={{ fontSize:12, color:"#8A93A0", marginTop:2 }}>{client.ville} {client.cp ? `· ${client.cp}` : ""}</div>}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#8A93A0", padding:0 }}>
            <X size={18}/>
          </button>
        </div>

        {/* Infos rapides */}
        <div style={{ background:"#F5F2EC", borderRadius:8, padding:"10px 12px", marginBottom:14,
          display:"flex", gap:16, flexWrap:"wrap" }}>
          {[
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

        {/* Contacts standard Excel */}
        {(client.tel1 || client.tel2 || client.email) && (
          <div style={{ marginBottom:14, padding:"10px 12px", background:"#F5F2EC", borderRadius:8 }}>
            <div style={{ ...lbl, marginBottom:8 }}>Contacts standard (Excel)</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {client.tel1 && (
                <a href={`tel:${client.tel1}`} style={{ display:"inline-flex", alignItems:"center", gap:5,
                  padding:"5px 9px", background:"white", border:"1px solid #DCD7CB", borderRadius:6,
                  fontSize:12.5, color:"#1C2630", textDecoration:"none" }}>
                  <Phone size={11}/> {client.tel1}
                </a>
              )}
              {client.tel2 && (
                <a href={`tel:${client.tel2}`} style={{ display:"inline-flex", alignItems:"center", gap:5,
                  padding:"5px 9px", background:"white", border:"1px solid #DCD7CB", borderRadius:6,
                  fontSize:12.5, color:"#1C2630", textDecoration:"none" }}>
                  <Phone size={11}/> {client.tel2}
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} style={{ display:"inline-flex", alignItems:"center", gap:5,
                  padding:"5px 9px", background:"white", border:"1px solid #DCD7CB", borderRadius:6,
                  fontSize:12.5, color:"#1C2630", textDecoration:"none" }}>
                  <Mail size={11}/> {client.email}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Onglets Titulaire / Contact */}
        <div style={{ display:"flex", gap:4, marginBottom:14, background:"#F5F2EC", borderRadius:8, padding:4 }}>
          {[
            { key:"titulaire", label:"👤 Titulaire" },
            { key:"contact",   label:"🙋 Contact référent" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setOnglet(key)}
              style={{ flex:1, padding:"8px 10px", borderRadius:6, border:"none", cursor:"pointer",
                fontFamily:"'Oswald',sans-serif", fontSize:12, textTransform:"uppercase",
                letterSpacing:"0.03em",
                background: onglet === key ? "white" : "transparent",
                color: onglet === key ? "#1C2630" : "#8A93A0",
                boxShadow: onglet === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Onglet Titulaire */}
        {onglet === "titulaire" && (
          <>
            {(!mobile.trim() || !mail.trim()) && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px",
                background:"#FBF0E9", border:"1px solid #E8714A", borderRadius:7,
                marginBottom:12, fontSize:12.5, color:"#993C1D" }}>
                <AlertCircle size={13} style={{ flexShrink:0 }}/>
                {!mobile.trim() && !mail.trim() ? "Mobile et mail titulaire manquants"
                  : !mobile.trim() ? "Mobile titulaire manquant"
                  : "Mail titulaire manquant"}
              </div>
            )}
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>
                📱 Mobile titulaire
                {!mobile.trim() && <span style={{ color:"#C75450", marginLeft:4 }}>●</span>}
              </label>
              <div style={{ display:"flex", gap:8 }}>
                <input style={{ ...inp, flex:1 }} type="tel" inputMode="numeric"
                  placeholder="06 XX XX XX XX" value={mobile}
                  onChange={e => { setSaved(false); setMobile(e.target.value); }}/>
                {mobile.trim() && (
                  <a href={`tel:${mobile}`} style={{ padding:"9px 12px", background:"#DCEAE0",
                    border:"1.5px solid #5B8C6E", borderRadius:6, display:"inline-flex",
                    alignItems:"center", color:"#27500A", textDecoration:"none" }}>
                    <Phone size={14}/>
                  </a>
                )}
              </div>
            </div>
            <div style={{ marginBottom:6 }}>
              <label style={lbl}>
                ✉️ Mail titulaire
                {!mail.trim() && <span style={{ color:"#C75450", marginLeft:4 }}>●</span>}
              </label>
              <div style={{ display:"flex", gap:8 }}>
                <input style={{ ...inp, flex:1 }} type="email"
                  placeholder="titulaire@pharmacie.fr" value={mail}
                  onChange={e => { setSaved(false); setMail(e.target.value); }}/>
                {mail.trim() && (
                  <a href={`mailto:${mail}`} style={{ padding:"9px 12px", background:"#E6F1FB",
                    border:"1.5px solid #185FA5", borderRadius:6, display:"inline-flex",
                    alignItems:"center", color:"#0C447C", textDecoration:"none" }}>
                    <Mail size={14}/>
                  </a>
                )}
              </div>
            </div>
          </>
        )}

        {/* Onglet Contact référent */}
        {onglet === "contact" && (
          <>
            <div style={{ background:"#F5F2EC", borderRadius:8, padding:"10px 12px", marginBottom:14,
              fontSize:12.5, color:"#8A93A0", lineHeight:1.5 }}>
              Le contact référent est la personne avec qui tu interagis au quotidien — pas forcément le titulaire.
            </div>
            <div style={{ marginBottom:6 }}>
              <label style={lbl}>🙋 Nom du contact référent</label>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <User size={14} style={{ color:"#8A93A0", flexShrink:0 }}/>
                <input style={{ ...inp, flex:1 }}
                  placeholder="Ex: Marie, Dr. Dupont..."
                  value={nomContact}
                  onChange={e => { setSaved(false); setNomContact(e.target.value); }}/>
              </div>
            </div>
            {nomContact.trim() && (
              <div style={{ marginTop:10, padding:"8px 12px", background:"#E6F1FB",
                borderRadius:7, fontSize:12.5, color:"#0C447C" }}>
                Contact actuel enregistré : <strong>{client.nom_contact || client.contact || "—"}</strong>
                {nomContact !== (client.nom_contact || client.contact || "") && (
                  <span style={{ color:"#E8714A", marginLeft:6 }}>→ sera mis à jour</span>
                )}
              </div>
            )}
          </>
        )}

        {/* Boutons */}
        <div style={{ display:"flex", gap:8, marginTop:16 }}>
          <button onClick={onClose}
            style={{ ...btn, flex:1, background:"transparent", border:"1.5px solid #DCD7CB", color:"#8A93A0" }}>
            Fermer
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ ...btn, flex:2,
              background: saved ? "#5B8C6E" : saving ? "#DCD7CB" : "#E8714A",
              color: saving ? "#8A93A0" : "white",
              cursor: saving ? "not-allowed" : "pointer" }}>
            {saved ? <><CheckCircle2 size={14}/> Enregistré</>
              : saving ? "Enregistrement..."
              : <><Save size={14}/> Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BadgeContactManquant({ client, onClick }) {
  const mobileMissing = !client.mobile_titulaire;
  const mailMissing   = !client.mail_titulaire;
  if (!mobileMissing && !mailMissing) return null;

  const tooltip = mobileMissing && mailMissing
    ? "Mobile + mail manquants"
    : mobileMissing ? "Mobile manquant" : "Mail manquant";

  return (
    <button onClick={e => { e.stopPropagation(); onClick && onClick(); }} title={tooltip}
      style={{ background:"none", border:"none", cursor:"pointer",
        padding:"2px 4px", display:"inline-flex", alignItems:"center",
        gap:3, color:"#C75450", fontSize:11, fontWeight:600, flexShrink:0 }}>
      <span style={{ width:7, height:7, borderRadius:"50%",
        background:"#C75450", display:"inline-block" }}/>
      {mobileMissing && mailMissing ? "2" : "1"}
    </button>
  );
}
