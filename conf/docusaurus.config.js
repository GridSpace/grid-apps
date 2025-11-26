

module.exports = {
  url: 'https://docs.grid.space',
  title: 'grid.space docs',
  baseUrl : '/',
  favicon: 'img/gs-logo.png',
  staticDirectories: ['./docs/static/'],
  // ...
  plugins: [
    require.resolve('docusaurus-lunr-search'),
    ['@docusaurus/plugin-client-redirects',
      {
        redirects: [
          // /docs/oldDoc -> /docs/newDoc
          {
            to: '/kiri-moto',
            from: '/projects/kiri-moto',
          },
          // Redirect from multiple old paths to the new path
          {
            to: '/gridbot',
            from: '/projects/gridbot',
          },
          {
            to: '/mesh-tool',
            from: '/projects/mesh-tool',
          },
        ],
      }],
  ],
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
