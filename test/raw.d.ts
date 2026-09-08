/**
 * Importacion de ficheros como texto plano (`?raw`), que es como Vite deja
 * leer datos que no son modulos. Se usa para cotejar el manifiesto de arte
 * desde las pruebas sin depender de los tipos de Node.
 */
declare module '*?raw' {
  const content: string
  export default content
}
