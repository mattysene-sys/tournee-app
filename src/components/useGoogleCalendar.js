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
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (response) => {
            if (response.error) { reject(new Error(response.error)); }
            else { accessToken = response.access_token; setIsReady(true); resolve(); }
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

  function buildEvent({ pharmacie, date, heure = '09:00', duree = 30, notes = '' }) {
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
    return {
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
  }

  const createEvent = useCallback(async ({ pharmacie, date, heure = '09:00', duree = 30, notes = '' }) => {
    if (!accessToken) throw new Error('Non autorisé. Connecte Google Agenda d\'abord.');
    const event = buildEvent({ pharmacie, date, heure, duree, notes });
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      const err = await response.json();
      if (err.error?.code === 401) { accessToken = null; setIsReady(false); throw new Error('Session expirée. Reconnecte Google Agenda.'); }
      throw new Error(err.error?.message || 'Erreur API Google Calendar');
    }
    return await response.json();
  }, []);

  const updateEvent = useCallback(async ({ eventId, pharmacie, date, heure = '09:00', duree = 30, notes = '' }) => {
    if (!accessToken) throw new Error('Non autorisé.');
    const event = buildEvent({ pharmacie, date, heure, duree, notes });
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      const err = await response.json();
      if (err.error?.code === 401) { accessToken = null; setIsReady(false); throw new Error('Session expirée.'); }
      throw new Error(err.error?.message || 'Erreur mise à jour Google Calendar');
    }
    return await response.json();
  }, []);

  const deleteEvent = useCallback(async (eventId) => {
    if (!accessToken) throw new Error('Non autorisé.');
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 410) {
      const err = await response.json().catch(() => ({}));
      if (err.error?.code === 401) { accessToken = null; setIsReady(false); throw new Error('Session expirée.'); }
      throw new Error(err.error?.message || 'Erreur suppression Google Calendar');
    }
    return true;
  }, []);

  return { isReady, isLoading, error, authorize, createEvent, updateEvent, deleteEvent };
}

function getCouleurCiblage(ciblage) {
  if (!ciblage) return '1';
  const c = ciblage.toUpperCase();
  if (c.includes('COMPTE CLE') || c.includes('PLATINIUM')) return '11';
  if (c.includes('GOLD')) return '5';
  if (c.includes('SILVER')) return '7';
  if (c.includes('BRONZE') || c.includes('PROSPECTS')) return '8';
  return '1';
}
