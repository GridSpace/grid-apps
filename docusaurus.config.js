

module.exports = {
  url: 'https://docusaurus.io',
  title: 'grid.space docs',
  baseUrl : '/',
  staticDirectories: ['./docs/static/'],
  // ...
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          /* docs plugin options */
          path: 'docs',
          routeBasePath: '/',
          sidebarPath: './docs/sidebars.js',
          // sidebar:{
          //   hideable: true,
          // }
        },
        blog: false
        
      },
    ],
  ],
};
