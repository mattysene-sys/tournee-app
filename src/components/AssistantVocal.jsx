// src/components/AssistantVocal.jsx
import React, { useState, useRef, useCallback } from "react";
import { Mic, MicOff, X, Send, Phone, Mail, Loader, CheckCircle2, AlertCircle } from "lucide-react";

const CLAUDE_MODEL = "claude-sonnet-4-6";
const SUPABASE_URL = "https://baeglgpwriyvcerybbwj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_feR5aPDkEqXgdjxUqg4nHA_Ci-5TfEJ";
const CLAUDE_PROXY_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`;

function envoyerSMS(numero, message) {
  const tel = numero.replace(/\s/g, "");
  window.open(`sms:${tel}?body=${encodeURIComponent(message)}`, "_blank");
  return true;
}

function envoyerMail(email, sujet, message) {
  window.open(`mailto:${email}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(message)}`, "_blank");
  return true;
}

async function analyserCommande(texteVocal, clients, rdvDuJour) {
  // Envoyer TOUS les clients (pas de slice) avec infos de contact complètes
  const clientsResume = clients.map(c => ({
    id: c.id,
    nom: c.etablissement,
    ville: c.ville,
    mobile: c.mobile_titulaire || c.tel1 || c.tel2 || null,
    email: c.mail_titulaire || c.email || null,
    contact: c.nom_contact || c.contact || null,
  }));

  const rdvResume = rdvDuJour.map(r => ({
    nom: r.titre || r.etablissement || r.nom,
    heure: r.heure || r.debut,
    mobile: r.mobile || r.mobile_titulaire || r.tel1 || null,
    email: r.email || r.mail_titulaire || null,
    contact: r.nom_contact || r.contact || null,
  }));

  const prompt = `Tu es l'assistant d'un délégué pharmaceutique en tournée terrain.
Commande vocale : "${texteVocal}"

RDV du jour : ${JSON.stringify(rdvResume)}
Base clients complète (${clientsResume.length} clients) : ${JSON.stringify(clientsResume)}

IMPORTANT : Cherche le client de façon flexible — ignore les articles (de, la, le, les, du), la casse, les accents. "pharmacie de la source" = "PHARMACIE DE LA SOURCE". Cherche aussi par ville si le nom est ambigu.

Réponds UNIQUEMENT en JSON :
{
  "intention": "retard" | "rdv" | "annulation" | "message_libre",
  "clientId": "id ou null",
  "clientNom": "nom trouvé ou null",
  "mobile": "numéro ou null",
  "email": "email ou null",
  "contact": "nom du contact référent ou null",
  "sujet": "sujet mail court",
  "messageSMS": "SMS max 160 car, professionnel",
  "messageMail": "mail complet avec formule de politesse",
  "confidence": 0.0-1.0,
  "mobileTitulaire": true/false,
  "emailTitulaire": true/false,
  "explication": "ce que tu as compris"
}`;

  const res = await fetch(CLAUDE_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Erreur proxy (${res.status}) : ${errBody.slice(0, 150)}`);
  }
  const data = await res.json();
  const texte = data.content?.[0]?.text || "";
  const match = texte.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Réponse Claude invalide");
  return JSON.parse(match[0]);
}

export default function AssistantVocal({ clients = [], rdvDuJour = [] }) {
  const [etat, setEtat] = useState("ferme");
  const [texteVocal, setTexteVocal] = useState("");
  const [resultat, setResultat] = useState(null);
  const [erreurMsg, setErreurMsg] = useState("");
  const [canalChoisi, setCanalChoisi] = useState(null);
  const recognitionRef = useRef(null);

  const demarrerEcoute = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setErreurMsg("La reconnaissance vocale n'est pas supportée. Utilise Chrome.");
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
      if (e.error === "not-allowed") setErreurMsg("Microphone non autorisé. Autorise le micro dans Chrome.");
      else if (e.error === "no-speech") setErreurMsg("Aucune parole détectée. Réessaie.");
      else if (e.error === "aborted") { setEtat("ferme"); return; }
      else setErreurMsg("Erreur micro : " + e.error);
      setEtat("erreur");
    };
    recognition.onend = () => { if (etat === "ecoute") setEtat("ferme"); };
    recognitionRef.current = recognition;
    recognition.start();
  }, [clients, rdvDuJour, etat]);

  function arreterEcoute() { recognitionRef.current?.stop(); setEtat("ferme"); }

  function envoyerMessage(canal) {
    if (!resultat) return;
    setCanalChoisi(canal);
    setEtat("envoi");
    let ok = false;
    if (canal === "sms" && resultat.mobile) ok = envoyerSMS(resultat.mobile, resultat.messageSMS);
    else if (canal === "email" && resultat.email) ok = envoyerMail(resultat.email, resultat.sujet, resultat.messageMail);
    if (ok) { setEtat("succes"); setTimeout(() => reinitialiser(), 3000); }
    else { setErreurMsg("Coordonnées manquantes."); setEtat("erreur"); }
  }

  function reinitialiser() {
    setEtat("ferme"); setTexteVocal(""); setResultat(null); setErreurMsg(""); setCanalChoisi(null);
  }

  const s = {
    overlay: { position:"fixed", inset:0, background:"rgba(28,38,48,0.6)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:400, padding:"0 0 100px 0" },
    panel: { background:"white", borderRadius:"16px", padding:22, width:"calc(100% - 32px)", maxWidth:480, boxShadow:"0 -8px 40px rgba(0,0,0,0.2)" },
    btn: (bg, color) => ({ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", letterSpacing:"0.04em", fontSize:13, padding:"11px 16px", borderRadius:8, border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7, background:bg, color, flex:1 }),
  };

  return (
    <>
      <button onClick={() => etat === "ferme" ? demarrerEcoute() : reinitialiser()}
        style={{ position:"fixed", bottom:24, right:80, width:56, height:56, borderRadius:"50%", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", background: etat === "ecoute" ? "#C75450" : "#1C2630", boxShadow: etat === "ecoute" ? "0 0 0 8px rgba(199,84,80,0.25)" : "0 4px 16px rgba(0,0,0,0.3)", zIndex:100, transition:"all 0.2s ease" }}
        title="Assistant vocal">
        {etat === "ecoute" ? <MicOff size={24} color="white"/> : <Mic size={24} color="white"/>}
      </button>

      <style>{`@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(199,84,80,0.4); } 70% { box-shadow: 0 0 0 14px rgba(199,84,80,0); } 100% { box-shadow: 0 0 0 0 rgba(199,84,80,0); } } @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>

      {etat !== "ferme" && etat !== "ecoute" && (
        <div style={s.overlay} onClick={reinitialiser}>
          <div style={s.panel} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:14, color:"#1C2630" }}>🎤 Assistant vocal</div>
              <button onClick={reinitialiser} style={{ background:"none", border:"none", cursor:"pointer", color:"#8A93A0" }}><X size={18}/></button>
            </div>

            {texteVocal && (
              <div style={{ background:"#F5F2EC", borderRadius:8, padding:"10px 12px", marginBottom:14, fontSize:13, color:"#1C2630", fontStyle:"italic" }}>
                "{texteVocal}"
              </div>
            )}

            {etat === "analyse" && (
              <div style={{ display:"flex", alignItems:"center", gap:10, color:"#8A93A0", fontSize:13 }}>
                <Loader size={16} style={{ animation:"spin 1s linear infinite" }}/> Analyse en cours...
              </div>
            )}

            {etat === "preview" && resultat && (
              <>
                <div style={{ fontSize:12.5, color:"#5B8C6E", background:"#DCEAE0", borderRadius:7, padding:"8px 11px", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
                  <CheckCircle2 size={13}/> {resultat.explication}
                </div>

                {resultat.clientNom ? (
                  <div style={{ fontSize:13, fontWeight:600, color:"#1C2630", marginBottom:10 }}>
                    📍 {resultat.clientNom}
                    {resultat.contact && <span style={{ fontSize:11, fontWeight:400, color:"#8A93A0", marginLeft:6 }}>· {resultat.contact}</span>}
                    <div style={{ fontSize:11, fontWeight:400, color:"#8A93A0", marginTop:2 }}>
                      {resultat.mobile ? `📱 ${resultat.mobile}` : ""}
                      {resultat.email ? `  ✉️ ${resultat.email}` : ""}
                    </div>
                    {!resultat.mobileTitulaire && resultat.mobile && (
                      <div style={{ fontSize:10, color:"#C8962E", marginTop:2 }}>⚠️ Numéro standard (pas de mobile titulaire)</div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize:12.5, color:"#993C1D", background:"#FBF0E9", borderRadius:7, padding:"8px 11px", marginBottom:12 }}>
                    ⚠️ Client non identifié — vérifie le nom et réessaie
                  </div>
                )}

                {resultat.mobile && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#8A93A0", fontWeight:600, marginBottom:5 }}>
                      📱 SMS ({resultat.messageSMS?.length || 0} car.)
                    </div>
                    <div style={{ background:"#F5F2EC", borderRadius:8, padding:"10px 12px", fontSize:13, lineHeight:1.5 }}>
                      {resultat.messageSMS}
                    </div>
                  </div>
                )}

                {resultat.email && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#8A93A0", fontWeight:600, marginBottom:5 }}>
                      ✉️ Mail — {resultat.sujet}
                    </div>
                    <div style={{ background:"#F5F2EC", borderRadius:8, padding:"10px 12px", fontSize:12.5, lineHeight:1.6, maxHeight:120, overflowY:"auto" }}>
                      {resultat.messageMail}
                    </div>
                  </div>
                )}

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
                    <div style={{ fontSize:12.5, color:"#993C1D" }}>
                      Aucun contact — ajoute mobile/mail dans la fiche client.
                    </div>
                  )}
                </div>

                <button onClick={demarrerEcoute}
                  style={{ ...s.btn("transparent", "#8A93A0"), border:"1.5px solid #DCD7CB", marginTop:10, width:"100%" }}>
                  <Mic size={13}/> Réessayer
                </button>
              </>
            )}

            {etat === "envoi" && (
              <div style={{ display:"flex", alignItems:"center", gap:10, color:"#8A93A0", fontSize:13 }}>
                <Loader size={16} style={{ animation:"spin 1s linear infinite" }}/>
                Ouverture de l'application {canalChoisi === "sms" ? "SMS" : "mail"}...
              </div>
            )}

            {etat === "succes" && (
              <div style={{ display:"flex", alignItems:"center", gap:10, color:"#27500A", fontSize:13 }}>
                <CheckCircle2 size={18} style={{ color:"#5B8C6E" }}/>
                Message prêt dans ton app {canalChoisi === "sms" ? "SMS" : "mail"} !
              </div>
            )}

            {etat === "erreur" && (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:9, color:"#8A3530", fontSize:13, background:"#FCEEED", border:"1px solid #C75450", borderRadius:8, padding:"10px 12px", marginBottom:12 }}>
                  <AlertCircle size={15} style={{ flexShrink:0 }}/> {erreurMsg}
                </div>
                <button onClick={demarrerEcoute} style={{ ...s.btn("#E8714A", "white"), width:"100%" }}>
                  <Mic size={13}/> Réessayer
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {etat === "ecoute" && (
        <div style={{ position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)", background:"#C75450", color:"white", padding:"10px 20px", borderRadius:999, fontSize:13, fontWeight:600, zIndex:100, display:"flex", alignItems:"center", gap:8, boxShadow:"0 4px 20px rgba(199,84,80,0.4)" }}>
          <span style={{ width:8, height:8, borderRadius:"50%", background:"white", animation:"pulse 1s infinite" }}/>
          Je t'écoute... Parle maintenant
        </div>
      )}
    </>
  );
}
