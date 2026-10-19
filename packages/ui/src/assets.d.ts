/** A stylesheet's text, for tests that load the real CSS into a simulated page. */
declare module '*.css?raw' {
  const text: string;
  export default text;
}
