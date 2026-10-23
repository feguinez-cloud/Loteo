// ============================================================================
// MOTOR DE REGLAS FINANCIERAS Y CONTABLES - LOTEO LOS MAÑÍOS
// ============================================================================

export type CondicionParcela = 'Con Casa' | 'Sin Casa' | 'Sin Agua' | '3 Parcelas';

export interface ParcelaData {
  id: string;
  ordenFila: number;
  numeroParcela: string;
  propietarioActual: string;
  propietarioAnterior?: string;
  condicion: CondicionParcela;
  inicioCobro: string;            // "YYYY-MM"
  fechaPasoConCasa: string | null; // "YYYY-MM" | null
  cuotaActual: number;
  observaciones?: string;
  sector?: string;
  superficieM2?: number;
  latitud?: number;
  longitud?: number;
  poligono?: [number, number][];
  telefonoContacto?: string;
  emailContacto?: string;
  pinAcceso?: string;
  pagos: Record<string, number>;
}

export interface ResumenFinancieroParcela {
  parcelaId: string;
  numeroParcela: string;
  propietarioActual: string;
  condicion: CondicionParcela;
  cuotaVigenteMesCorte: number;
  totalDevengadoAlCorte: number;
  totalPagadoAlCorte: number;
  deudaAlCorte: number;
  estadoAlCorte: 'AL DÍA' | 'CON DEUDA';
  pagosAdelantadosPostCorte: number;
  totalPagadoHistorico: number;
  mesesImpagosCount: number;
  mesesAbonoParcialCount: number;
  detalleMesesPendientes: Array<{
    periodo: string;
    exigido: number;
    pagado: number;
    saldoPendiente: number;
    tipo: 'IMPAGO' | 'ABONO_PARCIAL';
  }>;
}

export type EstadoCeldaMes = 'NO_APLICA' | 'PAGADO' | 'ABONO_PARCIAL' | 'IMPAGO';

/**
 * Calcula la cuota mensual exigida para una parcela en un periodo "YYYY-MM"
 * respetando los 3 tramos históricos y la regla de Fecha de Paso a Con Casa.
 */
export function calcularCuotaExigida(parcela: ParcelaData, periodo: string): number {
  if (!parcela.inicioCobro || periodo < parcela.inicioCobro) {
    return 0;
  }

  const esTresParcelas = parcela.condicion === '3 Parcelas';

  // Tramo 1: Abril 2022 a Diciembre 2022 ($15.000 / mes)
  if (periodo >= '2022-04' && periodo <= '2022-12') {
    return esTresParcelas ? 45000 : 15000;
  }

  // Tramo 2: Enero 2023 a Mayo 2025 ($20.000 / mes)
  if (periodo >= '2023-01' && periodo <= '2025-05') {
    return esTresParcelas ? 60000 : 20000;
  }

  // Tramo 3: Junio 2025 en adelante
  if (esTresParcelas) {
    return 100000;
  }

  if (parcela.condicion === 'Con Casa') {
    // Si tiene fecha de paso a Con Casa posterior a Junio 2025, antes de esa fecha paga $30.000
    if (parcela.fechaPasoConCasa && periodo < parcela.fechaPasoConCasa) {
      return 30000;
    }
    return 40000;
  }

  // "Sin Casa" y "Sin Agua" pagan $30.000 desde Junio 2025
  return 30000;
}

/**
 * Evalúa el estado visual y contable de una celda (parcela x mes).
 */
export function evaluarEstadoCelda(
  parcela: ParcelaData,
  periodo: string
): {
  estado: EstadoCeldaMes;
  exigido: number;
  pagado: number;
  diferencia: number;
} {
  const exigido = calcularCuotaExigida(parcela, periodo);
  const pagado = Number(parcela.pagos?.[periodo] || 0);

  if (exigido === 0 && pagado === 0) {
    return { estado: 'NO_APLICA', exigido: 0, pagado: 0, diferencia: 0 };
  }
  if (pagado >= exigido) {
    return { estado: 'PAGADO', exigido, pagado, diferencia: 0 };
  }
  if (pagado > 0 && pagado < exigido) {
    return { estado: 'ABONO_PARCIAL', exigido, pagado, diferencia: exigido - pagado };
  }
  return { estado: 'IMPAGO', exigido, pagado: 0, diferencia: exigido };
}

/**
 * Calcula el estado de cuenta completo de una parcela a una fecha de corte ("YYYY-MM").
 */
export function calcularResumenParcela(
  parcela: ParcelaData,
  todosLosMeses: string[],
  mesCorte: string
): ResumenFinancieroParcela {
  const mesesAlCorte = todosLosMeses.filter((m) => m <= mesCorte);
  const mesesPostCorte = todosLosMeses.filter((m) => m > mesCorte);

  let totalDevengadoAlCorte = 0;
  let totalPagadoAlCorte = 0;
  let mesesImpagosCount = 0;
  let mesesAbonoParcialCount = 0;
  const detalleMesesPendientes: ResumenFinancieroParcela['detalleMesesPendientes'] = [];

  for (const m of mesesAlCorte) {
    const { estado, exigido, pagado, diferencia } = evaluarEstadoCelda(parcela, m);
    totalDevengadoAlCorte += exigido;
    totalPagadoAlCorte += pagado;

    if (estado === 'IMPAGO') {
      mesesImpagosCount++;
      detalleMesesPendientes.push({
        periodo: m,
        exigido,
        pagado: 0,
        saldoPendiente: diferencia,
        tipo: 'IMPAGO',
      });
    } else if (estado === 'ABONO_PARCIAL') {
      mesesAbonoParcialCount++;
      detalleMesesPendientes.push({
        periodo: m,
        exigido,
        pagado,
        saldoPendiente: diferencia,
        tipo: 'ABONO_PARCIAL',
      });
    }
  }

  let pagosAdelantadosPostCorte = 0;
  for (const m of mesesPostCorte) {
    pagosAdelantadosPostCorte += Number(parcela.pagos?.[m] || 0);
  }

  const deudaAlCorte = totalDevengadoAlCorte - totalPagadoAlCorte;
  const cuotaVigenteMesCorte = calcularCuotaExigida(parcela, mesCorte);

  return {
    parcelaId: parcela.id,
    numeroParcela: parcela.numeroParcela,
    propietarioActual: parcela.propietarioActual,
    condicion: parcela.condicion,
    cuotaVigenteMesCorte,
    totalDevengadoAlCorte,
    totalPagadoAlCorte,
    deudaAlCorte,
    estadoAlCorte: deudaAlCorte <= 0 ? 'AL DÍA' : 'CON DEUDA',
    pagosAdelantadosPostCorte,
    totalPagadoHistorico: totalPagadoAlCorte + pagosAdelantadosPostCorte,
    mesesImpagosCount,
    mesesAbonoParcialCount,
    detalleMesesPendientes,
  };
}

/**
 * Verifica si una parcela puede emitir voto en una acuerdo comunitario
 * según el estado de morosidad al corte y la configuración del acuerdo.
 */
export function verificarHabilitacionVoto(
  resumen: ResumenFinancieroParcela,
  restringirMorosos: boolean
): { habilitado: boolean; motivo: string } {
  if (restringirMorosos && resumen.deudaAlCorte > 0) {
    return {
      habilitado: false,
      motivo: `Inhabilitado para votar en materias extraordinarias por mantener saldo pendiente al corte ($${resumen.deudaAlCorte.toLocaleString('es-CL')}). Conserva derecho a voz según Reglamento.`,
    };
  }
  return {
    habilitado: true,
    motivo: 'Parcela habilitada con plenos derechos de voz y voto.',
  };
}

/**
 * Genera el enlace directo de WhatsApp (wa.me) con mensaje personalizado
 * para recordatorio preventivo, aviso de morosidad o comprobante validado.
 */
export function generarLinkWhatsAppRecordatorio(
  parcela: ParcelaData,
  resumen: ResumenFinancieroParcela,
  mesCorte: string
): string {
  const fono = (parcela.telefonoContacto || '+56900000000').replace(/[^0-9]/g, '');
  let texto = '';

  if (resumen.deudaAlCorte <= 0) {
    texto =
      `Hola ${parcela.propietarioActual} (Parcela ${parcela.numeroParcela} - Loteo Los Mañíos). ` +
      `Te confirmamos que tu estado de cuenta al corte (${mesCorte}) se encuentra *AL DÍA* ` +
      `(Total pagado: $${resumen.totalPagadoHistorico.toLocaleString('es-CL')}). ¡Muchas gracias por tu compromiso con la comunidad!`;
  } else {
    const ultimosPendientes = resumen.detalleMesesPendientes
      .slice(-4)
      .map((d) => `${d.periodo} ($${d.saldoPendiente.toLocaleString('es-CL')})`)
      .join(', ');
    texto =
      `Hola ${parcela.propietarioActual}, te escribimos de la Administración del *Loteo Los Mañíos* (Parcela ${parcela.numeroParcela}). ` +
      `Al corte de *${mesCorte}*, tu cuenta registra un saldo pendiente de *$${resumen.deudaAlCorte.toLocaleString('es-CL')}* ` +
      `(${resumen.mesesImpagosCount} meses impagos y ${resumen.mesesAbonoParcialCount} con abono parcial; ej: ${ultimosPendientes}). ` +
      `Puedes informar tu transferencia en el Portal del Vecino. ¡Muchas gracias!`;
  }

  return `https://wa.me/${fono}?text=${encodeURIComponent(texto)}`;
}
