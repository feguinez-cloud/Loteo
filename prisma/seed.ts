// ============================================================================
// PRISMA SEEDER - CARGA DE LOS 4 LIBROS REALES DEL LOTEO LOS MAÑÍOS
// ============================================================================
import { PrismaClient, CondicionParcela } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { calcularCuotaExigida } from '../src/lib/finanzas';

const prisma = new PrismaClient();

function mapCondicion(cond: string): CondicionParcela {
  if (cond === 'Con Casa') return CondicionParcela.CON_CASA;
  if (cond === 'Sin Agua') return CondicionParcela.SIN_AGUA;
  if (cond === '3 Parcelas') return CondicionParcela.TRES_PARCELAS;
  return CondicionParcela.SIN_CASA;
}

async function main() {
  const dataPath = path.join(__dirname, '..', 'src', 'data', 'manios_real_data.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log('Iniciando carga de datos reales Loteo Los Mañíos...');

  // 1. Cargar Base Histórica Mensual Congelada (Hoja 2 Fila 44: $28.450.000)
  for (const [periodo, monto] of Object.entries(raw.baseHistorica)) {
    await prisma.baseHistoricaMes.upsert({
      where: { periodo },
      update: { montoCongelado: Number(monto) },
      create: { periodo, montoCongelado: Number(monto) },
    });
  }

  // 2. Cargar las 37 filas de Parcelas, Propietarios Históricos y Pagos Mensuales (2022-2026)
  for (const p of raw.parcelas) {
    const parcela = await prisma.parcela.upsert({
      where: { ordenFila: p.ordenFila },
      update: {
        numeroParcela: p.numeroParcela,
        condicion: mapCondicion(p.condicion),
        inicioCobro: p.inicioCobro,
        fechaPasoConCasa: p.fechaPasoConCasa,
        propietarioActual: p.propietarioActual,
        propietarioAnterior: p.propietarioAnterior || null,
        latitud: p.latitud,
        longitud: p.longitud,
        poligonoGeoJson: p.poligono,
        observaciones: p.observaciones || null,
      },
      create: {
        id: p.id,
        ordenFila: p.ordenFila,
        numeroParcela: p.numeroParcela,
        condicion: mapCondicion(p.condicion),
        inicioCobro: p.inicioCobro,
        fechaPasoConCasa: p.fechaPasoConCasa,
        propietarioActual: p.propietarioActual,
        propietarioAnterior: p.propietarioAnterior || null,
        latitud: p.latitud,
        longitud: p.longitud,
        poligonoGeoJson: p.poligono,
        observaciones: p.observaciones || null,
      },
    });

    for (const mes of raw.meses) {
      const devengado = calcularCuotaExigida(p, mes);
      const pagado = Number(p.pagos?.[mes] || 0);
      if (devengado > 0 || pagado > 0) {
        await prisma.pagoMensual.upsert({
          where: {
            parcelaId_periodo: {
              parcelaId: parcela.id,
              periodo: mes,
            },
          },
          update: {
            montoDevengado: devengado,
            montoPagado: pagado,
          },
          create: {
            parcelaId: parcela.id,
            periodo: mes,
            montoDevengado: devengado,
            montoPagado: pagado,
          },
        });
      }
    }
  }

  // 3. Cargar Egresos Reales (Hoja 3: $3.687.538)
  for (const e of raw.egresos) {
    await prisma.egreso.upsert({
      where: { id: e.id },
      update: {
        item: e.item,
        fecha: e.fecha,
        destino: e.destino,
        monto: Number(e.monto),
        observaciones: e.observaciones,
      },
      create: {
        id: e.id,
        item: e.item,
        fecha: e.fecha,
        destino: e.destino,
        monto: Number(e.monto),
        observaciones: e.observaciones,
      },
    });
  }

  // 4. Cargar Otros Ingresos Extras (Hoja 4: $1.196.000)
  for (const o of raw.otrosIngresos) {
    await prisma.otroIngreso.upsert({
      where: { id: o.id },
      update: {
        item: o.item,
        fecha: o.fecha,
        destino: o.destino,
        monto: Number(o.monto),
        observaciones: o.observaciones,
        pagadoEnCaja: o.pagadoEnCaja !== false,
      },
      create: {
        id: o.id,
        item: o.item,
        fecha: o.fecha,
        destino: o.destino,
        monto: Number(o.monto),
        observaciones: o.observaciones,
        pagadoEnCaja: o.pagadoEnCaja !== false,
      },
    });
  }

  console.log('Seed completado exitosamente con el 100% de los datos de Loteo Los Mañíos.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
