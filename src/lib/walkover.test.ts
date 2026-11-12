import { describe, it, expect } from 'vitest';
import { Match, Team, Category } from '@/types';
import { findWalkoverRests, walkoverRestNotice } from './walkover';

function team(id: string, name: string, withdrawn?: boolean): Team {
  return {
    id,
    name,
    shortName: name,
    category: 'Abierta Varones',
    logo: 'shield-default',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    delegate: '',
    phone: '',
    withdrawn,
  };
}

function match(id: string, home: string, away: string, status: Match['status'] = 'SCHEDULED'): Match {
  return {
    id,
    category: 'Abierta Varones' as Category,
    round: 1,
    date: '2026-11-14',
    time: '',
    stadium: '',
    homeTeamId: home,
    awayTeamId: away,
    homeScore: 0,
    awayScore: 0,
    status,
    homeLineup: [],
    awayLineup: [],
    events: [],
  };
}

const teams = [team('a', 'Lawyers'), team('b', 'Futleg'), team('c', 'Camaradas', true)];

describe('findWalkoverRests', () => {
  it('indica el equipo que descansa por jugar contra el retirado, sea local o visitante', () => {
    const rests = findWalkoverRests([match('m1', 'c', 'a'), match('m2', 'b', 'c'), match('m3', 'a', 'b')], teams);
    expect(rests.map((r) => [r.matchId, r.restingTeamName, r.withdrawnTeamName])).toEqual([
      ['m1', 'Lawyers', 'Camaradas'],
      ['m2', 'Futleg', 'Camaradas'],
    ]);
  });

  it('ignora el W.O. ya registrado', () => {
    expect(findWalkoverRests([match('m1', 'a', 'c', 'FINISHED')], teams)).toEqual([]);
  });

  it('arma el aviso con el pago de la programación', () => {
    const [rest] = findWalkoverRests([match('m1', 'a', 'c')], teams);
    expect(walkoverRestNotice(rest)).toBe(
      'Lawyers (Abierta Varones) descansa: su rival Camaradas se retiró del torneo. ' +
        'Para que se le asignen los puntos debe acreditar el valor de la programación.'
    );
  });
});
