'use client';

import React, { useState } from 'react';
import {
  ParcelaData,
  evaluarEstadoCelda,
  calcularResumenParcela,
} from '../lib/finanzas';

interface MatrizHistoricaProps {
  parcelas: ParcelaData[];
  meses: string[];
  mesCorte: string;
  onEditPago?: (parcelaId: string, periodo: string, montoActual: number, exigido: number) => void;
}

/**
 * Matriz Histórica Interactiva 2022–2026+
 * - Código de colores: Verde (Pagado), Amarillo (Abono Parcial), Rojo (Impago), Gris (No aplica).
 */
export function MatrizHistorica({
  parcelas,
  meses,
  mesCorte,
  onEditPago,
}: MatrizHistoricaProps) {
  const [anioFiltro, setAnioFiltro] = useState<string>('2026');
  const [busqueda, setBusqueda] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'AL DÍA' | 'CON DEUDA'>('TODOS');

  const mesesVisibles =
    anioFiltro === 'TODOS' ? meses : meses.filter((m) => m.startsWith(anioFiltro));

  const parcelasFiltradas = parcelas.filter((p) => {
    const res = calcularResumenParcela(p, meses, mesCorte);
    const coincideTexto =
      p.numeroParcela.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.propietarioActual.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.propietarioAnterior || '').toLowerCase().includes(busqueda.toLowerCase());
    const coincideEstado =
      filtroEstado === 'TODOS' || res.estadoAlCorte === filtroEstado;
    return coincideTexto && coincideEstado;
  });

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {['2022', '2023', '2024', '2025', '2026', 'TODOS'].map((anio) => (
            <button
              key={anio}
              onClick={() => setAnioFiltro(anio)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                anioFiltro === anio
                  ? 'bg-emerald-900 text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {anio}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Buscar parcela o propietario..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="text-xs border border-stone-300 rounded-lg px-3 py-1.5"
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as any)}
            className="text-xs border border-stone-300 rounded-lg px-2.5 py-1.5"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="AL DÍA">Solo AL DÍA</option>
            <option value="CON DEUDA">Solo CON DEUDA</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-stone-900 text-stone-100">
              <th className="p-2.5 text-left sticky left-0 bg-stone-900 z-10">Parc.</th>
              <th className="p-2.5 text-left sticky left-14 bg-stone-900 z-10">Propietario</th>
              <th className="p-2.5 text-left">Condición</th>
              <th className="p-2.5 text-center">Estado ({mesCorte})</th>
              <th className="p-2.5 text-right">Deuda Corte</th>
              {mesesVisibles.map((m) => (
                <th key={m} className="p-2 text-center min-w-[78px]">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {parcelasFiltradas.map((p) => {
              const res = calcularResumenParcela(p, meses, mesCorte);
              return (
                <tr key={p.id} className="hover:bg-stone-50">
                  <td className="p-2 font-bold sticky left-0 bg-white">{p.numeroParcela}</td>
                  <td className="p-2 font-medium sticky left-14 bg-white">
                    {p.propietarioActual}
                  </td>
                  <td className="p-2">{p.condicion}</td>
                  <td className="p-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        res.estadoAlCorte === 'AL DÍA'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {res.estadoAlCorte}
                    </span>
                  </td>
                  <td className="p-2 text-right font-bold">
                    ${res.deudaAlCorte.toLocaleString('es-CL')}
                  </td>
                  {mesesVisibles.map((m) => {
                    const cel = evaluarEstadoCelda(p, m);
                    const bg =
                      cel.estado === 'PAGADO'
                        ? 'bg-emerald-50 text-emerald-800 font-semibold'
                        : cel.estado === 'ABONO_PARCIAL'
                        ? 'bg-amber-100 text-amber-900 font-bold'
                        : cel.estado === 'IMPAGO'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-stone-100 text-stone-400';

                    return (
                      <td
                        key={m}
                        onClick={() => onEditPago?.(p.id, m, cel.pagado, cel.exigido)}
                        className={`p-2 text-center cursor-pointer border-l border-stone-100 ${bg}`}
                      >
                        {cel.estado === 'NO_APLICA'
                          ? '—'
                          : cel.pagado > 0
                          ? `$${(cel.pagado / 1000).toFixed(0)}k`
                          : '$0'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
