// Lightweight profile persistence + retry queue for offline saves
// Stores `cached_profile:<userId>` and `pending_profile_updates` in localStorage

import { userAPI } from './api';

const PENDING_KEY = 'pending_profile_updates';

export function saveLocalProfile(userId, profile) {
  if (!userId) return;
  try {
    localStorage.setItem(`cached_profile:${userId}`, JSON.stringify(profile));
  } catch (e) {
    console.error('saveLocalProfile failed', e);
  }
}

export function getLocalProfile(userId) {
  if (!userId) return null;
  try {
    const v = localStorage.getItem(`cached_profile:${userId}`);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

export function addPendingUpdate(userId, payload) {
  if (!userId) return;
  try {
    const all = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    all[userId] = Object.assign({}, all[userId] || {}, payload);
    localStorage.setItem(PENDING_KEY, JSON.stringify(all));
  } catch (e) { console.error('addPendingUpdate failed', e); }
}

export function removePendingUpdate(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    if (all[userId]) delete all[userId];
    localStorage.setItem(PENDING_KEY, JSON.stringify(all));
  } catch (e) { console.error('removePendingUpdate failed', e); }
}

export async function retryPendingUpdates() {
  try {
    const all = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    const keys = Object.keys(all || {});
    for (const uid of keys) {
      try {
        const payload = all[uid];
        // attempt to PATCH via API
        const resp = await userAPI.updateMe(payload);
        if (resp && resp.data) {
          // success -> remove pending and cache the returned profile
          removePendingUpdate(uid);
          saveLocalProfile(uid, resp.data);
        }
      } catch (e) {
        // keep pending for next retry
        console.warn('retryPendingUpdates: update failed for', uid, e?.message || e);
      }
    }
  } catch (e) {
    console.error('retryPendingUpdates failed', e);
  }
}

export function getPendingForUser(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    return all[userId] || null;
  } catch (e) { return null; }
}

export default {
  saveLocalProfile, getLocalProfile, addPendingUpdate, removePendingUpdate, retryPendingUpdates, getPendingForUser
};
