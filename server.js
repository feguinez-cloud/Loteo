// ============================================================================
// SERVIDOR LOCAL FULL-STACK - SISTEMA INTEGRAL "LOTEO LOS MAÑÍOS"
// Ejecución inmediata sin dependencias pesadas (node server.js)
// Persistencia en tiempo real sobre src/data/manios_real_data.json
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3050;
const SEED_DATA_PATH = path.join(__dirname, 'src', 'data', 'manios_real_data.json');
const DATA_PATH = process.env.DATA_PATH || SEED_DATA_PATH;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_ACTAS_DIR = process.env.UPLOADS_DIR || path.join(PUBLIC_DIR, 'uploads', 'actas');

fs.mkdirSync(UPLOADS_ACTAS_DIR, { recursive: true });
if (DATA_PATH !== SEED_DATA_PATH && !fs.existsSync(DATA_PATH)) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.copyFileSync(SEED_DATA_PATH, DATA_PATH);
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function calcularCuotaExigidaServer(parcela, periodo) {
  if (!parcela.inicioCobro || periodo < parcela.inicioCobro) return 0;
  const esTres = parcela.condicion === '3 Parcelas';
  if (periodo >= '2022-04' && periodo <= '2022-12') return esTres ? 45000 : 15000;
  if (periodo >= '2023-01' && periodo <= '2025-05') return esTres ? 60000 : 20000;
  if (esTres) return 100000;
  if (parcela.condicion === 'Con Casa') {
    if (parcela.fechaPasoConCasa && periodo < parcela.fechaPasoConCasa) return 30000;
    return 40000;
  }
  return 30000;
}

function revertirImputacionComprobante(parcela, comp) {
  if (!parcela || !comp || !Array.isArray(comp.desgloseImputacion)) return;
  for (const item of comp.desgloseImputacion) {
    const actual = Number(parcela.pagos[item.periodo] || 0);
    const nuevo = actual - Number(item.monto || 0);
    if (nuevo <= 0) {
      delete parcela.pagos[item.periodo];
    } else {
      parcela.pagos[item.periodo] = nuevo;
    }
  }
  comp.desgloseImputacion = [];
}

function imputarPagoEnParcela(parcela, montoTotal, periodoPreferido, mesCorte, listaMeses) {
  let restante = Number(montoTotal || 0);
  if (restante <= 0 || !parcela) return { desglose: [], textoResumen: '' };

  const desglose = [];
  const mesesAlCorte = (listaMeses || []).filter((m) => m <= mesCorte);
  const mesesPostCorte = (listaMeses || []).filter((m) => m > mesCorte);

  const abonarEnMes = (periodo, montoMax) => {
    if (restante <= 0 || montoMax <= 0) return;
    const abono = Math.min(restante, montoMax);
    const actual = Number(parcela.pagos[periodo] || 0);
    parcela.pagos[periodo] = actual + abono;
    restante -= abono;
    const existente = desglose.find((d) => d.periodo === periodo);
    if (existente) {
      existente.monto += abono;
    } else {
      desglose.push({ periodo, monto: abono });
    }
  };

  // 1. Si el usuario eligió un mes específico <= mesCorte que tiene saldo pendiente, priorizar ese mes primero
  if (periodoPreferido && periodoPreferido !== 'AUTO_DEUDA' && periodoPreferido <= mesCorte) {
    const exigidoPref = calcularCuotaExigidaServer(parcela, periodoPreferido);
    const pagadoPref = Number(parcela.pagos[periodoPreferido] || 0);
    const pendientePref = Math.max(0, exigidoPref - pagadoPref);
    if (pendientePref > 0) {
      abonarEnMes(periodoPreferido, pendientePref);
    }
  }

  // 2. Si aún queda monto por imputar, cubrir meses con deuda o abono parcial hasta el mes de corte (del más antiguo al más reciente)
  for (const m of mesesAlCorte) {
    if (restante <= 0) break;
    const exigido = calcularCuotaExigidaServer(parcela, m);
    const pagado = Number(parcela.pagos[m] || 0);
    const pendiente = Math.max(0, exigido - pagado);
    if (pendiente > 0) {
      abonarEnMes(m, pendiente);
    }
  }

  // 3. Si la parcela ya quedó 100% al día hasta el corte y aún queda saldo a favor:
  //    Si eligió un mes futuro (> mesCorte), empezar allí; luego continuar en los meses post-corte
  if (restante > 0 && periodoPreferido && periodoPreferido !== 'AUTO_DEUDA' && periodoPreferido > mesCorte) {
    const exigidoFut = calcularCuotaExigidaServer(parcela, periodoPreferido);
    const pagadoFut = Number(parcela.pagos[periodoPreferido] || 0);
    const cupoFut = Math.max(exigidoFut - pagadoFut, restante);
    abonarEnMes(periodoPreferido, cupoFut);
  }

  for (const m of mesesPostCorte) {
    if (restante <= 0) break;
    const exigido = calcularCuotaExigidaServer(parcela, m);
    const pagado = Number(parcela.pagos[m] || 0);
    const pendiente = Math.max(0, exigido - pagado);
    if (pendiente > 0) {
      abonarEnMes(m, pendiente);
    }
  }

  // 4. Si aún quedara remanente, sumarlo al mes de corte o al periodo preferido
  if (restante > 0) {
    const destinoFinal =
      periodoPreferido && periodoPreferido !== 'AUTO_DEUDA' ? periodoPreferido : mesCorte;
    abonarEnMes(destinoFinal, restante);
  }

  const textoResumen = desglose
    .map((d) => `${d.periodo} ($${Number(d.monto).toLocaleString('es-CL')})`)
    .join(', ');

  return { desglose, textoResumen };
}

function recalcularProyectos(data) {
  if (Array.isArray(data.proyectosComunitarios)) {
    for (const pr of data.proyectosComunitarios) {
      const gastosVinculados = (data.egresos || [])
        .filter((e) => e.proyectoId === pr.id)
        .reduce((acc, e) => acc + Number(e.monto || 0), 0);
      const aportesVinculados = (data.otrosIngresos || [])
        .filter((o) => o.proyectoId === pr.id && o.pagadoEnCaja !== false)
        .reduce((acc, o) => acc + Number(o.monto || 0), 0);

      pr.montoEjecutado = gastosVinculados;
      pr.montoRecaudadoExtra = aportesVinculados;
    }
  }

  // Normalizar comprobantes ya validados que quedaron en meses post-corte o con sobrepago en un mes teniendo deuda en el corte
  const mesCorte = data.configuracion?.mesCorteActivo || '2026-10';
  if (Array.isArray(data.comprobantesInformados) && Array.isArray(data.parcelas)) {
    for (const comp of data.comprobantesInformados) {
      if (comp.estado === 'VALIDADO' && !comp.desgloseImputacion) {
        const parcela = data.parcelas.find((p) => p.id === comp.parcelaId);
        if (!parcela) continue;
        if (comp.periodoDestino > mesCorte) {
          const montoPost = Number(parcela.pagos[comp.periodoDestino] || 0);
          if (montoPost >= Number(comp.monto || 0)) {
            const resto = montoPost - Number(comp.monto || 0);
            if (resto <= 0) delete parcela.pagos[comp.periodoDestino];
            else parcela.pagos[comp.periodoDestino] = resto;
            const resImp = imputarPagoEnParcela(parcela, comp.monto, 'AUTO_DEUDA', mesCorte, data.meses);
            comp.desgloseImputacion = resImp.desglose;
            if (resImp.desglose.length > 0) {
              comp.periodoDestino = resImp.desglose[0].periodo;
              comp.periodosCubiertos = resImp.textoResumen;
            }
          }
        } else if (comp.id === 'comp-1' && Number(parcela.pagos['2025-05'] || 0) === 40000) {
          parcela.pagos['2025-05'] = 20000;
          parcela.pagos['2025-06'] = Number(parcela.pagos['2025-06'] || 0) + 20000;
          comp.desgloseImputacion = [
            { periodo: '2025-05', monto: 20000 },
            { periodo: '2025-06', monto: 20000 },
          ];
          comp.periodosCubiertos = '2025-05 ($20.000), 2025-06 ($20.000)';
        }
      }
    }
  }

  // Normalizar citaciones y verificar cierre automático de votaciones por plazo
  const hoy = new Date().toISOString().slice(0, 10);
  if (Array.isArray(data.citacionesAsamblea)) {
    for (const c of data.citacionesAsamblea) {
      c.fechaReunion = c.fechaReunion || c.fecha || hoy;
      c.fecha = c.fechaReunion;
      c.lugarOEnlace = c.lugarOEnlace || c.lugarEnlace || 'Acceso Principal Loteo Los Mañíos';
      c.lugarEnlace = c.lugarOEnlace;
    }
  }
  if (Array.isArray(data.votacionesAcuerdos)) {
    for (const v of data.votacionesAcuerdos) {
      if (v.estado === 'ABIERTA' && v.fechaCierre && v.fechaCierre < hoy) {
        v.estado = 'CERRADA';
        v.cierreAutomaticoPorPlazo = true;
      }
    }
  }
}

function writeData(data) {
  recalcularProyectos(data);
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // 1. Obtener estado completo de la comunidad
    if (req.method === 'GET' && url.pathname === '/api/data') {
      const data = readData();
      writeData(data);
      return sendJson(res, 200, data);
    }

    // 2. Actualizar pago mensual, condición o datos del dueño de una parcela
    if (req.method === 'POST' && url.pathname === '/api/pago') {
      const body = await parseBody(req);
      const data = readData();
      const parcela = data.parcelas.find((p) => p.id === body.parcelaId);
      if (!parcela) return sendJson(res, 404, { error: 'Parcela no encontrada' });

      if (body.periodo) {
        const monto = Number(body.monto || 0);
        if (monto <= 0) {
          delete parcela.pagos[body.periodo];
        } else {
          parcela.pagos[body.periodo] = monto;
        }
      }
      if (body.propietarioActual !== undefined) parcela.propietarioActual = body.propietarioActual;
      if (body.propietarioAnterior !== undefined) parcela.propietarioAnterior = body.propietarioAnterior;
      if (body.condicion) parcela.condicion = body.condicion;
      if (body.inicioCobro) parcela.inicioCobro = body.inicioCobro;
      if (body.fechaPasoConCasa !== undefined) {
        parcela.fechaPasoConCasa = body.fechaPasoConCasa || null;
      }
      if (body.observaciones !== undefined) parcela.observaciones = body.observaciones;

      writeData(data);
      return sendJson(res, 200, { ok: true, data });
    }

    // 3. Informar Comprobante (Vecino) o Validar/Rechazar/Eliminar Comprobante (Admin)
    if (req.method === 'POST' && url.pathname === '/api/comprobante') {
      const body = await parseBody(req);
      const data = readData();
      const mesCorte = body.mesCorte || data.configuracion?.mesCorteActivo || '2026-10';
      if (body.mesCorte && data.configuracion) {
        data.configuracion.mesCorteActivo = body.mesCorte;
      }

      if (body.accion === 'CREAR') {
        const parcela = data.parcelas.find((p) => p.id === body.parcelaId);
        if (!parcela) return sendJson(res, 404, { error: 'Parcela no encontrada' });

        const perDest = body.periodoDestino || 'AUTO_DEUDA';
        const nuevo = {
          id: 'comp-' + Date.now(),
          parcelaId: parcela.id,
          numeroParcela: parcela.numeroParcela,
          propietario: parcela.propietarioActual,
          fechaTransferencia: body.fechaTransferencia || new Date().toISOString().slice(0, 10),
          monto: Number(body.monto || 0),
          bancoOrigen: body.bancoOrigen || 'Transferencia Bancaria',
          numeroOperacion: body.numeroOperacion || 'S/N',
          periodosCubiertos:
            perDest === 'AUTO_DEUDA'
              ? 'Automático (Deuda más antigua al corte)'
              : body.periodosCubiertos || perDest,
          periodoDestino: perDest,
          estado: body.autoValidar ? 'VALIDADO' : 'PENDIENTE',
          observacionesVecino: body.observacionesVecino || '',
        };

        if (body.autoValidar) {
          const resImp = imputarPagoEnParcela(
            parcela,
            nuevo.monto,
            nuevo.periodoDestino,
            mesCorte,
            data.meses
          );
          nuevo.desgloseImputacion = resImp.desglose;
          if (resImp.desglose.length > 0) {
            nuevo.periodoDestino = resImp.desglose[0].periodo;
            nuevo.periodosCubiertos = resImp.textoResumen;
          }
          nuevo.fechaValidacion = new Date().toISOString().slice(0, 10);
        }

        data.comprobantesInformados.unshift(nuevo);
        writeData(data);
        return sendJson(res, 200, { ok: true, data, comprobante: nuevo });
      }

      if (body.accion === 'ELIMINAR' && body.comprobanteId) {
        const comp = data.comprobantesInformados.find((c) => c.id === body.comprobanteId);
        if (comp) {
          const parcela = data.parcelas.find((p) => p.id === comp.parcelaId);
          if (comp.estado === 'VALIDADO' && parcela) {
            revertirImputacionComprobante(parcela, comp);
          }
          data.comprobantesInformados = data.comprobantesInformados.filter(
            (c) => c.id !== body.comprobanteId
          );
          writeData(data);
        }
        return sendJson(res, 200, { ok: true, data });
      }

      if (body.accion === 'CONCILIAR') {
        const comp = data.comprobantesInformados.find((c) => c.id === body.comprobanteId);
        if (!comp) return sendJson(res, 404, { error: 'Comprobante no encontrado' });

        const parcela = data.parcelas.find((p) => p.id === comp.parcelaId);

        // Si ya estaba validado antes, revertimos su imputación previa antes de recalcular
        if (comp.estado === 'VALIDADO' && parcela && Array.isArray(comp.desgloseImputacion)) {
          revertirImputacionComprobante(parcela, comp);
        }

        if (body.periodoDestino) {
          comp.periodoDestino = body.periodoDestino;
        }

        comp.estado = body.nuevoEstado;
        if (body.nuevoEstado === 'VALIDADO' && parcela) {
          const resImp = imputarPagoEnParcela(
            parcela,
            comp.monto,
            comp.periodoDestino,
            mesCorte,
            data.meses
          );
          comp.desgloseImputacion = resImp.desglose;
          if (resImp.desglose.length > 0) {
            comp.periodoDestino = resImp.desglose[0].periodo;
            comp.periodosCubiertos = resImp.textoResumen;
          }
          comp.fechaValidacion = new Date().toISOString().slice(0, 10);
        }

        writeData(data);
        return sendJson(res, 200, { ok: true, data, comprobante: comp });
      }
    }

    // 4. Registrar nuevo Egreso (Hoja 3 y vínculo con Proyectos Comunitarios)
    if (req.method === 'POST' && url.pathname === '/api/egreso') {
      const body = await parseBody(req);
      const data = readData();
      const proy = (data.proyectosComunitarios || []).find((p) => p.id === body.proyectoId);
      const nuevo = {
        id: 'egr-' + Date.now(),
        item: body.item,
        fecha: body.fecha || new Date().toISOString().slice(0, 10),
        destino: body.destino || '',
        monto: Number(body.monto || 0),
        observaciones: body.observaciones || '',
        proyectoId: body.proyectoId || '',
        proyectoTitulo: proy ? proy.titulo : 'Gasto Operativo General',
      };
      data.egresos.push(nuevo);
      writeData(data);
      return sendJson(res, 200, { ok: true, data });
    }

    // 5. Registrar nuevo Otro Ingreso Extra (Hoja 4 y vínculo con Proyectos)
    if (req.method === 'POST' && url.pathname === '/api/otro-ingreso') {
      const body = await parseBody(req);
      const data = readData();
      const proy = (data.proyectosComunitarios || []).find((p) => p.id === body.proyectoId);
      const nuevo = {
        id: 'oing-' + Date.now(),
        item: body.item,
        fecha: body.fecha || new Date().toISOString().slice(0, 10),
        destino: body.destino || (proy ? proy.titulo : ''),
        monto: Number(body.monto || 0),
        observaciones: body.observaciones || '',
        pagadoEnCaja: body.pagadoEnCaja !== false,
        proyectoId: body.proyectoId || '',
        proyectoTitulo: proy ? proy.titulo : 'Fondo General',
      };
      data.otrosIngresos.push(nuevo);
      writeData(data);
      return sendJson(res, 200, { ok: true, data });
    }

    // 6. Gestión de Proyectos Comunitarios (Crear nuevo o actualizar estado/fondo común)
    if (req.method === 'POST' && url.pathname === '/api/proyecto') {
      const body = await parseBody(req);
      const data = readData();

      if (body.accion === 'CREAR') {
        const nuevo = {
          id: 'proy-' + Date.now(),
          titulo: body.titulo,
          categoria: body.categoria || 'Infraestructura Comunitaria',
          descripcion: body.descripcion || '',
          objetivoTecnico: body.objetivoTecnico || '',
          metaFinanciera: Number(body.metaFinanciera || 0),
          montoRecaudadoExtra: 0,
          aporteFondoComun: Number(body.aporteFondoComun || 0),
          montoEjecutado: 0,
          estado: body.estado || 'EN_EJECUCION',
          fechaInicio: body.fechaInicio || new Date().toISOString().slice(0, 10),
          fechaTermino: body.fechaTermino || '',
          responsable: body.responsable || 'Comité de Administración',
          votosAprobacion: 1,
          votosTotales: 1,
        };
        data.proyectosComunitarios.unshift(nuevo);
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      if (body.accion === 'ACTUALIZAR' || body.accion === 'ACTUALIZAR_ESTADO') {
        const pr = data.proyectosComunitarios.find((p) => p.id === body.proyectoId);
        if (!pr) return sendJson(res, 404, { error: 'Proyecto no encontrado' });
        if (body.estado) pr.estado = body.estado;
        if (body.metaFinanciera !== undefined) pr.metaFinanciera = Number(body.metaFinanciera);
        if (body.aporteFondoComun !== undefined) pr.aporteFondoComun = Number(body.aporteFondoComun);
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }
    }

    // 7. Gestión de Citaciones a Reuniones / Asambleas (Módulo D: CREAR, EDITAR, ELIMINAR)
    if (req.method === 'POST' && url.pathname === '/api/citacion') {
      const body = await parseBody(req);
      const data = readData();
      if (!data.citacionesAsamblea) data.citacionesAsamblea = [];

      if (body.accion === 'ELIMINAR') {
        data.citacionesAsamblea = data.citacionesAsamblea.filter((c) => c.id !== body.citacionId);
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      const tablaTemas = Array.isArray(body.tablaTemas)
        ? body.tablaTemas
        : String(body.tablaTemas || '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
      const fechaVal = body.fechaReunion || body.fecha || new Date().toISOString().slice(0, 10);
      const lugarVal = body.lugarOEnlace || body.lugarEnlace || 'Acceso Principal Loteo Los Mañíos + Sala Online';

      if (body.accion === 'EDITAR' && body.citacionId) {
        const cit = data.citacionesAsamblea.find((c) => c.id === body.citacionId);
        if (!cit) return sendJson(res, 404, { error: 'Citación no encontrada' });
        if (body.numeroCitacion !== undefined) cit.numeroCitacion = body.numeroCitacion;
        if (body.tipo !== undefined) cit.tipo = body.tipo;
        if (body.titulo !== undefined) cit.titulo = body.titulo;
        cit.fecha = fechaVal;
        cit.fechaReunion = fechaVal;
        if (body.horaPrimeraCitacion !== undefined) cit.horaPrimeraCitacion = body.horaPrimeraCitacion;
        if (body.horaSegundaCitacion !== undefined) cit.horaSegundaCitacion = body.horaSegundaCitacion;
        if (body.modalidad !== undefined) cit.modalidad = body.modalidad;
        cit.lugarEnlace = lugarVal;
        cit.lugarOEnlace = lugarVal;
        if (tablaTemas.length) cit.tablaTemas = tablaTemas;
        if (body.estado !== undefined) cit.estado = body.estado;
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      const nueva = {
        id: 'cit-' + Date.now(),
        numeroCitacion: body.numeroCitacion || `Citación N° 0${data.citacionesAsamblea.length + 1}/2026`,
        tipo: body.tipo || 'ORDINARIA',
        titulo: body.titulo,
        fecha: fechaVal,
        fechaReunion: fechaVal,
        horaPrimeraCitacion: body.horaPrimeraCitacion || '19:00',
        horaSegundaCitacion: body.horaSegundaCitacion || '19:30',
        modalidad: body.modalidad || 'HIBRIDA',
        lugarEnlace: lugarVal,
        lugarOEnlace: lugarVal,
        tablaTemas,
        estado: body.estado || 'PROGRAMADA',
        creadoPor: 'Comité de Administración',
      };
      data.citacionesAsamblea.unshift(nueva);
      writeData(data);
      return sendJson(res, 200, { ok: true, data });
    }

    // 8. Subir / Crear / Eliminar Acta de Asamblea (con soporte de archivo PDF adjunto)
    if (req.method === 'POST' && url.pathname === '/api/acta') {
      const body = await parseBody(req);
      const data = readData();
      if (!data.actasAsamblea) data.actasAsamblea = [];

      if (body.accion === 'ELIMINAR') {
        data.actasAsamblea = data.actasAsamblea.filter((a) => a.id !== body.actaId);
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      let pdfUrl = body.documentoPdfUrl || '';
      const rawB64 = body.pdfBase64 || body.archivoPdfBase64;
      const rawName = body.pdfNombre || body.archivoPdfNombre;
      if (rawB64 && rawName) {
        const cleanName = Date.now() + '_' + rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const base64Data = rawB64.replace(/^data:application\/pdf;base64,/, '');
        fs.writeFileSync(path.join(UPLOADS_ACTAS_DIR, cleanName), Buffer.from(base64Data, 'base64'));
        pdfUrl = '/uploads/actas/' + cleanName;
      }

      const parcelasPresentes = Number(body.parcelasPresentes || 30);
      const totalParcelas = data.parcelas.length || 37;
      const quorumPorcentaje = Number(((parcelasPresentes / totalParcelas) * 100).toFixed(1));

      const acuerdosArr = Array.isArray(body.acuerdos)
        ? body.acuerdos
        : String(body.acuerdosTexto || '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((linea, idx) => ({
              codigo: `AC-0${idx + 1}`,
              texto: linea,
              responsable: body.responsableAcuerdos || 'Comité Administración',
              plazo: 'Ejecución vigente',
              estado: 'APROBADO',
            }));

      const ordenArr = Array.isArray(body.ordenDelDia)
        ? body.ordenDelDia
        : String(body.ordenDelDiaTexto || '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);

      const nuevaActa = {
        id: 'acta-' + Date.now(),
        numeroActa: body.numeroActa || `Acta N° 0${data.actasAsamblea.length + 1}/2026`,
        titulo: body.titulo,
        tipo: body.tipo || 'ORDINARIA',
        modalidad: body.modalidad || 'HIBRIDA',
        fecha: body.fecha || new Date().toISOString().slice(0, 10),
        horaInicio: body.horaInicio || '19:00',
        horaCierre: body.horaCierre || '21:00',
        parcelasPresentes,
        totalParcelas,
        quorumPorcentaje,
        resumenDeliberacion: body.resumenDeliberacion || '',
        ordenDelDia: ordenArr,
        acuerdos: acuerdosArr,
        documentoPdfUrl: pdfUrl,
        documentoPdfNombre: rawName || '',
        firmantesComite: body.firmantesComite || ['Presidente Comité', 'Tesorero', 'Secretario'],
        firmadoComite: true,
      };

      data.actasAsamblea.unshift(nuevaActa);
      writeData(data);
      return sendJson(res, 200, { ok: true, data });
    }

    // 8.B Gestión del Reglamento de Convivencia (CREAR, EDITAR, ELIMINAR Normas por el Admin)
    if (req.method === 'POST' && url.pathname === '/api/norma-convivencia') {
      const body = await parseBody(req);
      const data = readData();
      if (!data.normasConvivencia) data.normasConvivencia = [];

      if (body.accion === 'ELIMINAR') {
        data.normasConvivencia = data.normasConvivencia.filter((n) => n.id !== body.normaId);
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      if (body.accion === 'EDITAR' && body.normaId) {
        const norma = data.normasConvivencia.find((n) => n.id === body.normaId);
        if (!norma) return sendJson(res, 404, { error: 'Norma no encontrada' });
        if (body.codigo !== undefined) norma.codigo = body.codigo;
        if (body.categoria !== undefined) norma.categoria = body.categoria;
        if (body.titulo !== undefined) norma.titulo = body.titulo;
        if (body.descripcion !== undefined) norma.descripcion = body.descripcion;
        if (body.sancionSugerida !== undefined) norma.sancionSugerida = Number(body.sancionSugerida || 0);
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      const nuevaNorma = {
        id: 'norma-' + Date.now(),
        codigo: body.codigo || `ART-0${data.normasConvivencia.length + 1}`,
        categoria: body.categoria || 'Convivencia General',
        titulo: body.titulo,
        descripcion: body.descripcion || '',
        sancionSugerida: Number(body.sancionSugerida || 30000),
      };
      data.normasConvivencia.push(nuevaNorma);
      writeData(data);
      return sendJson(res, 200, { ok: true, data });
    }

    // 9. Crear Nueva Votación, Editar Fecha/Datos o Cambiar Estado de Votación (Módulo D)
    if (req.method === 'POST' && url.pathname === '/api/votacion') {
      const body = await parseBody(req);
      const data = readData();

      if (body.accion === 'CREAR') {
        const nueva = {
          id: 'vot-' + Date.now(),
          actaId: body.actaId || '',
          titulo: body.titulo,
          descripcion: body.descripcion || '',
          materiaExtraordinaria: body.materiaExtraordinaria !== false,
          restringirMorosos: body.restringirMorosos !== false,
          fechaCierre: body.fechaCierre || '2026-12-31',
          estado: 'ABIERTA',
          votosEmitidos: [],
        };
        data.votacionesAcuerdos.unshift(nueva);
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      if (body.accion === 'TOGGLE_ESTADO') {
        const vot = data.votacionesAcuerdos.find((v) => v.id === body.votacionId);
        if (!vot) return sendJson(res, 404, { error: 'Votación no encontrada' });
        vot.estado = vot.estado === 'ABIERTA' ? 'CERRADA' : 'ABIERTA';
        if (vot.estado === 'ABIERTA' && vot.fechaCierre < new Date().toISOString().slice(0, 10)) {
          // Si el admin reabre manualmente una votación vencida, extiende fecha cierre 7 días por defecto
          const d = new Date();
          d.setDate(d.getDate() + 7);
          vot.fechaCierre = d.toISOString().slice(0, 10);
        }
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      if (body.accion === 'CAMBIAR_FECHA') {
        const vot = data.votacionesAcuerdos.find((v) => v.id === body.votacionId);
        if (!vot) return sendJson(res, 404, { error: 'Votación no encontrada' });
        vot.fechaCierre = body.fechaCierre;
        const hoy = new Date().toISOString().slice(0, 10);
        vot.estado = vot.fechaCierre < hoy ? 'CERRADA' : 'ABIERTA';
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      if (body.accion === 'EDITAR' && body.votacionId) {
        const vot = data.votacionesAcuerdos.find((v) => v.id === body.votacionId);
        if (!vot) return sendJson(res, 404, { error: 'Votación no encontrada' });
        if (body.titulo !== undefined) vot.titulo = body.titulo;
        if (body.descripcion !== undefined) vot.descripcion = body.descripcion;
        if (body.fechaCierre !== undefined) vot.fechaCierre = body.fechaCierre;
        if (body.materiaExtraordinaria !== undefined) vot.materiaExtraordinaria = Boolean(body.materiaExtraordinaria);
        if (body.restringirMorosos !== undefined) vot.restringirMorosos = Boolean(body.restringirMorosos);
        const hoy = new Date().toISOString().slice(0, 10);
        if (vot.fechaCierre && vot.fechaCierre < hoy) vot.estado = 'CERRADA';
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      if (body.accion === 'ELIMINAR') {
        data.votacionesAcuerdos = data.votacionesAcuerdos.filter((v) => v.id !== body.votacionId);
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }
    }

    // 10. Emitir Voto en Acuerdo Vinculante (Módulo D)
    if (req.method === 'POST' && url.pathname === '/api/voto') {
      const body = await parseBody(req);
      const data = readData();
      const votacion = data.votacionesAcuerdos.find((v) => v.id === body.votacionId);
      const parcela = data.parcelas.find((p) => p.id === body.parcelaId);
      if (!votacion || !parcela) return sendJson(res, 404, { error: 'Votación o parcela no encontrada' });
      if (votacion.estado === 'CERRADA') {
        return sendJson(res, 400, { error: 'La votación ya se encuentra cerrada.' });
      }

      votacion.votosEmitidos = votacion.votosEmitidos.filter(
        (ve) => ve.parcelaId !== parcela.id
      );
      votacion.votosEmitidos.push({
        parcelaId: parcela.id,
        numeroParcela: parcela.numeroParcela,
        propietario: parcela.propietarioActual,
        opcion: body.opcion,
        fecha: new Date().toISOString().slice(0, 10),
      });
      writeData(data);
      return sendJson(res, 200, { ok: true, data });
    }

    // 11. Reporte de Convivencia / Cursar Multa vinculada a Otros Ingresos (Módulo D)
    if (req.method === 'POST' && url.pathname === '/api/reporte-convivencia') {
      const body = await parseBody(req);
      const data = readData();

      if (body.accion === 'ELIMINAR') {
        data.reportesConvivencia = (data.reportesConvivencia || []).filter((r) => r.id !== body.reporteId);
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      if (body.accion === 'EDITAR' && body.reporteId) {
        const rep = (data.reportesConvivencia || []).find((r) => r.id === body.reporteId);
        if (!rep) return sendJson(res, 404, { error: 'Reporte no encontrado' });
        if (body.categoria !== undefined) rep.categoria = body.categoria;
        if (body.parcelaInfractoraId !== undefined) {
          rep.parcelaInfractoraId = body.parcelaInfractoraId;
          const pInf = data.parcelas.find((p) => p.id === body.parcelaInfractoraId);
          if (pInf) rep.parcelaInfractoraTexto = `Parcela ${pInf.numeroParcela} (${pInf.propietarioActual})`;
        }
        if (body.descripcion !== undefined) rep.descripcion = body.descripcion;
        if (body.resolucionComite !== undefined) rep.resolucionComite = body.resolucionComite;
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      if (body.accion === 'CREAR') {
        const parcelaInf = data.parcelas.find((p) => p.id === body.parcelaInfractoraId);
        const nuevo = {
          id: 'rep-' + Date.now(),
          fechaIncidente: body.fechaIncidente || '2026-10-22',
          categoria: body.categoria || 'Vialidad y Caminos Interiores',
          parcelaReportante: body.parcelaReportante || 'Comité de Administración',
          parcelaInfractoraId: body.parcelaInfractoraId,
          parcelaInfractoraTexto: parcelaInf
            ? `Parcela ${parcelaInf.numeroParcela} (${parcelaInf.propietarioActual})`
            : 'Parcela Reportada',
          descripcion: body.descripcion,
          estado: 'EN_MEDIACION',
          resolucionComite: 'En evaluación por el Comité de Convivencia.',
          montoMulta: Number(body.montoMulta || 30000),
          pagadoEnCaja: false,
        };
        data.reportesConvivencia.unshift(nuevo);
        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }

      if (body.accion === 'RATIFICAR_MULTA') {
        const rep = data.reportesConvivencia.find((r) => r.id === body.reporteId);
        if (!rep) return sendJson(res, 404, { error: 'Reporte no encontrado' });

        rep.estado = 'MULTA_CURSADA';
        rep.montoMulta = Number(body.montoMulta || 30000);
        rep.pagadoEnCaja = Boolean(body.pagadoEnCaja);
        rep.resolucionComite =
          body.resolucionComite ||
          `Multa ratificada por Comité ($${rep.montoMulta.toLocaleString('es-CL')}).`;

        data.otrosIngresos.push({
          id: 'oing-multa-' + Date.now(),
          item: `Multa Convivencia - ${rep.parcelaInfractoraTexto}`,
          fecha: new Date().toISOString().slice(0, 10),
          destino: 'Fondo Común / Convivencia',
          monto: rep.montoMulta,
          observaciones: `${rep.categoria}: ${rep.resolucionComite}`,
          pagadoEnCaja: rep.pagadoEnCaja,
          proyectoId: '',
          proyectoTitulo: 'Fondo General',
        });

        writeData(data);
        return sendJson(res, 200, { ok: true, data });
      }
    }

    // 12. Actualizar Ficha Completa del Propietario, Datos de Parcela y Seguridad de Portón (Módulo E)
    if (req.method === 'POST' && url.pathname === '/api/perfil-seguridad') {
      const body = await parseBody(req);
      const data = readData();
      const parcela = data.parcelas.find((p) => p.id === body.parcelaId);
      if (!parcela) return sendJson(res, 404, { error: 'Parcela no encontrada' });

      if (body.numeroParcela !== undefined && body.numeroParcela.trim() !== '') {
        parcela.numeroParcela = body.numeroParcela.trim();
      }
      if (body.propietarioActual !== undefined) parcela.propietarioActual = body.propietarioActual;
      if (body.rutPropietario !== undefined) parcela.rutPropietario = body.rutPropietario;
      if (body.propietarioAnterior !== undefined) parcela.propietarioAnterior = body.propietarioAnterior;
      if (body.condicion !== undefined) parcela.condicion = body.condicion;
      if (body.inicioCobro !== undefined) parcela.inicioCobro = body.inicioCobro;
      if (body.fechaPasoConCasa !== undefined) parcela.fechaPasoConCasa = body.fechaPasoConCasa || null;
      if (body.observaciones !== undefined) parcela.observaciones = body.observaciones;
      if (body.rolSii !== undefined) parcela.rolSii = body.rolSii;
      if (body.superficieM2 !== undefined) parcela.superficieM2 = Number(body.superficieM2);

      if (body.telefonoContacto !== undefined) parcela.telefonoContacto = body.telefonoContacto;
      if (body.telefonoSecundario !== undefined) parcela.telefonoSecundario = body.telefonoSecundario;
      if (body.emailContacto !== undefined) parcela.emailContacto = body.emailContacto;
      if (body.pinAcceso !== undefined) parcela.pinAcceso = body.pinAcceso;
      if (body.rolAccesoSistema !== undefined) parcela.rolAccesoSistema = body.rolAccesoSistema;

      if (!parcela.seguridadPorton) {
        parcela.seguridadPorton = {
          controlesManualesCount: 2,
          controlesDetalle: [],
          telefonosConectadosCount: 1,
          cupoMaximoTelefonos: 4,
          telefonosPorton: [],
          tieneCambioPropietario: Boolean(parcela.propietarioAnterior),
          accesosDuenoAnteriorRevocados: true,
        };
      }

      if (body.controlesManualesCount !== undefined) {
        const cant = Math.max(0, Number(body.controlesManualesCount));
        parcela.seguridadPorton.controlesManualesCount = cant;
        const det = [];
        for (let c = 1; c <= cant; c++) {
          det.push({
            codigo: `RF-P${parcela.numeroParcela.replace(/[^a-zA-Z0-9]/g, '')}-0${c}`,
            asignadoA: c === 1 ? `${parcela.propietarioActual} (Titular)` : `Vehículo Familiar #${c}`,
            estado: 'ACTIVO',
          });
        }
        parcela.seguridadPorton.controlesDetalle = det;
      }

      if (Array.isArray(body.telefonosPorton)) {
        parcela.seguridadPorton.telefonosPorton = body.telefonosPorton;
        parcela.seguridadPorton.telefonosConectadosCount = body.telefonosPorton.filter(
          (t) => t.activo !== false
        ).length;
      }

      if (body.accesosDuenoAnteriorRevocados !== undefined) {
        parcela.seguridadPorton.accesosDuenoAnteriorRevocados = Boolean(
          body.accesosDuenoAnteriorRevocados
        );
      }

      writeData(data);
      return sendJson(res, 200, { ok: true, data });
    }

    // 13. Servir archivos PDF de Actas subidas (/uploads/actas/*)
    if (req.method === 'GET' && url.pathname.startsWith('/uploads/actas/')) {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(UPLOADS_ACTAS_DIR, fileName);
      if (fs.existsSync(filePath)) {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    // 14. Servir el Plano Oficial de Subdivisión (PDF)
    if (req.method === 'GET' && url.pathname === '/plano-subdivision.pdf') {
      const pdfPath = path.join(__dirname, 'Plano de Subdivision.pdf');
      if (fs.existsSync(pdfPath)) {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(pdfPath).pipe(res);
        return;
      }
    }

    // 15. Servir la aplicación SPA (public/index.html)
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(fs.readFileSync(indexPath, 'utf8'));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`🌲 Sistema Loteo Los Mañíos activo en: http://localhost:${PORT}`);
  console.log(`================================================================`);
});
