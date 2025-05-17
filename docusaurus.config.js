

module.exports = {
  url: 'https://docs.grid.space',
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
        blog: false,
        theme: {
          customCss: './docs/src/custom.css',
        },
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
