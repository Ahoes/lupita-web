// Lupita · conexión con Supabase
// Se sacan de Supabase > Project Settings > API (o "Data API" / "API Keys").
// La clave es la pública ("anon" o "publishable"): se puede ver en la web sin problema,
// porque las reglas de la base de datos solo dejan ver a cada uno lo de su casa.
export const SUPABASE_URL = 'https://aymofpxpmmorfjhdgiws.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_iTISQW-M9rQMBfKN73GpEg_9brdzaCk';
// Clave pública de los avisos push (la privada solo está en Supabase)
export const VAPID_PUBLICA = 'BGKr3qzC9juzPg08Bw_k0WLTNpGEDylVHVcKJEjbI855HIWVMBsyR5Im4j9_381b6ZFCF3QC5shviyfYqhMdgYc';
