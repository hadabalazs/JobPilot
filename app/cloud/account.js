export const SUPABASE_URL = 'https://ljgkuuhhnivdnfejitjj.supabase.co';
export const PUBLISHABLE_KEY = 'sb_publishable_RFwffQpGdR-yXDh9_1BfiA_aQZs0gMJ';
export const account = globalThis.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { storageKey: 'jobpilot-auth-v1', persistSession: true, autoRefreshToken: true,
    detectSessionInUrl: true, flowType: 'implicit' }
});
export const LOGIN_REDIRECT = 'https://jobpilotgcc.netlify.app/';
// Enable only after the exact redirect is allowlisted and verified end-to-end.
export const EMAIL_LINK_ENABLED = false;
