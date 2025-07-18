import lunr from 'docusaurus-lunr-search'

export default {
  url: 'https://docs.grid.space',
  title: 'grid.space docs',
  baseUrl : '/',
  favicon: 'img/gs-logo.png',
  staticDirectories: ['./docs/static/'],
  // ...
  plugins: [
    lunr,
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: [
          {
            to: '/mesh-tool',
            from: '/projects/mesh-tool',
          },
          {
            to: '/kiri-moto',
            from: "/projects/kiri-moto",
          },

          {
            to: '/kiri-moto/interface',
            from: "/projects/kiri-moto/interface",
          },
          {
            to: '/kiri-moto/controls',
            from: "/projects/kiri-moto/controls",
          },
          {
            to: '/kiri-moto/integrations',
            from: "/projects/kiri-moto/integrations",
          },
          {
            to: '/kiri-moto/shared-profiles',
            from: "/projects/kiri-moto/shared-profiles",
          },
          {
            to: '/kiri-moto/gcode-macros',
            from: "/projects/kiri-moto/gcode-macros",
          },
          {
            to: '/kiri-moto/apis',
            from: "/projects/kiri-moto/apis",
          },
          {
            to: '/kiri-moto/engine-apis',
            from: "/projects/kiri-moto/engine-apis",
          },
          {
            to: '/kiri-moto/localization',
            from: "/projects/kiri-moto/localization",
          },
          {
            to: '/kiri-moto/octoprint',
            from: "/projects/kiri-moto/octoprint",
          },
          {
            to: '/kiri-moto/faq',
            from: "/projects/kiri-moto/faq",
          },
          {
            to: "/gridbot",
            from: "/projects/gridbot"
          },
          {
            to: "/gridbot/bom",
            from: "/projects/gridbot/bom"
          }
        ],
      },
    ]
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
