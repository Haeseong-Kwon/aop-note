/// <reference types="vite/client" />

declare module 'path-browserify' {
  import path from 'path'
  export const posix: typeof path.posix
  export default path
}
