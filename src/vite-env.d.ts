/// <reference types="vite/client" />

// pdfjs ships its worker as an .mjs we load via Vite's `?url` asset import.
declare module '*?url' {
  const src: string
  export default src
}
