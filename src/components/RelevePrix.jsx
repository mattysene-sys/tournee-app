// src/components/RelevePrix.jsx
// Module d'extraction de prix depuis photos de rayons
// Utilise Claude API via claude-proxy Edge Function

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Camera, X, CheckCircle2, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Trash2, History } from "lucide-react";

const SUPABASE_URL = "https://baeglgpwriyvcerybbwj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_feR5aPDkEqXgdjxUqg4nHA_Ci-5TfEJ";
const CLAUDE_PROXY_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`;

const PRODUITS_SUIVIS = [
  { nom: "Flector Tissugel 1%", conditionnements: ["x5", "x10"] },
  { nom: "Flector Effigel gel 1%", conditionnements: ["50g", "100g"] },
  { nom: "Chondrosulf 800mg", conditionnements: ["30 comprimés", "90 comprimés"] },
  { nom: "Chondrosulf 400mg", conditionnements: ["84 gélules"] },
  { nom: "Flect'Expert Patch Froid", conditionnements: ["x5"] },
  { nom: "Flect'Expert Patch Chaud", conditionnements: ["x5"] },
  { nom: "Flect'Expert Baume Chauffant", conditionnements: ["50g"] },
];

const CONFIANCE_COLOR = {
  haute: { bg: "#DCEAE0", color: "#27500A", label: "✓ Fiable" },
  moyenne: { bg: "#FBF0DA", color: "#7A5C00", label: "⚠ À vérifier" },
  faible: { bg: "#FCEEED", color: "#8A3530", label: "✗ Incertain" },
};

async function extrairePrix(imageBase64, mimeType, pharmacieNom) {
  const prompt = `Tu es un assistant spécialisé dans la lecture de prix sur des rayons de pharmacie.

Analyse cette photo de rayon et extrait UNIQUEMENT les prix des produits suivants :
${PRODUITS_SUIVIS.map(p => `- ${p.nom} (conditionnements : ${p.conditionnements.join(", ")})`).join("\n")}

Pour chaque produit visible, retourne un objet JSON avec :
- produit : nom exact du produit (parmi la liste ci-dessus)
- conditionnement : le conditionnement visible (ex: "x5", "100g", "30 comprimés")
- prix : prix en euros (nombre décimal, ex: 15.50) ou null si illisible
- confiance : "haute" si étiquette nette et prix clair, "moyenne" si légère ambiguïté, "faible" si doute important
- a_verifier : true si le prix nécessite une vérification sur place
- notes : remarque courte si nécessaire (ex: "étiquette partiellement cachée"), sinon null

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte autour :
[{"produit":"...","conditionnement":"...","prix":0.00,"confiance":"haute","a_verifier":false,"notes":null}]

Si aucun produit de la liste n'est visible, retourne un tableau vide : []`;

  const res = await fetch(CLAUDE_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: imageBase64 }
          },
          { type: "text", text: prompt }
        ]
      }]
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erreur proxy (${res.status}) : ${err.slice(0, 100)}`);
  }

  const data = await res.json();
  const texte = data.content?.[0]?.text || "[]";
  const match = texte.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

async function sauvegarderReleves(releves, pharmacie, codeTournee) {
  const rows = releves.map(r => ({
    code_tournee: codeTournee,
    pharmacie_id: pharmacie?.id || null,
    pharmacie_nom: pharmacie?.etablissement || "Pharmacie inconnue",
    date: new Date().toISOString().slice(0, 10),
    produit: r.produit,
    conditionnement: r.conditionnement,
    prix: r.prix,
    confiance: r.confiance,
    a_verifier: r.a_verifier,
    notes: r.notes,
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/releves_prix`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  return res.ok;
}

async function chargerHistorique(codeTournee, pharmacieId) {
  let url = `${SUPABASE_URL}/rest/v1/releves_prix?code_tournee=eq.${codeTournee}&order=created_at.desc&limit=50`;
  if (pharmacieId) url += `&pharmacie_id=eq.${pharmacieId}`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return [];
  return await res.json();
}

async function supprimerReleve(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/releves_prix?id=eq.${id}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  return res.ok;
}

// ─── Composant principal ─────────────────────────────────────────────────────
export default function RelevePrix({ clients = [], codeTournee }) {
  const [onglet, setOnglet] = useState("nouveau"); // "nouveau" | "historique"
  const [pharmacieChoisie, setPharmacieChoisie] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [image, setImage] = useState(null); // { base64, mimeType, preview }
  const [etat, setEtat] = useState("idle"); // idle | analyse | succes | erreur
  const [resultats, setResultats] = useState([]);
  const [erreurMsg, setErreurMsg] = useState("");
  const [sauvegarde, setSauvegarde] = useState(false);
  const [historique, setHistorique] = useState([]);
  const [loadingHistorique, setLoadingHistorique] = useState(false);
  const [filtrePharmacieHisto, setFiltrePharmacieHisto] = useState(null);
  const fileInputRef = useRef(null);

  const suggestions = recherche.trim().length >= 2
    ? clients.filter(c =>
        c.etablissement.toLowerCase().includes(recherche.toLowerCase()) ||
        (c.ville || "").toLowerCase().includes(recherche.toLowerCase())
      ).slice(0, 6)
    : [];

  function choisirPharmacie(c) {
    setPharmacieChoisie(c);
    setRecherche(c.etablissement);
    setShowSuggestions(false);
  }

  function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      setImage({ base64, mimeType, preview: dataUrl });
      setResultats([]);
      setEtat("idle");
      setSauvegarde(false);
    };
    reader.readAsDataURL(file);
  }

  async function analyser() {
    if (!image) return;
    setEtat("analyse");
    setErreurMsg("");
    try {
      const res = await extrairePrix(image.base64, image.mimeType, pharmacieChoisie?.etablissement || "");
      setResultats(res);
      setEtat("succes");
    } catch (err) {
      setErreurMsg(err.message);
      setEtat("erreur");
    }
  }

  async function sauvegarder() {
    if (!resultats.length || !pharmacieChoisie) return;
    const ok = await sauvegarderReleves(resultats, pharmacieChoisie, codeTournee);
    if (ok) {
      setSauvegarde(true);
      // Recharger historique
      chargerHisto();
    }
  }

  async function chargerHisto(pharmacieId) {
    setLoadingHistorique(true);
    const data = await chargerHistorique(codeTournee, pharmacieId || filtrePharmacieHisto?.id);
    setHistorique(data);
    setLoadingHistorique(false);
  }

  useEffect(() => {
    if (onglet === "historique") chargerHisto();
  }, [onglet]);

  const lbl = { display:"block", fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", color:"#8A93A0", marginBottom:5, fontWeight:600 };
  const inp = { width:"100%", padding:"9px 11px", border:"1.5px solid #DCD7CB", borderRadius:6, fontSize:14, fontFamily:"inherit", color:"#1C2630", background:"#F5F2EC", boxSizing:"border-box" };
  const btnBase = { fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", letterSpacing:"0.04em", fontSize:13, padding:"10px 16px", borderRadius:6, border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7 };

  // Grouper historique par date+pharmacie
  const historiqueGroupe = historique.reduce((acc, r) => {
    const key = `${r.date}|${r.pharmacie_nom}`;
    if (!acc[key]) acc[key] = { date: r.date, pharmacie_nom: r.pharmacie_nom, items: [] };
    acc[key].items.push(r);
    return acc;
  }, {});

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", color:"#1C2630" }}>

      {/* Onglets */}
      <div style={{ display:"flex", gap:4, background:"#1C2630", padding:4, borderRadius:8, marginBottom:20, width:"fit-content" }}>
        {[
          { key:"nouveau", label:"📸 Nouveau relevé" },
          { key:"historique", label:"📊 Historique" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setOnglet(key)}
            style={{ ...btnBase, background: onglet===key ? "#E8714A" : "transparent", color: onglet===key ? "white" : "#8A93A0", padding:"8px 14px", fontSize:12.5 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ─── NOUVEAU RELEVÉ ─── */}
      {onglet === "nouveau" && (
        <div style={{ display:"grid", gridTemplateColumns:"380px 1fr", gap:22, maxWidth:1100 }}>

          {/* Colonne gauche */}
          <div>
            {/* Choix pharmacie */}
            <div style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, padding:18, marginBottom:16 }}>
              <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:13, color:"#8A93A0", marginBottom:12, display:"flex", alignItems:"center", gap:7 }}>
                📍 Pharmacie
              </div>
              <div style={{ position:"relative" }}>
                {pharmacieChoisie ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 11px", background:"#E6F1FB", border:"1.5px solid #185FA5", borderRadius:6 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{pharmacieChoisie.etablissement}</div>
                      <div style={{ fontSize:11, color:"#8A93A0" }}>{pharmacieChoisie.ville} · {pharmacieChoisie.ciblage}</div>
                    </div>
                    <button onClick={() => { setPharmacieChoisie(null); setRecherche(""); setResultats([]); setEtat("idle"); setSauvegarde(false); }}
                      style={{ background:"none", border:"none", cursor:"pointer", color:"#8A93A0" }}><X size={14}/></button>
                  </div>
                ) : (
                  <>
                    <input style={inp} placeholder="Rechercher une pharmacie..." value={recherche}
                      onChange={e => { setRecherche(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)} autoFocus/>
                    {showSuggestions && suggestions.length > 0 && (
                      <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"white", border:"1.5px solid #DCD7CB", borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", zIndex:300, overflow:"hidden" }}>
                        {suggestions.map(c => (
                          <div key={c.id} onClick={() => choisirPharmacie(c)}
                            style={{ display:"flex", alignItems:"center", gap:9, padding:"9px 12px", cursor:"pointer", borderBottom:"1px solid #F0EDE7" }}
                            onMouseEnter={e => e.currentTarget.style.background="#F5F2EC"}
                            onMouseLeave={e => e.currentTarget.style.background="white"}>
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:600, fontSize:13 }}>{c.etablissement}</div>
                              <div style={{ fontSize:11, color:"#8A93A0" }}>{c.ville} · {c.ciblage}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Photo */}
            <div style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, padding:18, marginBottom:16 }}>
              <div style={{ fontFamily:"'Oswald',sans-serif", textTransform:"uppercase", fontSize:13, color:"#8A93A0", marginBottom:12, display:"flex", alignItems:"center", gap:7 }}>
                📸 Photo du rayon
              </div>

              {!image ? (
                <div onClick={() => fileInputRef.current?.click()}
                  style={{ border:"2.5px dashed #DCD7CB", borderRadius:10, padding:"40px 20px", textAlign:"center", cursor:"pointer", background:"#FAFAF8" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor="#E8714A"}
                  onMouseLeave={e => e.currentTarget.style.borderColor="#DCD7CB"}>
                  <Camera size={32} style={{ opacity:0.3, marginBottom:10 }}/>
                  <div style={{ fontWeight:600, marginBottom:4 }}>Prendre ou importer une photo</div>
                  <div style={{ fontSize:12, color:"#8A93A0" }}>JPG, PNG — photo du rayon face aux étiquettes</div>
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={handleImage}/>
                </div>
              ) : (
                <div>
                  <img src={image.preview} alt="Rayon" style={{ width:"100%", borderRadius:8, marginBottom:10, maxHeight:280, objectFit:"cover" }}/>
                  <button onClick={() => { setImage(null); setResultats([]); setEtat("idle"); setSauvegarde(false); }}
                    style={{ ...btnBase, background:"transparent", border:"1.5px solid #DCD7CB", color:"#8A93A0", width:"100%", fontSize:12 }}>
                    <X size={13}/> Changer la photo
                  </button>
                </div>
              )}
            </div>

            {/* Bouton analyser */}
            <button onClick={analyser} disabled={!image || etat==="analyse" || !pharmacieChoisie}
              style={{ ...btnBase, width:"100%", padding:14,
                background: (!image || !pharmacieChoisie || etat==="analyse") ? "#DCD7CB" : "#E8714A",
                color: (!image || !pharmacieChoisie || etat==="analyse") ? "#8A93A0" : "white" }}>
              {etat === "analyse"
                ? <><RefreshCw size={15} style={{ animation:"spin 1s linear infinite" }}/> Analyse en cours...</>
                : <><Camera size={15}/> Analyser les prix</>}
            </button>
            {!pharmacieChoisie && <div style={{ fontSize:11.5, color:"#8A93A0", marginTop:6, textAlign:"center" }}>Sélectionne d'abord une pharmacie</div>}

            <style>{`@keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }`}</style>
          </div>

          {/* Colonne droite — Résultats */}
          <div>
            {etat === "idle" && !resultats.length && (
              <div style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, padding:40, textAlign:"center", color:"#8A93A0" }}>
                <Camera size={40} style={{ opacity:0.2, marginBottom:12 }}/>
                <div style={{ fontWeight:600, marginBottom:6 }}>Prends une photo du rayon</div>
                <div style={{ fontSize:13 }}>Claude extraira automatiquement les prix des produits suivis</div>
                <div style={{ marginTop:20, display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center" }}>
                  {PRODUITS_SUIVIS.map(p => (
                    <span key={p.nom} style={{ fontSize:11, background:"#F5F2EC", border:"1px solid #DCD7CB", borderRadius:999, padding:"3px 9px", color:"#8A93A0" }}>
                      {p.nom}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {etat === "erreur" && (
              <div style={{ background:"#FCEEED", border:"1px solid #C75450", borderRadius:10, padding:16, display:"flex", alignItems:"center", gap:10, color:"#8A3530" }}>
                <AlertCircle size={18} style={{ flexShrink:0 }}/>
                <div>{erreurMsg}</div>
              </div>
            )}

            {etat === "succes" && (
              <div>
                {/* En-tête résultats */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
                  <div>
                    <div style={{ fontFamily:"'Oswald',sans-serif", fontSize:16, fontWeight:600 }}>
                      {resultats.length} produit{resultats.length > 1 ? "s" : ""} détecté{resultats.length > 1 ? "s" : ""}
                    </div>
                    <div style={{ fontSize:12, color:"#8A93A0" }}>{pharmacieChoisie?.etablissement} · {new Date().toLocaleDateString("fr-FR")}</div>
                  </div>
                  {!sauvegarde ? (
                    <button onClick={sauvegarder} disabled={!resultats.length}
                      style={{ ...btnBase, background:"#5B8C6E", color:"white", fontSize:12 }}>
                      <CheckCircle2 size={14}/> Enregistrer dans l'historique
                    </button>
                  ) : (
                    <div style={{ display:"flex", alignItems:"center", gap:6, color:"#27500A", fontSize:13, background:"#DCEAE0", borderRadius:7, padding:"8px 12px" }}>
                      <CheckCircle2 size={14}/> Enregistré !
                    </div>
                  )}
                </div>

                {resultats.length === 0 && (
                  <div style={{ background:"#FBF0E9", border:"1px solid #E8714A", borderRadius:10, padding:16, color:"#993C1D", fontSize:13 }}>
                    ⚠️ Aucun produit suivi détecté sur cette photo. Essaie avec une photo plus rapprochée ou mieux cadrée face aux étiquettes.
                  </div>
                )}

                {resultats.map((r, i) => {
                  const conf = CONFIANCE_COLOR[r.confiance] || CONFIANCE_COLOR.moyenne;
                  return (
                    <div key={i} style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, padding:16, marginBottom:10 }}>
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:14, color:"#1C2630", marginBottom:2 }}>{r.produit}</div>
                          {r.conditionnement && <div style={{ fontSize:12, color:"#8A93A0", marginBottom:6 }}>{r.conditionnement}</div>}
                          {r.notes && <div style={{ fontSize:12, color:"#C8962E", background:"#FBF0DA", borderRadius:5, padding:"4px 8px", marginTop:4 }}>ℹ️ {r.notes}</div>}
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontFamily:"'Oswald',sans-serif", fontSize:22, fontWeight:700, color: r.prix ? "#1C2630" : "#8A93A0" }}>
                            {r.prix ? `${r.prix.toFixed(2)} €` : "—"}
                          </div>
                          <div style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:999, background:conf.bg, color:conf.color, marginTop:4 }}>
                            {conf.label}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── HISTORIQUE ─── */}
      {onglet === "historique" && (
        <div style={{ maxWidth:800 }}>
          {/* Filtre pharmacie */}
          <div style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, padding:16, marginBottom:16 }}>
            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              <span style={{ fontSize:12, color:"#8A93A0", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>Filtrer :</span>
              <select style={{ padding:"7px 10px", borderRadius:6, border:"1.5px solid #DCD7CB", fontSize:13, fontFamily:"inherit", background:"#F5F2EC", color:"#1C2630" }}
                onChange={e => {
                  const c = clients.find(x => x.id === e.target.value);
                  setFiltrePharmacieHisto(c || null);
                  chargerHisto(c?.id);
                }}>
                <option value="">Toutes les pharmacies</option>
                {[...new Set(historique.map(r => r.pharmacie_nom))].map(nom => (
                  <option key={nom} value={clients.find(c => c.etablissement === nom)?.id || nom}>{nom}</option>
                ))}
              </select>
              <button onClick={() => chargerHisto()} style={{ ...btnBase, background:"#F5F2EC", border:"1px solid #DCD7CB", color:"#8A93A0", padding:"7px 12px", fontSize:12 }}>
                <RefreshCw size={12}/> Actualiser
              </button>
            </div>
          </div>

          {loadingHistorique && (
            <div style={{ textAlign:"center", padding:30, color:"#8A93A0" }}>
              <RefreshCw size={20} style={{ animation:"spin 1s linear infinite", marginBottom:8 }}/><br/>Chargement...
            </div>
          )}

          {!loadingHistorique && historique.length === 0 && (
            <div style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, padding:40, textAlign:"center", color:"#8A93A0" }}>
              <History size={32} style={{ opacity:0.2, marginBottom:12 }}/>
              <div>Aucun relevé enregistré pour l'instant</div>
            </div>
          )}

          {Object.values(historiqueGroupe).map(groupe => (
            <div key={`${groupe.date}|${groupe.pharmacie_nom}`} style={{ background:"white", border:"1px solid #DCD7CB", borderRadius:10, marginBottom:12, overflow:"hidden" }}>
              <div style={{ background:"#1C2630", color:"white", padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontFamily:"'Oswald',sans-serif", fontSize:14, fontWeight:600 }}>{groupe.pharmacie_nom}</div>
                  <div style={{ fontSize:11, opacity:0.7 }}>{new Date(groupe.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}</div>
                </div>
                <div style={{ fontSize:12, background:"rgba(255,255,255,0.15)", borderRadius:999, padding:"3px 9px" }}>
                  {groupe.items.length} produit{groupe.items.length > 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ padding:"8px 16px" }}>
                {groupe.items.map(r => {
                  const conf = CONFIANCE_COLOR[r.confiance] || CONFIANCE_COLOR.moyenne;
                  return (
                    <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px dashed #DCD7CB" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{r.produit}</div>
                        {r.conditionnement && <div style={{ fontSize:11, color:"#8A93A0" }}>{r.conditionnement}</div>}
                        {r.notes && <div style={{ fontSize:11, color:"#C8962E" }}>ℹ️ {r.notes}</div>}
                      </div>
                      <div style={{ fontFamily:"'Oswald',sans-serif", fontSize:17, fontWeight:700, color: r.prix ? "#1C2630" : "#8A93A0", minWidth:70, textAlign:"right" }}>
                        {r.prix ? `${Number(r.prix).toFixed(2)} €` : "—"}
                      </div>
                      <div style={{ fontSize:10, fontWeight:600, padding:"2px 7px", borderRadius:999, background:conf.bg, color:conf.color, flexShrink:0 }}>
                        {conf.label}
                      </div>
                      <button onClick={async () => { if (window.confirm("Supprimer ce relevé ?")) { await supprimerReleve(r.id); chargerHisto(); } }}
                        style={{ background:"none", border:"none", cursor:"pointer", color:"#C75450", padding:4, flexShrink:0 }}>
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
