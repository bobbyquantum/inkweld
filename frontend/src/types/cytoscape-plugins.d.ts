/**
 * Type declarations for Cytoscape.js layout plugins that do not
 * ship their own TypeScript definitions.
 */

declare module 'cytoscape-fcose' {
  import cytoscape from 'cytoscape';
  const fcose: cytoscape.Ext;
  export default fcose;
}

declare module 'cytoscape-dagre' {
  import cytoscape from 'cytoscape';
  const dagre: cytoscape.Ext;
  export default dagre;
}
