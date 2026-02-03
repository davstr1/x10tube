// Configuration injectée par esbuild au moment du build
// __STYA_BASE_URL__ est remplacé par la vraie valeur

declare const __STYA_BASE_URL__: string;

export const config = {
  baseUrl: __STYA_BASE_URL__,
};
