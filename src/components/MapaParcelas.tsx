'use client';

import React, { useState } from 'react';
import {
  ParcelaData,
  ResumenFinancieroParcela,
  calcularResumenParcela,
} from '../lib/finanzas';

interface MapaParcelasProps {
  parcelas: ParcelaData[];
  meses: string[];
  mesCorte: string;
  rolUsuario: 'ADMIN' | 'VECINO';
  onSelectParcela?: (parcela: ParcelaData, resumen: ResumenFinancieroParcela) => void;
}

/**
 * MÓDULO A: Geolocalización y Mapa Interactivo de Parcelas (GIS / Leaflet + Polígonos)
 * - Vista Administrador: Semáforo financiero en tiempo real (Verde = Al Día, Rojo = Con Deuda).
 * - Vista Copropietario: Vista anonimizada (protege privacidad financiera vecinal, destacando condición Con Casa / Sin Casa / Sin Agua).
 */
export function MapaParcelas({
  parcelas,
  meses,
  mesCorte,
  rolUsuario,
  onSelectParcela,
}: MapaParcelasProps) {
  const [filtroSector, setFiltroSector] = useState<string>('TODOS');
  const [parcelaActiva, setParcelaActiva] = useState<ParcelaData | null>(parcelas[0] || null);

  const sectores = Array.from(new Set(parcelas.map((p) => p.sector || 'Sector General')));
  const parcelasFiltradas = parcelas.filter(
    (p) => filtroSector === 'TODOS' || p.sector === filtroSector
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              Catastro GIS Interactivo — Loteo Los Mañíos
            </h3>
            <p className="text-xs text-stone-500">
              {rolUsuario === 'ADMIN'
                ? 'Modo Comité: Semáforo financiero activo (Verde = Al Día | Rojo = Con Deuda)'
                : 'Modo Vecino: Mapa catastral con privacidad financiera protegida'}
            </p>
          </div>
          <select
            value={filtroSector}
            onChange={(e) => setFiltroSector(e.target.value)}
            className="text-sm rounded-lg border border-stone-300 px-3 py-1.5 bg-stone-50"
          >
            <option value="TODOS">Todos los sectores ({parcelas.length})</option>
            {sectores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
          {parcelasFiltradas.map((p) => {
            const res = calcularResumenParcela(p, meses, mesCorte);
            const alDia = res.deudaAlCorte <= 0;
            const colorClase =
              rolUsuario === 'ADMIN'
                ? alDia
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                  : 'bg-rose-50 border-rose-400 text-rose-950'
                : p.condicion === 'Con Casa'
                ? 'bg-emerald-50/70 border-emerald-300 text-stone-800'
                : 'bg-amber-50/70 border-amber-300 text-stone-800';

            return (
              <button
                key={p.id}
                onClick={() => {
                  setParcelaActiva(p);
                  onSelectParcela?.(p, res);
                }}
                className={`p-3 rounded-xl border-2 text-left transition hover:scale-[1.02] ${colorClase}`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Parc. {p.numeroParcela}</span>
                  <span>
                    {p.condicion === 'Con Casa'
                      ? '🏠'
                      : p.condicion === 'Sin Agua'
                      ? '🚱'
                      : '🌲'}
                  </span>
                </div>
                <div className="text-[11px] font-medium truncate mt-1">
                  {p.propietarioActual}
                </div>
                <div className="text-[10px] opacity-80 mt-0.5">{p.condicion}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ficha técnica de la parcela seleccionada */}
      <div className="bg-stone-900 text-stone-100 rounded-2xl p-5 shadow-md">
        {parcelaActiva ? (
          (() => {
            const res = calcularResumenParcela(parcelaActiva, meses, mesCorte);
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-stone-700 pb-3">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-emerald-400">
                      {parcelaActiva.sector}
                    </span>
                    <h4 className="text-xl font-bold">
                      Parcela {parcelaActiva.numeroParcela}
                    </h4>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-800 text-emerald-300">
                    {parcelaActiva.condicion}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-stone-400">Propietario Actual:</span>
                    <span className="font-semibold">{parcelaActiva.propietarioActual}</span>
                  </div>
                  {parcelaActiva.propietarioAnterior && (
                    <div className="flex justify-between">
                      <span className="text-stone-400">Dueño Anterior:</span>
                      <span className="text-amber-300">{parcelaActiva.propietarioAnterior}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-stone-400">Inicio Cobro:</span>
                    <span>{parcelaActiva.inicioCobro}</span>
                  </div>
                  {parcelaActiva.fechaPasoConCasa && (
                    <div className="flex justify-between">
                      <span className="text-stone-400">Paso a Con Casa:</span>
                      <span className="text-emerald-300">{parcelaActiva.fechaPasoConCasa}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-stone-400">Superficie Catastral:</span>
                    <span>{(parcelaActiva.superficieM2 || 5000).toLocaleString('es-CL')} m²</span>
                  </div>
                </div>

                {rolUsuario === 'ADMIN' && (
                  <div className="pt-3 border-t border-stone-700 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-stone-400">Estado al Corte ({mesCorte}):</span>
                      <span
                        className={`font-bold ${
                          res.estadoAlCorte === 'AL DÍA' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {res.estadoAlCorte}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400">Deuda Acumulada:</span>
                      <span className="font-bold">
                        ${res.deudaAlCorte.toLocaleString('es-CL')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <p className="text-sm text-stone-400">Seleccione una parcela en el mapa.</p>
        )}
      </div>
    </div>
  );
}
