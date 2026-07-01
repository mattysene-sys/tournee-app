// src/components/AssistantVocal.jsx
// Bouton flottant micro — commandes vocales pour contacter les clients
// Flux : Ecoute -> Claude API -> Preview message -> Validation -> Envoi SMS/mail

import React, { useState, useRef, useCallback } from "react";
import { Mic, MicOff, X, Send, Phone, Mail, Loader, CheckCircle2, AlertCircle } from "lucide-react";

const CLAUDE_MODEL = "claude-sonnet-4-6";
const SUPABASE_ANON_KEY = "sb_publishable_feR5aPDkEqXgdjxUqg4nHA_Ci-5TfEJ";

// ─── Envoi SMS via Supabase Edge Function (à créer) ou fallback lien tel ───
// Pour l'instant : ouverture de l'app SMS native avec le message pré-rempli
function envoyerSMS(numero, message) {
  const tel = numero.replace(/\s/g, "");
  const url = `sms:${tel}?body=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
  return true;
}

// Envoi mail via mailto
function envoyerMail(email, sujet, message) {
  const url = `mailto:${email}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
  return true;
}

// ─── Appel Claude API pour analyser la commande vocale ───────────────────────
async function analyserCommande(texteVocal, clients, rdvDuJour) {
  const clientsResume = clients.slice(0, 100).map(c => ({
    id: c.id,
    nom: c.etablissement,
    ville: c.ville,
    // Priorité : mobile titulaire > tel1/tel2
    mobile: c.mobile_titulaire || c.tel1 || c.tel2 || null,
    // Priorité : mail titulaire > mail général Excel
    email: c.mail_titulaire || c.email || null,
  }));

  const rdvResume = rdvDuJour.map(r => ({
    nom: r.titre || r.etablissement,
    heure: r.heure,
    mobile: r.mobile || null,
    email: r.email || null,
  }));

  const prompt = `Tu es l'assistant d'un délégué pharmaceutique qui est en tournée terrain.
Il vient de dicter cette commande vocale : "${texteVocal}"

Voici ses RDV du jour : ${JSON.stringify(rdvResume)}
Voici sa base clients (extrait) : ${JSON.stringify(clientsResume)}

Analyse la commande et réponds UNIQUEMENT en JSON avec ce format exact :
{
  "intention": "retard" | "rdv" | "annulation" | "message_libre",
  "clientId": "id du client concerné ou null",
  "clientNom": "nom du client trouvé ou null",
  "mobile": "numéro mobile si disponible ou null",
  "email": "email si disponible ou null",
  "sujet": "sujet du mail (court)",
  "messageSMS": "message SMS court et professionnel (max 160 car)",
  "messageMail": "message mail complet et professionnel",
  "confidence": 0.0 à 1.0,
  "mobileTitulaire": true si le mobile est le mobile_titulaire, false si c'est tel1/tel2,
  "emailTitulaire": true si l'email est le mail_titulaire, false si c'est l'email général,
  "explication": "ce que tu as compris en une phrase"
}

Règles :
- Sois professionnel mais naturel (délégué pharmaceutique -> pharmacien)
- SMS max 160 caractères
- Mail avec formule de politesse
- Si tu ne trouves pas le client, clientId = null et explique
- Langue : français`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error("Erreur Claude API");
  const data = await res.json();
  const texte = data.content?.[0]?.text || "";

  // Parser le JSON de la réponse
  const match = texte.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Réponse Claude invalide");
  return JSON.parse(match[0]);
}

// ─── Composant principal ─────────────────────────────────────────────────────
export default function AssistantVocal({ clients = [], rdvDuJour = [] }) {
  const [etat, setEtat] = useState("ferme"); // ferme | ecoute | analyse | preview | envoi | succes | erreur
  const [texteVocal, setTexteVocal] = useState("");
  const [resultat, setResultat] = useState(null);
  const [erreurMsg, setErreurMsg] = useState("");
  const [canalChoisi, setCanalChoisi] = useState(null); // "sms" | "email"
  const recognitionRef = useRef(null);

  const demarrerEcoute = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setErreurMsg("La reconnaissance vocale n'est pas supportée sur ce navigateur. Utilise Chrome.");
      setEtat("erreur");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setEtat("ecoute");
    recognition.onresult = async (e) => {
      const texte = e.results[0][0].transcript;
      setTexteVocal(texte);
      setEtat("analyse");
      try {
        const res = await analyserCommande(texte, clients, rdvDuJour);
        setResultat(res);
        setEtat("preview");
      } catch (err) {
        setErreurMsg("Erreur lors de l'analyse : " + err.message);
        setEtat("erreur");
      }
    };
    recognition.onerror = (e) => {
      if (e.error === "no-speech") {
        setErreurMsg("Aucune parole détectée. Réessaie.");
      } else {
        setErreurMsg("Erreur micro : " + e.error);
      }
      setEtat("erreur");
    };
    recognition.onend = () => {
      if (etat === "ecoute") setEtat("ferme");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [clients, rdvDuJour, etat]);

  function arreterEcoute() {
    recognitionRef.current?.stop();
    setEtat("ferme");
  }

  function envoyerMessage(canal) {
    if (!resultat) return;
    setCanalChoisi(canal);
    setEtat("envoi");

    let ok = false;
    if (canal === "sms" && resultat.mobile) {
      ok = envoyerSMS(resultat.mobile, resultat.messageSMS);
    } else if (canal === "email" && resultat.email) {
      ok = envoyerMail(resultat.email, resultat.sujet, resultat.messageMail);
    }

    if (ok) {
      setEtat("succes");
      setTimeout(() => reinitialiser(), 3000);
    } else {
      setErreurMsg("Impossible d'envoyer — coordonnées manquantes.");
      setEtat("erreur");
    }
  }

  function reinitialiser() {
    setEtat("ferme");
    setTexteVocal("");
    setResultat(null);
    setErreurMsg("");
    setCanalChoisi(null);
  }

  const s = {
    overlay: {
      position: "fixed", inset: 0, background: "rgba(28,38,48,0.6)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 400, padding: "0 0 100px 0",
    },
    panel: {
      background: "white", borderRadius: "16px 16px 16px 16px",
      padding: 22, width: "calc(100% - 32px)", maxWidth: 480,
      boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
    },
    btn: (bg, color) => ({
      fontFamily: "'Oswald',sans-serif", textTransform: "uppercase",
      letterSpacing: "0.04em", fontSize: 13, padding: "11px 16px",
      borderRadius: 8, border: "none", cursor: "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      gap: 7, background: bg, color: color, flex: 1,
    }),
  };

  return (
    <>
      {/* Bouton flottant micro */}
      <button
        onClick={() => etat === "ferme" ? demarrerEcoute() : reinitialiser()}
        style={{
          position: "fixed", bottom: 24, right: 80, width: 56, height: 56,
          borderRadius: "50%", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: etat === "ecoute" ? "#C75450" : "#1C2630",
          boxShadow: etat === "ecoute"
            ? "0 0 0 8px rgba(199,84,80,0.25), 0 4px 20px rgba(199,84,80,0.4)"
            : "0 4px 16px rgba(0,0,0,0.3)",
          zIndex: 100,
          animation: etat === "ecoute" ? "pulse 1.2s infinite" : "none",
          transition: "all 0.2s ease",
        }}
        title="Assistant vocal"
      >
        {etat === "ecoute" ? <MicOff size={24} color="white"/> : <Mic size={24} color="white"/>}
      </button>

      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(199,84,80,0.4); }
          70% { box-shadow: 0 0 0 14px rgba(199,84,80,0); }
          100% { box-shadow: 0 0 0 0 rgba(199,84,80,0); }
        }
      `}</style>

      {/* Panel modal */}
      {etat !== "ferme" && etat !== "ecoute" && (
        <div style={s.overlay} onClick={reinitialiser}>
          <div style={s.panel} onClick={e => e.stopPropagation()}>

            {/* En-tête */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:14, color:"#1C2630", letterSpacing:"0.04em" }}>
                🎤 Assistant vocal
              </div>
              <button onClick={reinitialiser} style={{ background:"none", border:"none", cursor:"pointer", color:"#8A93A0" }}>
                <X size={18}/>
              </button>
            </div>

            {/* Texte reconnu */}
            {texteVocal && (
              <div style={{ background:"#F5F2EC", borderRadius:8, padding:"10px 12px", marginBottom:14, fontSize:13, color:"#1C2630", fontStyle:"italic" }}>
                "{texteVocal}"
              </div>
            )}

            {/* Analyse en cours */}
            {etat === "analyse" && (
              <div style={{ display:"flex", alignItems:"center", gap:10, color:"#8A93A0", fontSize:13, padding:"8px 0" }}>
                <Loader size={16} style={{ animation:"spin 1s linear infinite" }}/>
                Analyse en cours...
                <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
              </div>
            )}

            {/* Preview du message */}
            {etat === "preview" && resultat && (
              <>
                {/* Explication */}
                <div style={{ fontSize:12.5, color:"#5B8C6E", background:"#DCEAE0", borderRadius:7, padding:"8px 11px", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
                  <CheckCircle2 size={13}/>
                  {resultat.explication}
                </div>

                {/* Client identifié */}
                {resultat.clientNom && (
                  <div style={{ fontSize:13, fontWeight:600, color:"#1C2630", marginBottom:10 }}>
                    📍 {resultat.clientNom}
                    <span style={{ fontSize:11, fontWeight:400, color:"#8A93A0", marginLeft:8 }}>
                      {resultat.mobile ? `📱 ${resultat.mobile}` : ""}
                      {resultat.email ? `  ✉️ ${resultat.email}` : ""}
                    </span>
                    {/* Indicateur si on utilise le contact de fallback */}
                    {!resultat.mobileTitulaire && resultat.mobile && (
                      <div style={{ fontSize:10, color:"#C8962E", marginTop:3 }}>⚠️ Numéro standard (pas de mobile titulaire)</div>
                    )}
                    {!resultat.emailTitulaire && resultat.email && (
                      <div style={{ fontSize:10, color:"#C8962E", marginTop:3 }}>⚠️ Mail général pharmacie (pas de mail titulaire)</div>
                    )}
                  </div>
                )}

                {!resultat.clientNom && (
                  <div style={{ fontSize:12.5, color:"#993C1D", background:"#FBF0E9", borderRadius:7, padding:"8px 11px", marginBottom:12 }}>
                    ⚠️ Client non identifié — vérifie le nom et réessaie
                  </div>
                )}

                {/* Aperçu SMS */}
                {resultat.mobile && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#8A93A0", fontWeight:600, marginBottom:5 }}>
                      📱 SMS ({resultat.messageSMS?.length || 0} car.)
                    </div>
                    <div style={{ background:"#F5F2EC", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#1C2630", lineHeight:1.5 }}>
                      {resultat.messageSMS}
                    </div>
                  </div>
                )}

                {/* Aperçu Mail */}
                {resultat.email && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#8A93A0", fontWeight:600, marginBottom:5 }}>
                      ✉️ Mail — {resultat.sujet}
                    </div>
                    <div style={{ background:"#F5F2EC", borderRadius:8, padding:"10px 12px", fontSize:12.5, color:"#1C2630", lineHeight:1.6, maxHeight:120, overflowY:"auto" }}>
                      {resultat.messageMail}
                    </div>
                  </div>
                )}

                {/* Boutons d'envoi */}
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  {resultat.mobile && (
                    <button style={s.btn("#1C2630", "white")} onClick={() => envoyerMessage("sms")}>
                      <Phone size={14}/> Envoyer SMS
                    </button>
                  )}
                  {resultat.email && (
                    <button style={s.btn("#185FA5", "white")} onClick={() => envoyerMessage("email")}>
                      <Mail size={14}/> Envoyer mail
                    </button>
                  )}
                  {!resultat.mobile && !resultat.email && (
                    <div style={{ fontSize:12.5, color:"#993C1D", padding:"10px 0" }}>
                      Aucun contact disponible pour ce client — ajoute son mobile/mail dans la fiche.
                    </div>
                  )}
                </div>

                {/* Bouton réessayer */}
                <button onClick={demarrerEcoute}
                  style={{ ...s.btn("transparent", "#8A93A0"), border:"1.5px solid #DCD7CB", marginTop:10, width:"100%" }}>
                  <Mic size={13}/> Réessayer
                </button>
              </>
            )}

            {/* Envoi en cours */}
            {etat === "envoi" && (
              <div style={{ display:"flex", alignItems:"center", gap:10, color:"#8A93A0", fontSize:13, padding:"8px 0" }}>
                <Loader size={16} style={{ animation:"spin 1s linear infinite" }}/>
                Ouverture de l'application {canalChoisi === "sms" ? "SMS" : "mail"}...
              </div>
            )}

            {/* Succès */}
            {etat === "succes" && (
              <div style={{ display:"flex", alignItems:"center", gap:10, color:"#27500A", fontSize:13 }}>
                <CheckCircle2 size={18} style={{ color:"#5B8C6E" }}/>
                Message prêt à envoyer dans ton application {canalChoisi === "sms" ? "SMS" : "mail"} !
              </div>
            )}

            {/* Erreur */}
            {etat === "erreur" && (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:9, color:"#8A3530", fontSize:13, background:"#FCEEED", border:"1px solid #C75450", borderRadius:8, padding:"10px 12px", marginBottom:12 }}>
                  <AlertCircle size={15} style={{ flexShrink:0 }}/>
                  {erreurMsg}
                </div>
                <button onClick={demarrerEcoute} style={{ ...s.btn("#E8714A", "white"), width:"100%" }}>
                  <Mic size={13}/> Réessayer
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Indicateur écoute active */}
      {etat === "ecoute" && (
        <div style={{
          position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
          background: "#C75450", color: "white", padding: "10px 20px",
          borderRadius: 999, fontSize: 13, fontWeight: 600, zIndex: 100,
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 4px 20px rgba(199,84,80,0.4)",
        }}>
          <span style={{ width:8, height:8, borderRadius:"50%", background:"white", animation:"pulse 1s infinite" }}/>
          Je t'écoute... Parle maintenant
        </div>
      )}
    </>
  );
}
