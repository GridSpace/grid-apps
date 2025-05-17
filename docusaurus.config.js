

module.exports = {
  url: 'https://docusaurus.io',
  title: 'grid.space docs',
  baseUrl : '/',
  staticDirectories: ['./docs/static/'],
  // ...
  plugins: [require.resolve('docusaurus-lunr-search')],
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

  themeConfig:{
    navbar:{
      title: "Grid.Space Docs",
      logo: {
        alt: "Grid.Space Logo",
        src: "img/gs-logo.png",
        href: "https://docs.grid.space",
        width: 32,
        height:32,
      },

    },
  },
};
