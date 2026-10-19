/* NVM – Einstellungen für die Online-Bestenliste (Supabase)
 * Project URL und anon public key aus Supabase: Project Settings → API.
 * Der anon-Schlüssel ist für den Browser gedacht; die Datenbank erlaubt damit nur Lesen und neue Einträge.
 * Leer gelassen, läuft NVM ohne Bestenliste. */
window.NVM_CONFIG = window.NVM_CONFIG || {
  supabaseUrl: '',
  supabaseKey: ''
};
