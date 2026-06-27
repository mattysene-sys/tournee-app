// src/hooks/useGoogleCalendar.js
import { useState, useCallback } from 'react';

const CLIENT_ID = '185834811620-ai8nof64ohu3792boete33h42i4skr3a.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

let tokenClient = null;
let accessToken = null;

export function useGoogleCalendar() {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Charge le script Google Identity Services si pas encore fait
  const loadGoogleScript = useCallback(() => {
    return new Promise((resolve) => {
      if (window.google?.accounts) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = resolve;
      document.body.appendChild(script);
    });
  }, []);

  // Initialise le client OAuth et demande l'autorisation
  const authorize = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loadGoogleScript();

      await new Promise((resolve, reject) => {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              accessToken = response.access_token;
              setIsReady(true);
              resolve();
            }
          },
        });
        tokenClient.requestAccessToken({ prompt: 'consent' });
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [loadGoogleScript]);

  // Crée un événement dans Google Agenda
  const createEvent = useCallback(async ({ pharmacie, date, heure = '09:00', duree = 30, notes = '' }) => {
    if (!accessToken) {
      throw new Error('Non autorisé. Clique sur "Connecter Google Agenda" d\'abord.');
    }

    const [annee, mois, jour] = date.split('-');
    const [h, m] = heure.split(':');
    const debut = new Date(annee, mois - 1, jour, h, m);
    const fin = new Date(debut.getTime() + duree * 60000);

    const toISO = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    };

    const event = {
      summary: `Visite ${pharmacie.nom || pharmacie.etablissement}`,
      location: [pharmacie.adresse, pharmacie.ville, pharmacie.cp].filter(Boolean).join(', '),
      description: [
        pharmacie.contact ? `Contact : ${pharmacie.contact}` : '',
        pharmacie.tel1 ? `Tél : ${pharmacie.tel1}` : '',
        pharmacie.email ? `Email : ${pharmacie.email}` : '',
        pharmacie.ciblage ? `Ciblage : ${pharmacie.ciblage}` : '',
        pharmacie.groupement ? `Groupement : ${pharmacie.groupement}` : '',
        notes ? `Notes : ${notes}` : '',
      ].filter(Boolean).join('\n'),
      start: { dateTime: toISO(debut), timeZone: 'Europe/Paris' },
      end:   { dateTime: toISO(fin),   timeZone: 'Europe/Paris' },
      colorId: getCouleurCiblage(pharmacie.ciblage),
    };

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      // Token expiré → on redemande
      if (err.error?.code === 401) {
        accessToken = null;
        setIsReady(false);
        throw new Error('Session expirée. Reconnecte Google Agenda.');
      }
      throw new Error(err.error?.message || 'Erreur API Google Calendar');
    }

    return await response.json();
  }, []);

  return { isReady, isLoading, error, authorize, createEvent };
}

// Couleur selon le ciblage IBSA
function getCouleurCiblage(ciblage) {
  if (!ciblage) return '1';
  const c = ciblage.toUpperCase();
  if (c.includes('COMPTE CLE') || c.includes('PLATINIUM')) return '11'; // rouge tomate
  if (c.includes('GOLD'))       return '5';  // banane jaune
  if (c.includes('SILVER'))     return '7';  // bleu sarcelle
  if (c.includes('BRONZE') || c.includes('PROSPECTS')) return '8'; // graphite
  return '1'; // bleu par défaut
}
