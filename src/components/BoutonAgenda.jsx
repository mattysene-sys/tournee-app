// src/components/BoutonAgenda.jsx
import React, { useState } from 'react';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';

/**
 * Bouton à placer sur une fiche pharmacie.
 *
 * Props :
 *   pharmacie  – objet client (mêmes champs que ta base : nom, etablissement,
 *                adresse, ville, cp, tel1, email, contact, ciblage, groupement)
 *   date       – string 'YYYY-MM-DD'  (optionnel, défaut = aujourd'hui)
 *   heure      – string 'HH:MM'       (optionnel, défaut = '09:00')
 *   duree      – nombre de minutes    (optionnel, défaut = 30)
 */
export default function BoutonAgenda({ pharmacie, date, heure = '09:00', duree = 30 }) {
  const { isReady, isLoading, error, authorize, createEvent } = useGoogleCalendar();
  const [statut, setStatut] = useState(null); // null | 'ok' | 'erreur'
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(date || new Date().toISOString().split('T')[0]);
  const [selectedHeure, setSelectedHeure] = useState(heure);
  const [selectedDuree, setSelectedDuree] = useState(duree);
  const [notes, setNotes] = useState('');

  const handleClick = async () => {
    if (!isReady) {
      await authorize();
      return;
    }
    setShowModal(true);
  };

  const handleConfirm = async () => {
    setShowModal(false);
    setStatut(null);
    try {
      const event = await createEvent({
        pharmacie,
        date: selectedDate,
        heure: selectedHeure,
        duree: selectedDuree,
        notes,
      });
      setStatut('ok');
      setMessage(`RDV ajouté ✓`);
      // Lien direct vers l'événement
      if (event.htmlLink) {
        window.open(event.htmlLink, '_blank');
      }
    } catch (err) {
      setStatut('erreur');
      setMessage(err.message);
    }
  };

  return (
    <>
      {/* Bouton principal */}
      <button
        onClick={handleClick}
        disabled={isLoading}
        style={styles.bouton(isReady, isLoading)}
        title="Ajouter un RDV dans Google Agenda"
      >
        {isLoading ? '⏳' : '📅'}{' '}
        {isLoading
          ? 'Connexion...'
          : isReady
          ? 'Ajouter au Calendrier'
          : 'Connecter Google Agenda'}
      </button>

      {/* Feedback statut */}
      {statut === 'ok' && (
        <span style={styles.feedback('#16a34a')}>{message}</span>
      )}
      {statut === 'erreur' && (
        <span style={styles.feedback('#dc2626')}>{message}</span>
      )}
      {error && (
        <span style={styles.feedback('#dc2626')}>Erreur : {error}</span>
      )}

      {/* Modal de saisie du RDV */}
      {showModal && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitre}>
              📅 Planifier une visite
            </h3>
            <p style={styles.modalSousTitre}>
              {pharmacie.etablissement || pharmacie.nom}
            </p>

            <label style={styles.label}>Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={styles.input}
            />

            <label style={styles.label}>Heure</label>
            <input
              type="time"
              value={selectedHeure}
              onChange={(e) => setSelectedHeure(e.target.value)}
              style={styles.input}
            />

            <label style={styles.label}>Durée (minutes)</label>
            <select
              value={selectedDuree}
              onChange={(e) => setSelectedDuree(Number(e.target.value))}
              style={styles.input}
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>1h</option>
            </select>

            <label style={styles.label}>Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Objectifs, produits à présenter..."
              style={{ ...styles.input, height: '70px', resize: 'vertical' }}
            />

            <div style={styles.modalBoutons}>
              <button onClick={() => setShowModal(false)} style={styles.btnAnnuler}>
                Annuler
              </button>
              <button onClick={handleConfirm} style={styles.btnConfirmer}>
                Ajouter au calendrier
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  bouton: (isReady, isLoading) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '8px',
    border: 'none',
    cursor: isLoading ? 'wait' : 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    backgroundColor: isReady ? '#1a73e8' : '#f1f3f4',
    color: isReady ? '#fff' : '#444',
    transition: 'all 0.2s',
    opacity: isLoading ? 0.7 : 1,
  }),
  feedback: (couleur) => ({
    display: 'inline-block',
    marginLeft: '8px',
    fontSize: '12px',
    color: couleur,
    fontWeight: '500',
  }),
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '24px',
    width: '320px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  modalTitre: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalSousTitre: {
    margin: '0 0 8px',
    fontSize: '13px',
    color: '#666',
    fontWeight: '500',
  },
  label: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#555',
    marginBottom: '2px',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '4px',
  },
  modalBoutons: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  btnAnnuler: {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    background: '#f5f5f5',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px',
  },
  btnConfirmer: {
    flex: 2,
    padding: '10px',
    borderRadius: '8px',
    border: 'none',
    background: '#1a73e8',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px',
  },
};
