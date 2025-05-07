// Spanish localization for Kiri:Moto
// Will defer to English map for any missing key/value pairs
kiri.lang['es'] = kiri.lang['es-es'] = {
  // common keys and menus
  animate: 'animar', // CAM animate button
  arrange: 'organizar', // layout workspace objects
  axis: 'eje', // left object scale pop menu
  clear: 'limpiar', // clear workspace (remove all objects)
  copy: 'copiar',
  delete: 'eliminar',
  detail: 'detalle',
  done: 'hecho',
  enable: 'habilitar',
  export: 'exportar',
  files: 'archivos',
  help: 'ayuda',
  ghost: 'fantasma', // left render pop menu (wireframe)
  hide: 'ocultar', // left render pop menu (invisible)
  home: 'inicio',
  import: 'importar',
  language: 'idioma',
  machine: 'máquina', // device or machine
  metric: 'métrica',
  name: 'nombre',
  prefs: 'preferencias', // left menu "preferences"
  preview: 'vista previa',
  recent: 'reciente',
  render: 'renderizar', // left render pop menu
  reset: 'restablecer',
  rotate: 'rotar', // left rotate pop menu
  save: 'guardar',
  scale: 'escala', // left object scale pop menu
  setup: 'configurar',
  settings: 'configuración',
  size: 'tamaño',
  slice: 'corte',
  solid: 'sólido', // view type pop menu
  start: 'inicio',
  tool: 'herramienta',
  tools: 'herramientas', // CAM tool menu button
  top: 'arriba',
  type: 'tipo', // CAM tool type
  version: 'versión',
  view: 'vista', // left view pop menu
  wire: 'alambre', // left render pop menu

  acct_xpo: [
    'hace una copia de seguridad de su dispositivo',
    'y perfiles de dispositivo con la ',
    'opción de incluir espacio de trabajo',
    'objetos y posiciones',
  ],

  // RIGHT-CLICK CONTEXT MENU
  rc_clws: 'limpiar espacio de trabajo',
  rc_xpws: 'exportar espacio de trabajo',
  rc_lafl: 'apoyar sobre plano',
  rc_mirr: 'espejar',
  rc_dupl: 'duplicar',
  rc_xstl: 'exportar como STL',

  // DEVICE MENU and related dialogs
  dm_sldt: 'seleccionar un tipo de dispositivo',
  dm_stdd: 'dispositivos estándar',
  dm_mydd: 'mis dispositivos',
  dm_seld: 'dispositivo seleccionado',
  dm_rcnt: 'archivos recientes',
  dm_savs: 'ajustes guardados',
  dm_appp: 'Preferencias de la aplicación',

  // CAM Tool Dialog
  td_tyem: 'extremo', // end mill
  td_tybm: 'bola', // ball mill
  td_tytm: 'cono', // taper mill
  td_tonm: 'herramienta #',
  td_shft: 'asta', // endmill shaft specs
  td_flut: 'flauta', // endmill flute specs
  td_tapr: 'estrechar', // endmill taper specs

  // DEVICE dialog groups
  dv_gr_dev: 'dispositivo',
  dv_gr_ext: 'extrusora',
  dv_gr_out: 'salida',
  dv_gr_gco: 'macros de gcode',

  // DEVICE dialog (_s = label, _l = hover help)
  dv_name_s: 'nombre',
  dv_name_l: 'nombre del dispositivo',
  dv_fila_s: 'filamento',
  dv_fila_l: 'diámetro en milímetros',
  dv_nozl_s: 'boquilla',
  dv_nozl_l: 'diámetro en milímetros',
  dv_bedw_s: 'ancho',
  dv_bedw_l: 'unidades de espacio de trabajo',
  dv_bedd_s: 'profundidad',
  dv_bedd_l: 'unidades de espacio de trabajo',
  dv_bedh_s: 'altura',
  dv_bedh_l: [
    'altura máxima de construcción',
    'en unidades de espacio de trabajo',
  ],
  dv_spmx_s: 'husillo máximo',
  dv_spmx_l: ['velocidad máxima en rpm del husillo', '0 para deshabilitar'],
  dv_xtab_s: 'posicionamiento absoluto',
  dv_xtab_l: 'extrusión se mueve en absoluto',
  dv_orgc_s: 'centro de origen',
  dv_orgc_l: 'centro de origen de la cama',
  // dv_orgt_s:      "parte superior del origen",
  // dv_orgt_l:      "parte superior z del origen de la parte",
  dv_bedc_s: 'cama circular',
  dv_bedc_l: 'la cama del dispositivo es circular',
  dv_belt_s: 'cama de cinta',
  dv_belt_l: 'cama de impresión continua',
  dv_retr_s: 'retracción de firmware',
  dv_retr_l: ['el firmware del dispositivo es compatible con G10/G11'],
  dv_fanp_s: 'potencia del ventilador',
  dv_fanp_l: 'establecer la potencia del ventilador de refrigeración',
  dv_prog_s: 'progreso',
  dv_prog_l: 'salida en cada % de progreso',
  dv_layr_s: 'capa',
  dv_layr_l: ['salida en cada', 'cambio de capa'],
  dv_tksp_s: 'espaciador de token',
  dv_tksp_l: [
    'agregar un espacio entre',
    'parámetros de eje de gcode',
    'G0X0Y0X0',
    'vs',
    'G0 X0 Y0 Z0',
  ],
  dv_strc_s: 'eliminar comentarios',
  dv_strc_l: [
    'eliminar comentarios de gcode',
    'los comentarios comienzan con ;',
  ],
  dv_fext_s: 'extensión de archivo',
  dv_fext_l: 'extensión de nombre de archivo',
  dv_dwll_s: 'permanencia',
  dv_dwll_l: 'secuencia de comandos gcode de permanencia',
  dv_tool_s: 'cambio de herramienta',
  dv_tool_l: 'secuencia de comandos de cambio de herramienta',
  dv_sspd_s: 'velocidad del husillo',
  dv_sspd_l: 'establecer la velocidad del husillo',
  dv_paus_s: 'pausa',
  dv_paus_l: 'secuencia de comandos gcode de pausa ',
  dv_head_s: 'encabezado',
  dv_head_l: 'secuencia de comandos gcode de encabezado',
  dv_foot_s: 'pie',
  dv_foot_l: 'secuencia de comandos gcode de pie',
  dv_lzon_s: 'laser activado',
  dv_lzon_l: 'secuencia de comandos gcode para activar laser',
  dv_lzof_s: 'laser desactivado',
  dv_lzof_l: 'secuencia de comandos gcode para desactivar laser',
  dv_exts_s: '',
  dv_exts_l: 'secuencia de comandos gcode para seleccionar este extrusor',
  dv_dext_s: 'deseleccionar',
  dv_dext_l: 'gcode ejecutado antes de habilitar otro extrusor',
  dv_extd_s: 'deseleccionar',
  dv_extd_l: 'secuencia de comandos gcode para deseleccionar este extrusor',
  dv_exox_s: 'compensación x x',
  dv_exox_l: 'compensación de boquilla x',
  dv_exoy_s: 'compensación x y',
  dv_exoy_l: 'compensación de boquilla y',

  // MODE
  mo_menu: 'modo',
  mo_fdmp: 'Impresión FDM',
  mo_slap: 'Impresión SLA',
  mo_lazr: 'Corte láser',
  mo_cncm: 'Fresadora CNC',

  // SETUP
  su_menu: 'configuración',
  su_devi: 'Dispositivos',
  su_tool: 'Herramientas',
  su_locl: 'Local',
  su_xprt: 'Exportar',
  su_help: 'Ayuda',

  // LOAD
  fe_menu: 'archivo',
  fn_recn: 'Reciente',
  fn_impo: 'Importar',

  // FUNCTION
  fn_menu: 'acción',
  fn_arra: 'Organizar',
  fn_slic: 'Cortar',
  fn_prev: 'Vista previa',
  fn_expo: 'Exportar',

  // VIEW
  vu_menu: 'ver',
  vu_home: 'Inicio',
  vu_rset: 'Restablecer',
  vu_sptp: 'Arriba',
  vu_spfr: 'Delantero',
  vu_splt: 'Izquierda',
  vu_sprt: 'Derecha',

  // WORKSPACE
  ws_menu: 'ver',
  ws_save: 'Guardar',
  ws_cler: 'Borrar',

  // OPTIONS
  op_menu: 'interfaz',
  op_disp: 'pantalla',
  op_xprt_s: 'experto',
  op_xprt_l: 'mostrar más opciones de configuración',
  op_decl_s: 'pegatinas',
  op_decl_l: 'mostrar pegatinas y logotipos del dispositivo',
  op_dang_s: 'experimental',
  op_dang_l: 'mostrar parámetros experimentales',
  op_hopo_s: 'menú flotante',
  op_hopo_l: ['habilitar el menú flotante', 'activar'],
  op_dark_s: 'modo oscuro',
  op_dark_l: 'interfaz de modo oscuro',
  op_comp_s: 'interfaz de usuario compacta',
  op_comp_l: [
    'interfaz de usuario compacta',
    'mejor para pantallas pequeñas',
    'y tabletas',
  ],
  op_shor_s: 'mostrar origen',
  op_shor_l: 'mostrar origen del dispositivo o proceso',
  op_shru_s: 'mostrar reglas',
  op_shru_l: ['mostrar reglas de ejes', 'en líneas de cuadrícula principales'],
  op_sped_s: 'mostrar velocidades',
  op_sped_l: [
    'mostrar velocidad en la barra de colores',
    'en modo de vista previa',
  ],
  op_auto_s: 'distribución automática',
  op_auto_l: [
    'plataforma de distribución automática',
    'cuando se agregan nuevos elementos',
  ],
  op_free_s: 'distribución libre',
  op_free_l: ['permitir distribución arrastrable', 'sin efecto en modo láser'],
  op_spcr_s: 'espaciado',
  op_spcr_l: [
    'espaciado entre objetos',
    'durante la distribución automática',
    'en unidades del espacio de trabajo',
  ],
  op_orth_s: 'ortográfica',
  op_orth_l: ['visualización ortográfica', 'requiere actualización de página'],
  op_invr_s: 'invertir zoom',
  op_invr_l: ['invertir rueda del mouse', 'zoom de desplazamiento'],
  op_save_s: 'guardado automático',
  op_save_l: [
    'preservar objetos en el espacio de trabajo',
    'entre recargas de aplicaciones',
  ],
  op_line_s: 'tipo de línea',
  op_line_l: [
    'tipo de línea para renderizado de caminos',
    'impacta el desempeño 3D',
    'camino: mejor para 3D',
    'plano: bueno para 2D',
    'línea = rápido para 1D',
  ],
  op_unit_s: 'unidades',
  op_unit_l: [
    'las unidades del espacio de trabajo afectan',
    'velocidades y distancias',
  ],
  op_anim_s: 'animar',
  op_anim_l: [
    'densidad de malla de animación',
    'mayor valor es más denso',
    'ocupa más memoria',
    'y es más lento',
  ],

  lo_menu: 'distribución',

  pt_menu: 'partes',
  pt_deci_s: 'diezmar',
  pt_deci_l: [
    'habilitar o deshabilitar el diezmado de puntos',
    'durante la importación del puerto para un corte más rápido',
    'y un menor uso de memoria',
  ],
  pt_qual_s: 'calidad',
  pt_qual_l: [
    'nivel de detalle a retener',
    'durante las operaciones de corte',
    'más bajo es más rápido',
  ],
  pt_heal_s: 'curar malla',
  pt_heal_l: [
    'intentar curar',
    'mallas no topológicas',
    'extiende el tiempo de corte',
  ],

  xp_menu: 'exportaciones',

  // SETTINGS
  se_menu: 'perfil',
  se_load: 'cargar',
  se_save: 'guardar',

  // FDM SLICING
  sl_menu: 'capas',
  sl_lahi_s: 'altura',
  sl_lahi_l: ['altura de cada sección', 'capa en milímetros'],
  ad_minl_s: 'altura mínima',
  ad_minl_l: [
    'altura mínima adaptativa de la capa',
    'en milímetros',
    'debe ser distinta de cero',
  ],
  sl_ltop_s: 'capas superiores',
  sl_ltop_l: [
    'cantidad de capas sólidas',
    'para hacer cumplir en la',
    'parte superior de la impresión',
  ],
  sl_lsld_s: 'capas sólidas',
  sl_lsld_l: [
    'áreas de relleno sólido calculadas',
    'de los deltas de capa. Ver',
    'menú flotante de capa',
  ],
  sl_lbot_s: 'capas base',
  sl_lbot_l: [
    'cantidad de capas sólidas',
    'para hacer cumplir en la',
    'parte inferior de la impresión',
  ],
  ad_adap_s: 'adaptable',
  ad_adap_l: [
    'usar alturas de capa adaptables',
    "con 'altura de capa' como máximo",
    "y 'min capa' como mínimo",
  ],

  // FDM SHELLS
  sl_shel_s: 'cantidad de cáscaras',
  sl_shel_l: ['cantidad de muros', 'perimetrales a generar'],
  sl_ordr_s: 'orden de cáscaras',
  sl_ordr_l: [
    'orden de cáscaras de salida',
    'de adentro hacia afuera',
    'o de afuera hacia adentro',
    'afecta la calidad de la superficie',
  ],
  sl_strt_s: 'inicio de la capa',
  sl_strt_l: [
    'punto de inicio de la capa',
    'última = último final de capa',
    'centro = centro de la parte',
    'origen = origen del dispositivo',
  ],
  ad_thin_s: 'paredes delgadas',
  ad_thin_l: ['detectar y rellenar huecos', 'entre las paredes de la carcasa'],

  // FDM FILL
  fi_menu: 'relleno',
  fi_type: 'tipo de relleno',
  fi_pcnt_s: 'fracción de relleno',
  fi_pcnt_l: ['valores de densidad de relleno', '0.0 - 1.0'],
  fi_angl_s: 'inicio sólido',
  fi_angl_l: [
    'ángulo de inicio en grados',
    '90 grados añadidos a ',
    'cada capa siguiente ',
    'se aplica solo a capas sólidas',
  ],
  fi_wdth_s: 'ancho sólido',
  fi_wdth_l: [
    'ancho de línea para relleno sólido',
    'como una fracción del ancho de la boquilla',
    'los valores < 1 son más densos',
    'y buenos para acabados superficiales',
    '0.0 - 1.0',
  ],
  fi_over_s: 'superposición de cáscara',
  fi_over_l: [
    'superposición con la cáscara y otro relleno',
    'como fracción del diámetro de la boquilla',
    '0.0 - 2.0',
  ],
  // fi_rate_s:      "velocidad de impresión",
  fi_rate_l: [
    'velocidad de extrusión del relleno',
    'establecido en 0 para utilizar las velocidades',
    'de salida de impresión predeterminadas',
  ],

  // FDM FIRST LAYER
  fl_menu: 'base',
  fl_lahi_s: 'altura de capa',
  fl_lahi_l: [
    'altura de cada rebanada',
    'en milímetros',
    'debe ser >= altura de rebanada',
  ],
  fl_rate_s: 'velocidad de la cáscara',
  fl_rate_l: [
    'velocidad máxima de impresión de la cáscara',
    'en milímetros/segundo',
  ],
  fl_frat_s: 'velocidad de llenado',
  fl_frat_l: [
    'velocidad máxima de impresión de llenado',
    'en milímetros / segundo',
  ],
  fl_mult_s: 'factor de flujo',
  fl_mult_l: ['multiplicador de extrusión', '0.0 - 2.0'],
  fl_sfac_s: 'factor de ancho',
  fl_sfac_l: [
    'multiplicador del tamaño de la boquilla',
    'cambia el espaciado de línea',
  ],
  fl_skrt_s: 'cantidad de faldones',
  fl_skrt_l: ['número de desfase de la primera capa', 'bordes a generar'],
  fl_skro_s: 'desfase de faldón',
  fl_skro_l: ['desfase de faldón de la pieza', 'en milímetros'],
  fl_nozl_s: 'temperatura de la boquilla',
  fl_nozl_l: [
    'en grados centígrados',
    'configuración de salida utilizada',
    'cuando es cero',
  ],
  fl_bedd_s: 'temperatura de la cama',
  fl_bedd_l: [
    'en grados centígrados',
    'configuración de salida utilizada',
    'cuando es cero',
  ],
  fr_spac_s: 'espacio de la balsa',
  fr_spac_l: [
    'espaciado de capa adicional',
    'entre la 1ra capa y la balsa',
    'en milímetros',
  ],
  fr_nabl_s: 'habilitar de balsa',
  fr_nabl_l: [
    'crear una balsa debajo del',
    'modelo para una mejor adherencia',
    'utiliza desplazamiento de faldón y',
    'inhabilita salida de falda',
  ],

  // FDM BELT ONLY
  fl_zoff_s: 'compensación de la banda',
  fl_zoff_l: [
    'compensación de la altura de la banda',
    'de la extrusión más baja',
    'en milímetros',
  ],
  fl_brim_s: 'tamaño del borde',
  fl_brim_l: [
    'agregar borde a la parte inferior',
    'el tamaño es el ancho en milímetros',
    '0 para deshabilitar',
  ],
  fl_brmn_s: 'gatillo de borde',
  fl_brmn_l: [
    'agregar bordes solo cuando el segmento',
    'que da a la cinta sea más corto que este',
    'valor en milímetros',
    '0 = Infinito',
  ],
  fl_bled_s: 'anclaje parcial',
  fl_bled_l: [
    'anclaje parcial del cinturón',
    'al inicio de la impresión',
    'en milímetros',
  ],

  // FDM SUPPORT
  sp_menu: 'soporte',
  sp_detect: 'detectar',
  sp_dens_s: 'densidad',
  sp_dens_l: ['fracción 0.0 - 1.0', 'recomendado 0.15', '0 para deshabilitar'],
  sp_size_s: 'tamaño del pilar',
  sp_size_l: ['ancho del pilar', 'en milímetros'],
  sp_offs_s: 'desplazamiento de la pieza',
  sp_offs_l: ['desplazamiento desde la pieza', 'en milímetros'],
  sp_gaps_s: 'capas de separación',
  sp_gaps_l: ['cantidad de capas', 'desplazamiento desde la parte'],
  sp_span_s: 'intervalo máximo',
  sp_span_l: [
    'intervalo no admitido que provoca',
    'la generación de un nuevo soporte',
    'en milímetros',
  ],
  sp_angl_s: 'ángulo máximo',
  sp_angl_l: [
    'ángulo máximo de voladizo antes',
    'de generar un pilar de soporte',
  ],
  sp_area_s: 'área mínima',
  sp_area_l: ['área mínima para', 'una columna de soporte', 'en milímetros'],
  sp_xpnd_s: 'expandir',
  sp_xpnd_l: [
    'expandir el área de soporte',
    'más allá del límite de la pieza',
    'en milímetros',
  ],
  sp_nozl_s: 'extrusora',
  sp_nozl_l: [
    'en sistemas de múltiples extrusoras',
    'la extrusora que se utilizará para',
    'material de soporte',
  ],
  sp_auto_s: 'automático',
  sp_auto_l: [
    'habilitar soportes generados',
    'usando geometría en tiempo de corte',
    'los soportes solo aparecerán',
    'después de que se complete el corte',
  ],

  // LASER SLICING
  ls_offs_s: 'desplazamiento',
  ls_offs_l: ['ajustar para ancho de viga', 'en milímetros'],
  ls_lahi_s: 'altura',
  ls_lahi_l: ['altura de capa', 'en milímetros', '0 = auto/detectar'],
  ls_lahm_s: 'mínimo',
  ls_lahm_l: [
    'altura de capa mínima',
    'fusionará cortes automáticos',
    'de menos de este grosor',
    'en milímetros',
  ],
  ls_sngl_s: 'único',
  ls_sngl_l: ['realizará solo un corte', 'a la altura de capa especificada'],

  // CNC COMMON terms
  cc_tool: 'herramienta',
  cc_offs_s: 'desplazamiento',
  cc_offs_l: [
    'desplazamiento del centro de la herramienta',
    'desde la ruta elegida',
  ],
  cc_spnd_s: 'rpm del husillo',
  cc_spnd_l: ['velocidad del husillo en', 'revoluciones/minuto'],
  cc_sovr_s: 'paso por encima',
  cc_sovr_l: ['como una fracción del', 'diámetro de la herramienta'],
  cc_sdwn_s: 'reducir paso',
  cc_sdwn_l: [
    'reducir la profundidad de paso',
    'para cada pasada',
    'en unidades de espacio de trabajo',
    '0 para deshabilitar',
  ],
  cc_feed_s: 'velocidad de avance',
  cc_feed_l: [
    'velocidad máxima de corte en',
    'unidades de espacio de trabajo / minuto',
  ],
  cc_plng_s: 'tasa de inmersión',
  cc_plng_l: [
    'velocidad máxima del eje z en',
    'unidades de espacio de trabajo / minuto',
  ],
  cc_sngl_s: 'seleccionar solo líneas',
  cc_sngl_l: [
    'seleccionar solo bordes individuales',
    'en lugar de polilíneas conectadas',
  ],

  // CNC COMMON
  cc_menu: 'límites',
  cc_flip: 'voltear',
  cc_rapd_s: 'avance xy',
  cc_rapd_l: [
    'velocidad máxima de movimientos xy',
    'en unidades de espacio de trabajo / minuto',
  ],
  cc_rzpd_s: 'avance z',
  cc_rzpd_l: [
    'velocidad máxima de movimientos z',
    'en unidades de espacio de trabajo / minuto',
  ],

  cc_loff_s: 'desplazamiento',
  cc_loff_l: [
    'distancia desde la superficie del material',
    'para pasada de nivelación',
    'en unidades de espacio de trabajo',
  ],

  // CNC ROUGHING
  cr_menu: 'desbaste',
  cr_lsto_s: 'dejar material',
  cr_lsto_l: [
    'desplazamiento horizontal de las caras verticale',
    'material para dejar para la pasada de acabado',
    'en unidades de espacio de trabajo',
  ],
  cr_ease_s: 'ease down',
  cr_ease_l: [
    'cortes de inmersión',
    'bajarán en espiral o suavizarán',
    'siguiendo una ruta lineal',
  ],
  cr_clrt_s: 'despejar la parte superior',
  cr_clrt_l: [
    'ejecutar una pasada de despeje',
    'por el área delimitante de la pieza',
    'en z = 0',
  ],
  cr_clrp_s: 'despejar huecos',
  cr_clrp_l: ['fresar a través de cavidades', 'en lugar de solo el contorno'],
  cr_clrf_s: 'limpiar caras',
  cr_clrf_l: [
    'interpolar el paso hacia abajo para',
    'limpiar las áreas planas detectadas',
  ],
  cr_olin_s: 'solo en el interior',
  cr_olin_l: ['limitar el corte a', 'los límites internos de la pieza'],

  // CNC OUTLINE
  co_menu: 'contorno',
  co_dogb_s: 'dogbones',
  co_dogb_l: [
    'insertar cortes de hueso de perro',
    'en las esquinas interiores',
  ],
  co_wide_s: 'recorte ancho',
  co_wide_l: [
    'ensanchar las rutas de corte exteriores',
    'para cortes profundos en material duro',
  ],
  co_olin_s: 'solo en el interior',
  co_olin_l: ['limitar el corte a', 'límites de la parte interior'],
  co_olot_s: 'sólo exterior',
  co_olot_l: [
    'limitar el corte a',
    'límites de la parte exterior',
    'que se pueden considerar',
    'como el contorno de la sombra',
  ],
  co_omit_s: 'omitir a través',
  co_omit_l: 'eliminar agujeros pasantes',
  co_olen_s: 'habilitar',
  co_olen_l: 'corte de contorno habilitado',

  // CNC CONTOUR
  cn_menu: 'contorno',
  cf_angl_s: 'ángulo máximo',
  cf_angl_l: ['ángulos mayores que este', 'se consideran verticales'],
  cf_curv_s: 'solo curvas',
  cf_curv_l: ['limitar la limpieza lineal', 'a superficies curvas'],
  cf_olin_s: 'solo interior',
  cf_olin_l: ['limitar el corte a', 'límites de la parte interior'],
  cf_linx_s: 'habilitar paso y',
  cf_linx_l: 'acabado lineal del eje y',
  cf_liny_s: 'habilitar paso x',
  cf_liny_l: 'acabado lineal del eje x',

  // CNC TRACE
  cu_menu: 'traza',
  cu_type_s: 'tipo',
  cu_type_l: [
    'seguir = la punta de la herramienta sigue la línea',
    'derecha o izquierda = punta de la herramienta',
    'sigue el desplazamiento de la línea por el radio de la herramienta',
  ],

  // CNC DRILLING
  cd_menu: 'taladrar',
  cd_axis: 'eje',
  cd_points: 'puntos',
  cd_plpr_s: 'inmersión por',
  cd_plpr_l: [
    'inmersión máxima entre',
    'períodos de permanencia',
    'en unidades de espacio de trabajo',
    '0 para deshabilitar',
  ],
  cd_dwll_s: 'tiempo de permanencia',
  cd_dwll_l: [
    'tiempo de permanencia',
    'entre inmersiones en',
    'en milisegundos',
  ],
  cd_lift_s: 'elevación de perforación',
  cd_lift_l: [
    'elevación entre inmersiones',
    'después del período de permanencia',
    'en unidades de espacio de trabajo',
    '0 para deshabilitar',
  ],
  cd_regi_s: 'registro',
  cd_regi_l: [
    'agujeros de registro de perforación',
    'para piezas de doble cara',
    'independiente de la habilitación',
    'del taladrado pero utiliza la misma',
    'herramienta y ajustes',
  ],

  // CNC CUTOUT TABS
  ct_menu: 'pestañas',
  ct_angl_s: 'ángulo',
  ct_angl_l: [
    'ángulo inicial para el espaciado de pestañas',
    'en grados (0-360)',
  ],
  ct_numb_s: 'cantidad',
  ct_numb_l: [
    'cantidad de pestañas a utilizar',
    'se espaciarán uniformemente',
    'alrededor de la pieza',
  ],
  ct_wdth_s: 'ancho',
  ct_wdth_l: 'ancho en unidades de espacio de trabajo',
  ct_hght_s: 'altura',
  ct_hght_l: 'altura en unidades de espacio de trabajo',
  ct_dpth_s: 'profundidad',
  ct_dpth_l: [
    'distancia en unidades de espacio de trabajo',
    'desde la que se proyecta la pestaña',
    'en la superficie de la pieza',
  ],
  ct_midl_s: 'línea media',
  ct_midl_l: [
    'usar línea media de la pestaña',
    'en lugar de fondo z',
    'para trabajo a doble cara',
  ],
  ct_nabl_s: 'auto',
  ct_nabl_l: [
    'autogenerar pestañas radiales',
    'proyectadas desde el centro de la pieza',
    'usando recuento y desplazamiento de ángulo',
  ],

  // OUTPUT
  ou_menu: 'salida',

  // LASER KNIFE
  dk_menu: 'cuchillo',
  dk_dpth_s: 'profundidad de corte',
  dk_dpth_l: ['profundidad de corte final', 'en milímetros'],
  dk_pass_s: 'pasadas de corte',
  dk_pass_l: ['cantidad de pasadas', 'hasta la profundidad de corte'],
  dk_offs_s: 'desplazamiento de la punta',
  dk_offs_l: [
    'distancia desde la punta de la hoja',
    'al centro de la herramienta',
    'en milímetros',
  ],

  // OUTPUT LASER
  ou_spac_s: 'espaciado',
  ou_spac_l: ['distancia entre la salida de la capa', 'en milímetros'],
  ou_scal_s: 'escala',
  ou_scal_l: 'multiplicador (0,1 a 100)',
  ou_powr_s: 'potencia',
  ou_powr_l: ['0 - 100', 'representa %'],
  ou_sped_s: 'velocidad',
  ou_sped_l: 'milímetros / segundo',
  ou_mrgd_s: 'fusionadas',
  ou_mrgd_l: [
    'fusionar todas las capas usando',
    'codificación de colores para indicar',
    'la profundidad de apilamiento',
  ],
  ou_grpd_s: 'agrupadas',
  ou_grpd_l: [
    'conservar cada capa como',
    'una agrupación unificada',
    'en lugar de polígonos',
    'separados',
  ],
  ou_layr_s: 'orden de las capas',
  ou_layr_l: [
    'oorden de las capas de salida',
    'de arriba a la derecha a',
    'abajo a la izquierda',
  ],
  ou_layo_s: 'color de la capa',
  ou_layo_l: [
    'colores de las capas de salida',
    'para cada índice z',
    'anulado por fusionado',
  ],
  ou_drkn_s: 'cuchillo de arrastre',
  ou_drkn_l: [
    'habilitar cuchillo de arrastre',
    'salida en gcode',
    'se agregan radios de corte',
    'a las esquinas con',
    'pasadas de corte',
  ],

  // OUTPUT FDM
  ou_nozl_s: 'temperatura de la boquilla',
  ou_nozl_l: 'en grados centígrados',
  ou_bedd_s: 'temperatura de la cama',
  ou_bedd_l: 'en grados centígrados',
  ou_feed_s: 'velocidad de impresión',
  ou_feed_l: ['velocidad máxima de impresión', 'milímetros / segundo'],
  ou_fini_s: 'velocidad de impresión',
  ou_fini_l: ['velocidad de la capa más externad', 'milímetros / segundo'],
  ou_move_s: 'velocidad de movimiento',
  ou_move_l: [
    'velocidad de movimiento sin impresión',
    'milímetros / segundo',
    '0 = habilitar movimientos G0',
  ],
  ou_shml_s: 'factor de cáscara',
  ou_flml_s: 'factor sólido',
  ou_spml_s: 'factor de relleno',
  ou_exml_l: ['multiplicador de extrusión', '0.0 - 2.0'],
  ou_fans_s: 'velocidad del ventilador',
  ou_fans_l: '0 - 255',

  // OUTPUT CAM
  ou_toll_s: 'tolerancia',
  ou_toll_l: [
    'precisión de superficie',
    'en unidades de espacio de trabajo',
    'menor es más lento y',
    'usa más memoria',
    '0 = basado en automático',
    'en preferencia animada',
  ],
  ou_zanc_s: 'ancla z',
  ou_zanc_l: [
    'controla el posición de la pieza',
    'cuando el material Z excede la parte Z',
  ],
  ou_ztof_s: 'desplazamiento z',
  ou_ztof_l: [
    'desplazar el ancla z',
    'en unidades de espacio de trabajo',
    'no tiene ningún efecto cuando',
    'el ancla está en el medio',
  ],
  ou_zbot_s: 'z inferior',
  ou_zbot_l: [
    'desplazamiento desde la parte inferior',
    'para limitar la profundidad de corte',
    'en unidades de espacio de trabajo',
  ],
  ou_zclr_s: 'espacio libre z',
  ou_zclr_l: [
    'desplazamiento seguro del recorrido',
    'desde la parte superior de la pieza',
    'en unidades de espacio de trabajo',
  ],
  ou_ztru_s: 'a través de z',
  ou_ztru_l: [
    'extender pasada de corte hacia abajo',
    'en unidades de espacio de trabajo',
  ],
  ou_conv_s: 'convencional',
  ou_conv_l: ['dirección de fresado', "desmarcar para 'subir'"],
  ou_depf_s: 'profundidad primero',
  ou_depf_l: ['optimizar cortes empotrados', 'con prioridad de profundidad'],

  // CAM STOCK
  cs_menu: 'material',
  cs_wdth_s: 'ancho',
  cs_wdth_l: [
    'ancho (x) en unidades del espacio de trabajo',
    '0 usa el tamaño de la pieza',
  ],
  cs_dpth_s: 'profundidad',
  cs_dpth_l: [
    'profundidad (y) en unidades de espacio de trabajo',
    '0 usa el tamaño de la pieza',
  ],
  cs_hght_s: 'altura',
  cs_hght_l: [
    'altura (z) en unidades de espacio de trabajo',
    '0 usa el tamaño de la pieza',
  ],
  cs_offs_s: 'desplazamiento',
  cs_offs_l: [
    'usar ancho, profundidad, altura',
    'como desplazamientos del tamaño',
    'máximo de pieza en la plataforma',
  ],
  cs_clip_s: 'recortar a',
  cs_clip_l: [
    'desbaste y delinear',
    'recortar rutas de corte',
    'al material definido',
  ],
  cs_offe_s: 'habilitar',
  cs_offe_l: 'habilitar material de fresado',

  // ORIGIN (CAM & LASER)
  or_bnds_s: 'límites de origen',
  or_bnds_l: ['origen relativo al', 'límite de todos los objetos'],
  or_cntr_s: 'centro de origen',
  or_cntr_l: 'origen referenciado desde el centro',
  or_topp_s: 'origen superior',
  or_topp_l: 'origen es referenciado desde la parte superior de los objetos',

  // FDM ADVANCED
  ad_menu: 'experto',
  ad_rdst_s: 'distancia de retracción',
  ad_rdst_l: [
    'cantidad de filamento a retraer',
    'para movimientos largos. en milímetros',
  ],
  ad_rrat_s: 'velocidad de retracción',
  ad_rrat_l: ['velocidad del filamento', 'retracción en mm/s'],
  ad_rdwl_s: 'activar el reposo',
  ad_wpln_s: 'retracción de barrido',
  ad_wpln_l: [
    'movimiento sin impresión',
    'después de la retracció',
    'en milímetros',
  ],
  ad_rdwl_l: [
    'tiempo hasta volver a activar',
    'filamento y movimiento',
    'en milisegundos',
  ],
  ad_scst_s: 'costa de la cáscara',
  ad_scst_l: [
    'extremo no imprimible',
    'de las cáscaras perimetrales',
    'en milímetros',
  ],
  ad_msol_s: 'mínimo sólido',
  ad_msol_l: [
    'área mínima (en mm^2)',
    'requerida para mantenerse sólido',
    'debe ser > 0.1',
  ],
  ad_mins_s: 'velocidad mínima',
  ad_mins_l: ['velocidad mínima', 'para segmentos cortos'],
  ad_spol_s: 'ruta corta',
  ad_spol_l: [
    'los polígonos más cortos que este',
    'tendrán su velocidad de impresión',
    'reducida a velocidad mínima',
    'en milímetros',
  ],
  ad_arct_s: 'tolerancia de arco',
  ad_arct_l: [
    'convertir líneas facetadas en arcos',
    'tolerancia de deriva del punto central',
    'al hacer coincidir puntos de arco',
    'considerar valores alrededor de 0.15',
    'en milímetros',
    '0 para deshabilitar',
  ],
  ad_zhop_s: 'distancia z de salto',
  ad_zhop_l: [
    'cantidad de elevación z',
    'en movimientos de retracción',
    'en milímetros',
    '0 para deshabilitar',
  ],
  ad_abkl_s: 'anti-retroceso',
  ad_abkl_l: [
    'para un mejor acabado de superficies planas',
    'usa micro-movimientos para cancelar',
    'el retroceso en salida de capas planas',
    'en milímetros',
    '0 para deshabilitar',
    'si su firmware tiene M425',
    'poner eso en el encabezado de gcode',
    'y dejar este valor 0',
  ],
  ad_lret_s: 'retraer la capa',
  ad_lret_l: ['forzar la retracción del filamento', 'entre capas'],
  ad_play_s: 'pulir capas',
  ad_play_l: ['pulir hasta el nivel especificado', 'número de capas a la vez'],
  ad_pspd_s: 'velocidad de pulido',
  ad_pspd_l: ['velocidad de pulido', 'en milímetros / minuto'],

  // CAM EXPERT
  cx_fast_s: 'omitir sombra',
  cx_fast_l: [
    'deshabilitar la detección de voladizos',
    'puede ser más rápido y usar menos',
    'memoria en modelos complejos',
    'pero falla con voladizos',
    'intente habilitar si al hacer cortes',
    'se cuelga durante el sombreado',
  ],

  // FDM GCODE
  ag_menu: 'gcode',
  ag_nozl_s: 'boquilla',
  ag_nozl_l: 'seleccionar boquilla o cabezal de salida',
  ag_peel_s: 'protector de desprendimiento',
  ag_peel_l: [
    'comenzando en esta posición z de la cinta',
    'enrollar periódicamente la impresión, y',
    'retroceder la cinta para despegarla',
    'y evitar la desviación rodante',
  ],
  ag_paws_s: 'capas de pausa',
  ag_paws_l: [
    'lista de capas separadas por comas',
    'antes de las cuales inyectar comandos de pausa',
  ],
  ag_loop_s: 'capas de bucle',
  ag_loop_l: [
    'rangos de capas para repetir en el formato',
    'primera-última-cuenta, primera-última-cuenta,...',
    'conteo omitido = 1',
  ],

  // SLA MENU
  sa_menu: 'corte',
  sa_lahe_s: 'altura de capa',
  sa_lahe_l: ['altura de capa', 'en milímetros'],
  sa_shel_s: 'cáscara hueca',
  sa_shel_l: [
    'espesor de capa en mm',
    'usar múltiplos de altura de capa',
    'usar 0 para sólido (deshabilitado)',
  ],
  sa_otop_s: 'parte superior abierta',
  sa_otop_l: [
    'si la cáscara está habilitada',
    'da como resultado una parte superior abierta',
  ],
  sa_obas_s: 'base abierta',
  sa_obas_l: [
    'si la cáscara está habilitada',
    'da como resultado una base abierta',
    'deshabilitado si se usan soportes',
  ],

  sa_layr_m: 'capas',
  sa_lton_s: 'luz de tiempo',
  sa_lton_l: ['luz de capa activada', 'tiempo en segundos'],
  sa_ltof_s: 'luz de tiempo desactivada',
  sa_ltof_l: ['luz de capa desactivada', 'tiempo en segundos'],
  sa_pldi_s: 'distancia de pelado',
  sa_pldi_l: ['distancia de pelado', 'en milímetros'],
  sa_pllr_s: 'tasa de elevación de pelado',
  sa_pllr_l: ['velocidad de elevación de pelado', 'en mm/sec'],
  sa_pldr_s: 'tasa de caída de pelado',
  sa_pldr_l: ['velocidad de caída de pelado', 'en mm/sec'],

  sa_base_m: 'base',
  sa_balc_s: 'recuento de capas',
  sa_balc_l: ['cantidad de', 'capas base'],
  sa_bltn_l: ['luz de la capa base activada', 'tiempo en segundos'],
  sa_bltf_l: ['luz de la capa base desactivada', 'tiempo en segundos'],

  sa_infl_m: 'relleno',
  sa_ifdn_s: 'densidad',
  sa_ifdn_l: [
    'porcentaje de relleno',
    'requiere cáscara',
    '0 = deshabilitado',
    'válido 0.0 - 1.0',
  ],
  sa_iflw_s: 'ancho de línea',
  sa_iflw_l: ['ancho de línea de trama', 'en milímetros'],

  sa_supp_m: 'soporte',
  sa_slyr_s: 'capas base',
  sa_slyr_l: ['capas base de soporte', 'rango de valores 0-10'],
  sa_slgp_s: 'capas de separación',
  sa_slgp_l: ['cantidad de capas entre', 'la balsa y fondo del objeto'],
  sa_sldn_s: 'densidad',
  sa_sldn_l: [
    'utilizada para calcular la',
    'cantidad de pilares de soporte',
    '0.0-1.0 (0 = deshabilitar)',
  ],
  sa_slsz_s: 'tamaño',
  sa_slsz_l: ['tamaño máximo de un', 'pilar de soporte', 'en milímetros'],
  sa_slpt_s: 'puntos',
  sa_slpt_l: [
    'cantidad de puntos en',
    'cada pilar de soporte',
    'en milímetros',
  ],
  sl_slen_l: 'habilitar soportes',

  sa_outp_m: 'salida',
  sa_opzo_s: 'desplazamiento z',
  sa_opzo_l: [
    'desplazamiento de capa z',
    'casi siempre es 0.0',
    '0.0-1.0 en milímetros',
  ],
  sa_opaa_s: 'suavizado',
  sa_opaa_l: [
    'acctivar suavizado',
    'produce archivos más grandes',
    'puede eliminar detalles',
  ],
}
