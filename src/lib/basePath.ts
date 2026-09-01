// Prefijo de ruta del sitio. En GitHub Pages el sitio vive en /copasanfra/, así
// que las imágenes de /public deben llevar este prefijo. En local/Netlify (raíz)
// queda vacío. Se define en el build (NEXT_PUBLIC_BASE_PATH).
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Devuelve la ruta de un asset de /public con el prefijo correcto.
export const asset = (path: string) => `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
