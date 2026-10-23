'use client';

import React from 'react';
import {
  ParcelaData,
  calcularResumenParcela,
  verificarHabilitacionVoto,
} from '../lib/finanzas';

interface GobernanzaActasProps {
  actas: any[];
  votaciones: any[];
  normas: any[];
  parcelaActiva: ParcelaData;
  meses: string[];
  mesCorte: string;
  onEmitirVoto?: (votacionId: string, opcion: 'APRUEBO' | 'RECHAZO' | 'ABSTENCION') => void;
}

/**
 * MÓDULO D: Gobernanza Comunitaria, Libro Digital de Actas, Votaciones Vinculantes
 * con bloqueo parametrizable de morosos y Reglamento de Convivencia.
 */
export function GobernanzaActas({
  actas,
  votaciones,
  normas,
  parcelaActiva,
  meses,
  mesCorte,
  onEmitirVoto,
}: GobernanzaActasProps) {
  const resumenParcela = calcularResumenParcela(parcelaActiva, meses, mesCorte);

  return (
    <div className="space-y-8">
      {/* 1. Votaciones Vinculantes con Control de Morosidad */}
      <section className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-stone-900 mb-4">
          Sistema de Votaciones y Acuerdos Vinculantes
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {votaciones.map((v) => {
            const hab = verificarHabilitacionVoto(resumenParcela, v.restringirMorosos);
            return (
              <div
                key={v.id}
                className="border border-stone-200 rounded-xl p-4 flex flex-col justify-between bg-stone-50/50"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-emerald-900 text-white">
                      {v.materiaExtraordinaria ? 'Materia Extraordinaria' : 'Consulta General'}
                    </span>
                    <span className="text-xs text-stone-500">Cierre: {v.fechaCierre}</span>
                  </div>
                  <h4 className="font-bold text-stone-900">{v.titulo}</h4>
                  <p className="text-xs text-stone-600 mt-1">{v.descripcion}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-200">
                  {hab.habilitado ? (
                    <div className="flex items-center gap-2">
                      {(['APRUEBO', 'RECHAZO', 'ABSTENCION'] as const).map((op) => (
                        <button
                          key={op}
                          onClick={() => onEmitirVoto?.(v.id, op)}
                          className="flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg bg-emerald-800 text-white hover:bg-emerald-900"
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                      <strong>Solo Derecho a Voz:</strong> {hab.motivo}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Libro Digital de Actas de Asambleas */}
      <section className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-stone-900 mb-4">
          Libro Digital de Actas de Asambleas
        </h3>
        <div className="space-y-4">
          {actas.map((a) => (
            <div key={a.id} className="border border-stone-200 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-emerald-800">{a.numeroActa}</span>
                  <h4 className="font-bold text-stone-900">{a.titulo}</h4>
                </div>
                <div className="text-xs text-stone-600">
                  Fecha: <strong>{a.fecha}</strong> | Quórum: <strong>{a.quorumPorcentaje}%</strong>
                </div>
              </div>
              <p className="text-xs text-stone-600 mt-2">{a.resumenDeliberacion}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Reglamento de Copropiedad y Normas de Convivencia */}
      <section className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-stone-900 mb-4">
          Reglamento de Copropiedad y Normas de Convivencia
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {normas.map((n) => (
            <div key={n.id} className="p-4 rounded-xl border border-stone-200 bg-stone-50">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900 mb-1">
                <span>{n.codigo}</span>
                <span>Multa ref: ${n.sancionSugerida.toLocaleString('es-CL')}</span>
              </div>
              <h4 className="font-bold text-sm text-stone-900">{n.titulo}</h4>
              <p className="text-xs text-stone-600 mt-1">{n.descripcion}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
