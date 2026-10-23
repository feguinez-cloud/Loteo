'use client';

import React, { useState } from 'react';
import rawData from '../data/manios_real_data.json';
import {
  ParcelaData,
  calcularResumenParcela,
  generarLinkWhatsAppRecordatorio,
} from '../lib/finanzas';
import { MapaParcelas } from '../components/MapaParcelas';
import { MatrizHistorica } from '../components/MatrizHistorica';
import { GobernanzaActas } from '../components/GobernanzaActas';

export default function LoteoLosManiosPage() {
  const [rol, setRol] = useState<'ADMIN' | 'VECINO'>('ADMIN');
  const [tab, setTab] = useState<'DASHBOARD' | 'MATRIZ' | 'MAPA' | 'PROYECTOS' | 'GOBERNANZA'>('DASHBOARD');
  const [mesCorte, setMesCorte] = useState<string>(rawData.configuracion.mesCorteActivo);
  const parcelas = rawData.parcelas as unknown as ParcelaData[];
  const [parcelaVecino, setParcelaVecino] = useState<ParcelaData>(parcelas[0]);

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900 p-6">
      <header className="max-w-7xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-4 bg-emerald-950 text-stone-100 p-5 rounded-2xl shadow-lg">
        <div>
          <span className="text-xs uppercase tracking-widest text-emerald-300 font-semibold">
            Comunidad & Copropiedad Rural
          </span>
          <h1 className="text-2xl font-bold">{rawData.configuracion.nombreComunidad}</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={mesCorte}
            onChange={(e) => setMesCorte(e.target.value)}
            className="bg-emerald-900 text-white text-xs rounded-lg px-3 py-2 border border-emerald-700"
          >
            {rawData.meses.slice(-18).map((m) => (
              <option key={m} value={m}>
                Corte: {m}
              </option>
            ))}
          </select>
          <button
            onClick={() => setRol(rol === 'ADMIN' ? 'VECINO' : 'ADMIN')}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 text-stone-950"
          >
            Vista activa: {rol === 'ADMIN' ? 'Administrador / Comité' : 'Portal del Vecino'}
          </button>
        </div>
      </header>

      <nav className="max-w-7xl mx-auto mb-6 flex flex-wrap gap-2">
        {(['DASHBOARD', 'MATRIZ', 'MAPA', 'PROYECTOS', 'GOBERNANZA'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === t ? 'bg-emerald-900 text-white' : 'bg-white text-stone-700'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="max-w-7xl mx-auto">
        {tab === 'MATRIZ' && (
          <MatrizHistorica parcelas={parcelas} meses={rawData.meses} mesCorte={mesCorte} />
        )}
        {tab === 'MAPA' && (
          <MapaParcelas
            parcelas={parcelas}
            meses={rawData.meses}
            mesCorte={mesCorte}
            rolUsuario={rol}
          />
        )}
        {tab === 'GOBERNANZA' && (
          <GobernanzaActas
            actas={(rawData as any).actasAsamblea}
            votaciones={(rawData as any).votacionesAcuerdos}
            normas={(rawData as any).normasConvivencia}
            parcelaActiva={parcelaVecino}
            meses={rawData.meses}
            mesCorte={mesCorte}
          />
        )}
      </div>
    </main>
  );
}
