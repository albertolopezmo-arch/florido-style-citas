# Florido Style · Reservas

Web de reservas para GitHub Pages.

## Activación

1. Crea un proyecto gratuito en Supabase.
2. Abre **SQL Editor**, pega el contenido de `supabase.sql` y ejecútalo una vez.
3. La URL y la clave pública de Supabase ya están configuradas en `config.js`.
4. En **Settings → Pages**, selecciona **GitHub Actions** como origen.

La clave incluida es la clave pública `publishable`, diseñada por Supabase para utilizarse en aplicaciones web. No incluyas nunca una clave `secret` o `service_role`.
