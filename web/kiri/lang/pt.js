// Portuguese localization for Kiri:Moto
// Will defer to English map for any missing key/value pairs
kiri.lang['pt'] = kiri.lang['pt-pt'] = {
  // common keys and menus
  animate: 'animar', // CAM animate button
  arrange: 'organizar', // layout workspace objects
  axis: 'eixo', // left object scale pop menu
  clear: 'limpar', // clear workspace (remove all objects)
  copy: 'copiar',
  delete: 'excluir',
  detail: 'detalhe',
  done: 'pronto',
  enable: 'permitir',
  export: 'exportar',
  files: 'arquivos',
  help: 'ajuda',
  ghost: 'fantasma', // left render pop menu (wireframe)
  hide: 'ocultar', // left render pop menu (invisible)
  home: 'início',
  import: 'importar',
  language: 'idioma',
  machine: 'máquinha', // device or machine
  metric: 'métrica',
  name: 'nome',
  prefs: 'preferências', // left menu "preferences"
  preview: 'pré-visualizar',
  recent: 'recente',
  render: 'renderizar', // left render pop menu
  reset: 'redefinir',
  rotate: 'girar', // left rotate pop menu
  save: 'salvar',
  scale: 'escalar', // left object scale pop menu
  setup: 'configurar',
  settings: 'configurações',
  size: 'tamanho',
  slice: 'fatiar',
  solid: 'sólido', // view type pop menu
  start: 'iniciar',
  tool: 'ferramenta',
  tools: 'ferramentas', // CAM tool menu button
  top: 'topo',
  type: 'tipo', // CAM tool type
  version: 'versão',
  view: 'visualizar', // left view pop menu
  wire: 'fio', // left render pop menu

  acct_xpo: [
    'faça um backup de seu aparelho',
    'e perfis de dispositivos com a',
    'opção para incluir objetos e posições',
    'de espaço de trabalho',
  ],

  // RIGHT-CLICK CONTEXT MENU
  rc_clws: 'limpar espaço de trabalho',
  rc_xpws: 'exportar espaço de trabalho',
  rc_lafl: 'apoiar sobre plano',
  rc_mirr: 'espelhar',
  rc_dupl: 'duplicar',
  rc_xstl: 'exportar como STL',

  // DEVICE MENU and related dialogs
  dm_sldt: 'selecione um tipo de dispositivo',
  dm_stdd: 'dispositivos padrão',
  dm_mydd: 'meus dispositivos',
  dm_seld: 'dispositivo selecionado',
  dm_rcnt: 'arquivos recentes',
  dm_savs: 'configurações salvas',
  dm_appp: 'Preferências da Aplicação',

  // CAM Tool Dialog
  td_tyem: 'extremo', // end mill
  td_tybm: 'bola', // ball mill
  td_tytm: 'cone', // taper mill
  td_tonm: 'ferramenta #',
  td_shft: 'haste', // endmill shaft specs
  td_flut: 'flauta', // endmill flute specs
  td_tapr: 'estreitar', // endmill taper specs

  // DEVICE dialog groups
  dv_gr_dev: 'dispositivo',
  dv_gr_ext: 'extrusora',
  dv_gr_out: 'saída',
  dv_gr_gco: 'macros gcode',

  // DEVICE dialog (_s = label, _l = hover help)
  dv_name_s: 'nome',
  dv_name_l: 'nome do dispositivo',
  dv_fila_s: 'filamento',
  dv_fila_l: 'diâmetro em milímetros',
  dv_nozl_s: 'nozzle',
  dv_nozl_l: 'diâmetro em milímetros',
  dv_bedw_s: 'largura',
  dv_bedw_l: 'unidades de espaço de trabalho',
  dv_bedd_s: 'profundidade',
  dv_bedd_l: 'unidades de espaço de trabalho',
  dv_bedh_s: 'altura',
  dv_bedh_l: [
    'altura máxima de construção',
    'em unidades de espaço de trabalho',
  ],
  dv_spmx_s: 'fuso máximo',
  dv_spmx_l: ['velocidade máxima de rotação do fuso', '0 para desativar'],
  dv_xtab_s: 'posicionamento absoluto',
  dv_xtab_l: 'movimentos de extrusão absolutos',
  dv_orgc_s: 'centro de origem',
  dv_orgc_l: 'centro de origem da cama',
  // dv_orgt_s:      "origem topo",
  // dv_orgt_l:      "peça z origem topo",
  dv_bedc_s: 'cama circular',
  dv_bedc_l: 'a cama do dispositivo é circular',
  dv_belt_s: 'cama de cinto',
  dv_belt_l: 'cama de impressão contínua',
  dv_retr_s: 'retração do firmware',
  dv_retr_l: ['fimware de dispositivo suporta G10/G11'],
  dv_fanp_s: 'potência do ventilador',
  dv_fanp_l: 'definir a potência do ventilador de resfriamento',
  dv_prog_s: 'progresso',
  dv_prog_l: 'saída em cada % de progresso',
  dv_layr_s: 'camada',
  dv_layr_l: ['saída em cada', 'mudança de camada'],
  dv_tksp_s: 'espaçador de token',
  dv_tksp_l: [
    'adicionar um espaço entre',
    'parâmetros do eixo do gcode',
    'G0X0Y0X0',
    'vs',
    'G0 X0 Y0 Z0',
  ],
  dv_strc_s: 'eliminar comentários',
  dv_strc_l: ['eliminar comentários de gcode', 'comentários começam com ;'],
  dv_fext_s: 'extensão do arquivo',
  dv_fext_l: 'extensão do nome do arquivo',
  dv_dwll_s: 'permanência',
  dv_dwll_l: 'script de permanência de gcode',
  dv_tool_s: 'mudança de ferramenta',
  dv_tool_l: 'script de mudança de ferramenta',
  dv_sspd_s: 'velocidade do fuso',
  dv_sspd_l: 'definir velocidade do fuso',
  dv_paus_s: 'pause',
  dv_paus_l: 'script gcode de pause',
  dv_head_s: 'cabeçalho',
  dv_head_l: 'script gcode de cabeçalho',
  dv_foot_s: 'rodapé',
  dv_foot_l: 'script gcode de rodapé',
  dv_lzon_s: 'laser ligado',
  dv_lzon_l: 'script gcode de laser ligado',
  dv_lzof_s: 'laser desligado',
  dv_lzof_l: 'script gcode de laser desligado',
  dv_exts_s: 'selecionar',
  dv_exts_l: 'gcode run para habilitar esta extrusora',
  dv_dext_s: 'desmarcar',
  dv_dext_l: 'gcode run antes de habilitar outra extrusora',
  dv_extd_s: 'desmarcar',
  dv_extd_l: 'gcode para desmarcar esta extrusora',
  dv_exox_s: 'compensação x',
  dv_exox_l: 'nozzle offset x',
  dv_exoy_s: 'compensação y',
  dv_exoy_l: 'nozzle offset y',

  // MODE
  mo_menu: 'modo',
  mo_fdmp: 'Impressão FDM',
  mo_slap: 'Impressão SLA',
  mo_lazr: 'Corte a Laser',
  mo_cncm: 'Fresadora CNC',

  // SETUP
  su_menu: 'configurar',
  su_devi: 'Dispositivos',
  su_tool: 'Ferramentas',
  su_locl: 'Local',
  su_xprt: 'Exportar',
  su_help: 'Ajuda',

  // LOAD
  fe_menu: 'arquivo',
  fn_recn: 'Recente',
  fn_impo: 'Importar',

  // FUNCTION
  fn_menu: 'ação',
  fn_arra: 'Organizar',
  fn_slic: 'Fatiar',
  fn_prev: 'Pré-visualizar',
  fn_expo: 'Exportar',

  // VIEW
  vu_menu: 'visualizar',
  vu_home: 'Início',
  vu_rset: 'Redefinir',
  vu_sptp: 'Topo',
  vu_spfr: 'Frente',
  vu_splt: 'Esquerda',
  vu_sprt: 'Direita',

  // WORKSPACE
  ws_menu: 'visualizar',
  ws_save: 'Salvar',
  ws_cler: 'Limpar',

  // OPTIONS
  op_menu: 'interface',
  op_disp: 'exibir',
  op_xprt_s: 'especialista',
  op_xprt_l: 'mostrar mais opções de configuração',
  op_decl_s: 'decalques',
  op_decl_l: 'exibir decalques e logotipos de dispositivos',
  op_dang_s: 'experimental',
  op_dang_l: 'mostrar parâmetros experimentais',
  op_hopo_s: 'pairar',
  op_hopo_l: ['habilitar pairar o menu', 'para ativar'],
  op_dark_s: 'modo escuro',
  op_dark_l: 'interface modo escuro',
  op_comp_s: 'interface compacta',
  op_comp_l: [
    'interface de usuário compacta',
    'melhor para telas pequenas',
    'e tablets',
  ],
  op_shor_s: 'mostrar origem',
  op_shor_l: 'mostrar a origem do dispositivo ou processo',
  op_shru_s: 'mostrar réguas',
  op_shru_l: ['mostrar réguas de eixos', 'nas principais linhas de grade'],
  op_sped_s: 'mostrar velocidades',
  op_sped_l: [
    'mostrar velocidade para a barra de cores',
    'em modo de visualização',
  ],
  op_auto_s: 'layout automático',
  op_auto_l: [
    'faz o layout automático da plataforma',
    'quando novos itens são adicionados',
  ],
  op_free_s: 'layout livre',
  op_free_l: ['permite um layout arrastável', 'sem efeito no modo laser'],
  op_spcr_s: 'espaçamento',
  op_spcr_l: [
    'espaçamento entre objetos',
    'durante layout automático',
    'em unidades de espaço de trabalho',
  ],
  op_orth_s: 'ortográfico',
  op_orth_l: ['exibição ortográfica', 'requer atualização de página'],
  op_invr_s: 'zoom invertido',
  op_invr_l: ['zoom invertido', 'com roda do mouse'],
  op_save_s: 'salvar automaticamente',
  op_save_l: [
    'preserva objetos no espaço de trabalho',
    'entre as recargas de aplicação',
  ],
  op_line_s: 'tipo de linha',
  op_line_l: [
    'estilo de linha para renderização do caminho',
    'impacta o desempenho 3d',
    'caminho: 3d melhor',
    'plano: 2d bom',
    'linha = 1d rápido',
  ],
  op_unit_s: 'unidades',
  op_unit_l: [
    'unidades de espaço de trabalho afeta',
    'velocidades e distâncias',
  ],
  op_anim_s: 'animar',
  op_anim_l: [
    'densidade da malha de animação',
    'mais alto é mais denso',
    'usa mais memória',
    'e é mais lento',
  ],

  lo_menu: 'layout',

  pt_menu: 'peças',
  pt_deci_s: 'decimar',
  pt_deci_l: [
    'ativar ou desativar a decimação do ponto',
    'durante a importação do port. para fatiamento mais rápido',
    'e menor uso de memória',
  ],
  pt_qual_s: 'qualidade',
  pt_qual_l: [
    'nível de detalhe a ser retido',
    'durante as operações de fatiamento',
    'mais baixo é mais rápido',
  ],
  pt_heal_s: 'cura malha',
  pt_heal_l: [
    'tentar curar',
    'malhas não múltiplas',
    'extende o tempo de corte',
  ],

  xp_menu: 'exportações',

  // SETTINGS
  se_menu: 'perfil',
  se_load: 'carregar',
  se_save: 'salvar',

  // FDM SLICING
  sl_menu: 'layers',
  sl_lahi_s: 'altura',
  sl_lahi_l: ['altura de cada fatia', 'camada em milímetros'],
  ad_minl_s: 'altura min',
  ad_minl_l: [
    'altura adaptativa da camada min.',
    'em milímetros',
    'deve ser diferente de zero',
  ],
  sl_ltop_s: 'camadas de topo',
  sl_ltop_l: [
    'número de camadas sólidas',
    'para fazer cumprir na',
    'parte superior da impressão',
  ],
  sl_lsld_s: 'camadas sólidas',
  sl_lsld_l: [
    'áreas de preenchimento sólido computadas',
    'de camadas de deltas. ver',
    'menu pop camada',
  ],
  sl_lbot_s: 'camadas de base',
  sl_lbot_l: [
    'número de camadas sólidas',
    'para fazer cumprir na',
    'parte inferior da impressão',
  ],
  ad_adap_s: 'adaptativo',
  ad_adap_l: [
    'usar alturas de camadas adaptativas',
    "com 'altura de camada' como máximo",
    "e 'camada min' como o min",
  ],

  // FDM SHELLS
  sl_shel_s: 'quantidade de cartuchos',
  sl_shel_l: ['número de paredes', 'de perímetro para gerar'],
  sl_ordr_s: 'ordem de cartuchos',
  sl_ordr_l: [
    'ordem de saída de cartuchos',
    'dentro para fora',
    'ou de fora para dentro',
    'afeta a qualidade da superfície',
  ],
  sl_strt_s: 'início da camada',
  sl_strt_l: [
    'ponto inicial da camada',
    'último = última camada final',
    'centro = centro da peça',
    'origem = origem do dispositivo',
  ],
  ad_thin_s: 'paredes finas',
  ad_thin_l: ['detecta e preenche lacunas', 'entre paredes de cartuchos'],

  // FDM FILL
  fi_menu: 'preenchimento',
  fi_type: 'tipo de preenchimento',
  fi_pcnt_s: 'fração de preenchimento',
  fi_pcnt_l: ['fill density values', '0.0 - 1.0'],
  fi_angl_s: 'início sólido',
  fi_angl_l: [
    'ângulo inicial em graus',
    '90 graus adicionados a ',
    'cada camada seguinte',
    'se aplica somente a camadas sólidas',
  ],
  fi_wdth_s: 'largura sólida',
  fi_wdth_l: [
    'line width for solid fill',
    'as a fraction of nozzle width',
    'values < 1 are more dense',
    'good for surface finishes',
    '0.0 - 1.0',
  ],
  fi_over_s: 'sobreposição de cartucho',
  fi_over_l: [
    'overlap with shell and other fill',
    'as fraction of nozzle diameter',
    '0.0 - 2.0',
  ],
  // fi_rate_s:      "velocidade de impressão",
  fi_rate_l: [
    'velocidade de extrusão para preenchimento',
    'defina como 0 para usar padrão',
    'velocidades de impressão de saída',
  ],

  // FDM FIRST LAYER
  fl_menu: 'base',
  fl_lahi_s: 'altura da camada',
  fl_lahi_l: [
    'altura de cada fatia',
    'em milímetros',
    'deve ser >= altura da fatia',
  ],
  fl_rate_s: 'velocidade do cartucho',
  fl_rate_l: [
    'velocidade máxima de impressão do cartucho',
    'em milímetros / segundo',
  ],
  fl_frat_s: 'velocidade de preenchimento',
  fl_frat_l: [
    'velocidade máxima de impressão de preenchimento',
    'em milímetros / segundo',
  ],
  fl_mult_s: 'fator de fluxo',
  fl_mult_l: ['multiplicador de extrusão', '0.0 - 2.0'],
  fl_sfac_s: 'fator de largura',
  fl_sfac_l: ['multiplier on nozzle size', 'changes line spacing'],
  fl_skrt_s: 'skirt count',
  fl_skrt_l: ['number of first-layer offset', 'brims to generate'],
  fl_skro_s: 'skirt offset',
  fl_skro_l: ['skirt offset from part', 'in millimeters'],
  fl_nozl_s: 'nozzle temp',
  fl_nozl_l: [
    'graus em celsius',
    'configuração de saída utilizada',
    'quando este é zero',
  ],
  fl_bedd_s: 'temperatura da cama',
  fl_bedd_l: [
    'graus em celsius',
    'configuração de saída utilizada',
    'quando este é zero',
  ],
  fr_spac_s: 'raft gap',
  fr_spac_l: [
    'espaçamento adicional de camadas',
    'entre a 1ª camada e raft',
    'em milímetros',
  ],
  fr_nabl_s: 'raft enable',
  fr_nabl_l: [
    'create a raft under the',
    'model for better adhesion',
    'uses skirt offset and',
    'disables skirt output',
  ],

  // FDM BELT ONLY
  fl_zoff_s: 'compensação do cinto',
  fl_zoff_l: [
    'deslocamento de altura do cinto',
    'de menor extrusão',
    'em milímetros',
  ],
  fl_brim_s: 'tamanho da borda',
  fl_brim_l: [
    'adiciona borda na parte inferior',
    'o tamanho é a largura em milímetros',
    '0 para desativar',
  ],
  fl_brmn_s: 'gatilho de borda',
  fl_brmn_l: [
    'adicione borda apenas quando o segmento',
    'cinto de frente é mais curto do que este',
    'valor em milímetros',
    '0 = Infinito',
  ],
  fl_bled_s: 'âncora parcial',
  fl_bled_l: [
    'âncora da parte do cinto',
    'no início da impressão',
    'em milímetros',
  ],

  // FDM SUPPORT
  sp_menu: 'suporte',
  sp_detect: 'detectar',
  sp_dens_s: 'densidade',
  sp_dens_l: ['fração 0.0 - 1.0', 'recomendada 0.15', '0 para desativar'],
  sp_size_s: 'tamanho do pilar',
  sp_size_l: ['largura do pilar', 'em milímetros'],
  sp_offs_s: 'compensação da peça',
  sp_offs_l: ['deslocamento da peça', 'em milímetros'],
  sp_gaps_s: 'camadas de lacuna',
  sp_gaps_l: ['número de camadas', 'deslocamento da peça'],
  sp_span_s: 'intervalo máximo',
  sp_span_l: [
    'extensão não suportada que causa',
    'um novo suporte a ser gerado',
    'em milímetros',
  ],
  sp_angl_s: 'ângulo máximo',
  sp_angl_l: ['ângulo máximo de projeção antes', 'de gerar o pilar de suporte'],
  sp_area_s: 'área mínima',
  sp_area_l: ['área mínima para', 'uma coluna de suporte', 'em milímetros'],
  sp_xpnd_s: 'expandir',
  sp_xpnd_l: [
    'expandir a área de suporte',
    'além do limite parcial',
    'em milímetros',
  ],
  sp_nozl_s: 'extrusora',
  sp_nozl_l: [
    'em sistemas multi-extrusora',
    'a extrusora a ser usada como',
    'material de suporte',
  ],
  sp_auto_s: 'automático',
  sp_auto_l: [
    'habilita suportes gerados',
    'usando geometria em tempo de corte',
    'os suportes só aparecerão',
    'após a conclusão do corte',
  ],

  // LASER SLICING
  ls_offs_s: 'compensação',
  ls_offs_l: ['ajustar a largura do feixe', 'em milímetros'],
  ls_lahi_s: 'altura',
  ls_lahi_l: ['altura da camada', 'em milímetros', '0 = auto/detectar'],
  ls_lahm_s: 'mínimo',
  ls_lahm_l: [
    'altura mínima da camada',
    'irá mesclar fatias automáticas',
    'sob esta espessura',
    'em milímetros',
  ],
  ls_sngl_s: 'único',
  ls_sngl_l: ['executa apenas uma fatia', 'na altura da camada especificada'],

  // CNC COMMON terms
  cc_tool: 'ferramenta',
  cc_offs_s: 'compensação',
  cc_offs_l: ['compensação do centro da ferramenta', 'do caminho escolhido'],
  cc_spnd_s: 'rpm do fuso',
  cc_spnd_l: ['velocidade do fuso em', 'revoluções/minuto'],
  cc_sovr_s: 'aumentar',
  cc_sovr_l: ['como uma fração de', 'diâmetro da ferramenta'],
  cc_sdwn_s: 'diminuir',
  cc_sdwn_l: [
    'diminuir a profundidade',
    'para cada passagem',
    'em unidades de espaço de trabalho',
    '0 para desativar',
  ],
  cc_feed_s: 'velocidade de avanço',
  cc_feed_l: [
    'velocidade máxima de corte em',
    'unidades de espaço de trabalho/minuto',
  ],
  cc_plng_s: 'taxa de imersão',
  cc_plng_l: [
    'velocidade máxima do eixo z em',
    'unidades de espaço de trabalho/minuto',
  ],
  cc_sngl_s: 'selecione apenas linhas',
  cc_sngl_l: [
    'selecionar apenas bordas individuais',
    'em vez de polilinhas conectadas',
  ],

  // CNC COMMON
  cc_menu: 'limites',
  cc_flip: 'virar',
  cc_rapd_s: 'avançar xy',
  cc_rapd_l: [
    'velocidade máxima de movimentos xy',
    'em unidades de espaço de trabalho/minuto',
  ],
  cc_rzpd_s: 'avançar z',
  cc_rzpd_l: [
    'velocidade máxima de movimentos z',
    'em unidades de espaço de trabalho/minuto',
  ],

  cc_loff_s: 'compensação',
  cc_loff_l: [
    'distância da superfície do material',
    'para passar de nivelamento',
    'em unidades de espaço de trabalho',
  ],

  // CNC ROUGHING
  cr_menu: 'retificar',
  cr_lsto_s: 'deixar material',
  cr_lsto_l: [
    'compensação horizontal das faces verticais',
    'material para deixar para a passagem de acabamento',
    'em unidades de espaço de trabalho',
  ],
  cr_ease_s: 'suavizar',
  cr_ease_l: [
    'cortes de imersão vão',
    'baixar em espiral ou suavizar',
    'seguindo um caminho linear',
  ],
  cr_clrt_s: 'limpar o topo',
  cr_clrt_l: [
    'faz uma passagem de limpeza',
    'na área delimitadora da peça',
    'em z = 0',
  ],
  cr_clrp_s: 'limpar vazios',
  cr_clrp_l: ['fresar através de cavidades', 'em vez de apenas o contorno'],
  cr_clrf_s: 'limpar faces',
  cr_clrf_l: [
    'interpolar descer para',
    'limpar todas as áreas planas detectadas',
  ],
  cr_olin_s: 'apenas interior',
  cr_olin_l: ['limitar corte para', 'dentro dos limites da peça'],

  // CNC OUTLINE
  co_menu: 'contorno',
  co_dogb_s: 'dogbones',
  co_dogb_l: ['inserir cortes dogbones', 'dentro dos cantos'],
  co_wide_s: 'recorte largo',
  co_wide_l: [
    'alargar caminhos recortados externos',
    'para cortes profundos em material duro',
  ],
  co_olin_s: 'apenas interior',
  co_olin_l: ['limitar corte para', 'dentro dos limites da peça'],
  co_olot_s: 'apenas exterior',
  co_olot_l: [
    'limitar corte para',
    'exterior dos limites da peça',
    'que pode ser pensado',
    'como o contorno da sombra',
  ],
  co_omit_s: 'omitir através',
  co_omit_l: 'elimine buracos passantes',
  co_olen_s: 'habilitar',
  co_olen_l: 'corte de contorno habilitado',

  // CNC CONTOUR
  cn_menu: 'contorno',
  cf_angl_s: 'ângulo máximo',
  cf_angl_l: ['ângulos maiores que este', 'são considerados verticais'],
  cf_curv_s: 'apenas curvas',
  cf_curv_l: ['limitar limpeza linear', 'para superfícies curvas'],
  cf_olin_s: 'apenas interior',
  cf_olin_l: ['limitar corte para', 'dentro dos limites da peça'],
  cf_linx_s: 'habilitar passagem y',
  cf_linx_l: 'acabamento linear do eixo y',
  cf_liny_s: 'habilitar passagem x',
  cf_liny_l: 'acabamento linear do eixo x',

  // CNC TRACE
  cu_menu: 'traçar',
  cu_type_s: 'tipo',
  cu_type_l: [
    'seguir = ponta da ferramenta segue a linha',
    'direita ou esquerda = ponta da ferramenta',
    'segue o deslocamento da linha pelo raio da ferramenta',
  ],

  // CNC DRILLING
  cd_menu: 'furar',
  cd_axis: 'eixo',
  cd_points: 'pontos',
  cd_plpr_s: 'imersão por',
  cd_plpr_l: [
    'imersão máxima entre',
    'períodos de permanência',
    'em unidades de espaço de trabalho',
    '0 para desativar',
  ],
  cd_dwll_s: 'tempo de permanência',
  cd_dwll_l: ['tempo de permanência', 'entre imersões', 'em milissegundos'],
  cd_lift_s: 'elevação de perfuração',
  cd_lift_l: [
    'elevação entre as imersões',
    'após o período de permanência',
    'em unidades de espaço de trabalho',
    '0 para desativar',
  ],
  cd_regi_s: 'registro',
  cd_regi_l: [
    'buracos de registro de perfuração',
    'for double-sided parts',
    'independent of enable',
    'drilling but uses same',
    'tool and settings',
  ],

  // CNC CUTOUT TABS
  ct_menu: 'tabs',
  ct_angl_s: 'ângulo',
  ct_angl_l: ['ângulo inicial para espaçamento da guia', 'em graus (0-360)'],
  ct_numb_s: 'contagem',
  ct_numb_l: [
    'número de guias para usar',
    'será espaçado uniformemente',
    'ao redor da peça',
  ],
  ct_wdth_s: 'largura',
  ct_wdth_l: 'largura em unidades de espaço de trabalho',
  ct_hght_s: 'altura',
  ct_hght_l: 'altura em unidades de espaço de trabalho',
  ct_dpth_s: 'profundidade',
  ct_dpth_l: [
    'distância em unidades de espaço de trabalho',
    'que a guia projeta da',
    'superfície da peça',
  ],
  ct_midl_s: 'linha média',
  ct_midl_l: [
    'use a linha média da guia',
    'em vez de z inferior',
    'para trabalho frente e verso',
  ],
  ct_nabl_s: 'auto',
  ct_nabl_l: [
    'geração automática de guias radiais',
    'projetado do centro da peça',
    'usando contagem e deslocamento de ângulo',
  ],

  // OUTPUT
  ou_menu: 'saída',

  // LASER KNIFE
  dk_menu: 'faca',
  dk_dpth_s: 'profundidade de corte',
  dk_dpth_l: ['profundidade de corte final', 'em milímetros'],
  dk_pass_s: 'passagens de corte',
  dk_pass_l: ['número de passagens', 'até a profundidade do corte'],
  dk_offs_s: 'deslocamento da ponta',
  dk_offs_l: [
    'distância da ponta da lâmina',
    'para o centro da ferramenta',
    'em milímetros',
  ],

  // OUTPUT LASER
  ou_spac_s: 'espaçamento',
  ou_spac_l: ['distância entre a saída da camada', 'em milímetros'],
  ou_scal_s: 'escala',
  ou_scal_l: 'multiplicador (0.1 a 100)',
  ou_powr_s: 'poder',
  ou_powr_l: ['0 - 100', 'representa %'],
  ou_sped_s: 'velocidade',
  ou_sped_l: 'milímetros/segundo',
  ou_mrgd_s: 'mesclado',
  ou_mrgd_l: [
    'mesclar todas as camadas usando',
    'codificação de cores para denotar',
    'profundidade de empilhamento',
  ],
  ou_grpd_s: 'agrupado',
  ou_grpd_l: [
    'reter cada camada como',
    'um agrupamento unificado',
    'em vez de polígonos',
    'separados',
  ],
  ou_layr_s: 'ordem de camadas',
  ou_layr_l: [
    'ordem da camada de saída',
    'do canto superior direito para',
    'inferior esquerdo',
  ],
  ou_layo_s: 'cor da camada',
  ou_layo_l: [
    'cores da camada de saída',
    'para cada índice z',
    'substituído por mesclado',
  ],
  ou_drkn_s: 'faca de arrasto',
  ou_drkn_l: [
    'habilitar faca de arrasto',
    'saída em gcode',
    'raios de corte são adicionados',
    'para os cantos com',
    'passadas de corte',
  ],

  // OUTPUT FDM
  ou_nozl_s: 'nozzle temp',
  ou_nozl_l: 'graus em celsius',
  ou_bedd_s: 'temperatura da cama',
  ou_bedd_l: 'graus em celsius',
  ou_feed_s: 'velocidade de impressão',
  ou_feed_l: ['velocidade máxima de impressão', 'milímetros/segundo'],
  ou_fini_s: 'velocidade de acabamento',
  ou_fini_l: ['velocidade do cartucho mais externo', 'milímetros/segundo'],
  ou_move_s: 'velocidade de movimento',
  ou_move_l: [
    'velocidade de movimento sem impressão',
    'milímetros/segundo',
    '0 = habilitar movimentos G0',
  ],
  ou_shml_s: 'fator de cartucho',
  ou_flml_s: 'fator sólido',
  ou_spml_s: 'fator de preenchimento',
  ou_exml_l: ['multiplicador de extrusão', '0.0 - 2.0'],
  ou_fans_s: 'velocidade do ventilador',
  ou_fans_l: '0 - 255',

  // OUTPUT CAM
  ou_toll_s: 'tolerância',
  ou_toll_l: [
    'precisão de superfície',
    'em unidades de espaço de trabalho',
    'mais baixo é mais lento e',
    'usa mais memória',
    '0 = baseado automaticamente',
    'na preferência animada',
  ],
  ou_zanc_s: 'âncora z',
  ou_zanc_l: [
    'controla a posição da peça',
    'quando o material Z excede a parte Z',
  ],
  ou_ztof_s: 'compensação z',
  ou_ztof_l: [
    'compensa âncora z',
    'em unidades de espaço de trabalho',
    'não tem efeito quando',
    'a âncora está no meio',
  ],
  ou_zbot_s: 'z inferior',
  ou_zbot_l: [
    'deslocamento da parte inferior',
    'para limitar a profundidade de corte',
    'em unidades de espaço de trabalho',
  ],
  ou_zclr_s: 'espaço livre z',
  ou_zclr_l: [
    'deslocamento de viagem seguro',
    'de cima da peça',
    'em unidades de espaço de trabalho',
  ],
  ou_ztru_s: 'através z',
  ou_ztru_l: [
    'estender a passagem de recorte para baixo',
    'em unidades de espaço de trabalho',
  ],
  ou_conv_s: 'convencional',
  ou_conv_l: ['direção de fresagem', "desmarque para 'subir'"],
  ou_depf_s: 'profundidade primeiro',
  ou_depf_l: ['otimizar cortes de bolso', 'com prioridade de profundidade'],

  // CAM STOCK
  cs_menu: 'material',
  cs_wdth_s: 'largura',
  cs_wdth_l: [
    'largura (x) em unidades de espaço de trabalho',
    '0 padrão para o tamanho da peça',
  ],
  cs_dpth_s: 'profundidade',
  cs_dpth_l: [
    'profundidade (y) em unidades de espaço de trabalho',
    '0 padrão para o tamanho da peça',
  ],
  cs_hght_s: 'altura',
  cs_hght_l: [
    'altura (z) em unidades de espaço de trabalho',
    '0 padrão para o tamanho da peça',
  ],
  cs_offs_s: 'compensação',
  cs_offs_l: [
    'use largura, profundidade e altura',
    'como compensação do máximo',
    'padrão para o tamanho da peça',
  ],
  cs_clip_s: 'recortar para',
  cs_clip_l: [
    'áspero e esboço',
    'recortar caminhos de corte',
    'ao material definido',
  ],
  cs_offe_s: 'habilitar',
  cs_offe_l: 'habilitar material de fresagem',

  // ORIGIN (CAM & LASER)
  or_bnds_s: 'limites de origem',
  or_bnds_l: ['origem é relativa ao', 'limite de todos os objetos'],
  or_cntr_s: 'oragem central',
  or_cntr_l: 'origem é referenciada do centro',
  or_topp_s: 'origem superior',
  or_topp_l: 'origem são referências do topo dos objetos',

  // FDM ADVANCED
  ad_menu: 'especialista',
  ad_rdst_s: 'retrair distância',
  ad_rdst_l: [
    'quantidade para retrair o filamento',
    'para movimentos longos. em milímetros',
  ],
  ad_rrat_s: 'taxa de retração',
  ad_rrat_l: ['velocidade do filamento', 'retração em mm/s'],
  ad_rdwl_s: 'ativar o descanso',
  ad_wpln_s: 'retrair varredura',
  ad_wpln_l: ['movimento não imprimível', 'após retração', 'em milímetros'],
  ad_rdwl_l: [
    'tempo entre reengajamento',
    'do filamento e movimento',
    'em milissegundos',
  ],
  ad_scst_s: 'costa do cartucho',
  ad_scst_l: [
    'fim não imprimível',
    'dos cartuchos de perímetro',
    'em milímetros',
  ],
  ad_msol_s: 'sólido mínimo',
  ad_msol_l: [
    'área mínima (mm^2)',
    'necessária para se manter sólida',
    'deve ser > 0.1',
  ],
  ad_mins_s: 'velocidade mínima',
  ad_mins_l: ['velocidade mínima', 'para segmentos curtos'],
  ad_spol_s: 'caminho curto',
  ad_spol_l: [
    'polígonos mais curtos que este',
    'terão sua velocidade de impressão',
    'reduzida para velocidade mínima',
    'em milímetros',
  ],
  ad_arct_s: 'tolerância de arco',
  ad_arct_l: [
    'converter linhas facetadas em arcos',
    'tolerância de desvio do ponto central',
    'ao combinar pontos de arco',
    'considere valores em torno de 0,15',
    'em milímetros',
    '0 para desativar',
  ],
  ad_zhop_s: 'z hop dist',
  ad_zhop_l: [
    'quantidade para aumentar z',
    'em movimentos de retração',
    'em milímetros',
    '0 para desativar',
  ],
  ad_abkl_s: 'antiretrocesso',
  ad_abkl_l: [
    'para melhor acabamento de superfície plana',
    'use micromovimentos para cancelar',
    'o retrocesso na saída da camada sólida',
    'em milímetros',
    '0 para desativar',
    'se o seu firmware tiver M425',
    'coloque isso no cabeçalho do gcode',
    'e deixe como 0',
  ],
  ad_lret_s: 'retrair camada',
  ad_lret_l: ['forçar a retração do filamento', 'entre camadas'],
  ad_play_s: 'polir camadas',
  ad_play_l: ['polir até o especificado', '# de camadas de cada vez'],
  ad_pspd_s: 'velocidade de polimento',
  ad_pspd_l: ['velocidade de polimento', 'em milímetros/segundo'],

  // CAM EXPERT
  cx_fast_s: 'pular sombra',
  cx_fast_l: [
    'desabilitar detecção de saliências',
    'pode ser mais rápido e usar menos',
    'memória com modelos complexos',
    'mas falha com saliências',
    'tente habilitar se fatiar',
    'travar durante o sombreamento',
  ],

  // FDM GCODE
  ag_menu: 'gcode',
  ag_nozl_s: 'nozzle',
  ag_nozl_l: 'select output nozzle or head',
  ag_peel_s: 'protetor de desprendimento',
  ag_peel_l: [
    'começando nesta posição z do cinto',
    'periodicamente rolar a impressão e',
    'voltar ao cinto para soltá-lo',
    'e evitar deflexão de rolamento',
  ],
  ag_paws_s: 'pausar camadas',
  ag_paws_l: [
    'lista de camadas separadas por vírgulas',
    'para injetar comandos de pausa antes',
  ],
  ag_loop_s: 'repetir camadas',
  ag_loop_l: [
    'intervalos de camadas para repetir no formato',
    'primeira-última-contagem, primeira-última-contagem,...',
    'contagem omitida = 1',
  ],

  // SLA MENU
  sa_menu: 'corte',
  sa_lahe_s: 'altura da camada',
  sa_lahe_l: ['altura da camada', 'em milímetros'],
  sa_shel_s: 'cartucho vazio',
  sa_shel_l: [
    'espessura do cartucho em mm',
    'usar múltiplas camadas de altura',
    'use 0 para sólido (desabilitado)',
  ],
  sa_otop_s: 'topo aberto',
  sa_otop_l: ['se cartucho está habilitado', 'resulta em um topo aberto'],
  sa_obas_s: 'base aberta',
  sa_obas_l: [
    'se cartucho está habilitado',
    'resulta em uma base aberta',
    'desabilitado com suportes',
  ],

  sa_layr_m: 'camadas',
  sa_lton_s: 'luz de tempo',
  sa_lton_l: ['luz de camada ligada', 'tempo em segundos'],
  sa_ltof_s: 'light off time',
  sa_ltof_l: ['luz de camada desligada', 'tempo em segundos'],
  sa_pldi_s: 'distância de casca',
  sa_pldi_l: ['distância de casca', 'em milímetros'],
  sa_pllr_s: 'taxa de elevação de casca',
  sa_pllr_l: ['velocidade de elevação da casca', 'em mm/seg'],
  sa_pldr_s: 'taxa de descasque',
  sa_pldr_l: ['velocidade de descasque', 'em mm/seg'],

  sa_base_m: 'base',
  sa_balc_s: 'contagem de camadas',
  sa_balc_l: ['número de', 'camadas base'],
  sa_bltn_l: ['luz da camada de base ligada', 'tempo em segundos'],
  sa_bltf_l: ['luz da camada de base desligada', 'tempo em segundos'],

  sa_infl_m: 'preenchimento',
  sa_ifdn_s: 'densidade',
  sa_ifdn_l: [
    'porcentagem de preenchimento',
    'requer cartucho',
    '0 = desativado',
    'válido 0.0 - 1.0',
  ],
  sa_iflw_s: 'espessura da linha',
  sa_iflw_l: ['largura da linha hachurada', 'em milímetros'],

  sa_supp_m: 'suporte',
  sa_slyr_s: 'camadas base',
  sa_slyr_l: ['camadas de suporte de base', 'faixa de valor 0-10'],
  sa_slgp_s: 'camadas de lacuna',
  sa_slgp_l: ['number of layers between', 'raft and bottom of object'],
  sa_sldn_s: 'densidade',
  sa_sldn_l: [
    'usado para calcular o',
    'número de pilares de suporte',
    '0.0-1.0 (0 = desativar)',
  ],
  sa_slsz_s: 'tamanho',
  sa_slsz_l: ['tamanho máximo de um', 'pilar de suporte', 'em milímetros'],
  sa_slpt_s: 'pontos',
  sa_slpt_l: ['número de pontos em', 'cada pilar de suporte', 'em milímetros'],
  sl_slen_l: 'habilitar suporte',

  sa_outp_m: 'saída',
  sa_opzo_s: 'compensação z',
  sa_opzo_l: [
    'compensação da camada z',
    'quase sempre 0.0',
    '0.0-1.0 em milímetros',
  ],
  sa_opaa_s: 'suavidade',
  sa_opaa_l: [
    'habilita o anti-aliasing (suavidade)',
    'produz arquivos maiores',
    'pode desfocar detalhes',
  ],
}
