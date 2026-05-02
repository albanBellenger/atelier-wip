/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  readonly VITE_ATELIER_ENV?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
