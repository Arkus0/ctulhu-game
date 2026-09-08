/**
 * Importacion de ficheros como texto plano (`?raw`), que es como Vite deja
 * leer datos que no son modulos. Se usa para cotejar el manifiesto de arte
 * desde las pruebas sin depender de los tipos de Node.
 */
declare module '*?raw' {
  const content: string
  export default content
}

/**
 * Lectura de la hoja de estilos desde las pruebas. Vite convierte un `?raw` de
 * CSS en un modulo procesado y llega vacio, asi que hay que leerla del disco, y
 * el proyecto no depende de los tipos de Node para nada mas que esto.
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
}
